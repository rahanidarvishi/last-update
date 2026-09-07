'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var validate = require('../utils/validate');

var router = express.Router();
var viewGuard = authMw.requirePermission('messenger', 'view');
var editGuard = authMw.requirePermission('messenger', 'edit');

var TASK_STATUSES = ['new', 'reviewing', 'in-progress', 'done'];
var LEAVE_STATUSES = ['pending', 'approved', 'rejected'];

function userMap(data) {
  var map = {};
  data.users.forEach(function (u) { map[u.id] = { id: u.id, username: u.username, fullName: u.fullName }; });
  return map;
}

function threadParticipants(data, threadId) {
  var root = data.messages.find(function (m) { return m.id === threadId; });
  if (root && Array.isArray(root.participantIds) && root.participantIds.length) return root.participantIds;
  // Legacy fallback for threads created before participantIds existed (or a
  // leave-request root, which never carries participantIds) — derive from
  // the sender/recipient of every message row in the thread.
  var ids = {};
  data.messages.filter(function (m) { return m.threadId === threadId; }).forEach(function (m) {
    ids[m.fromUserId] = true; if (m.toUserId) ids[m.toUserId] = true;
  });
  return Object.keys(ids);
}

// The rule the business owner asked for: only the sender and recipient(s) of a
// thread can see it, except users whose role has full message visibility
// (developer, or a manager role with canViewAllMessages) — EXCEPT for leave
// requests, which are always strictly sender/recipient-only (i.e. only the
// employee and the one manager the request was addressed to), regardless of
// canViewAllMessages, so a leave request never leaks to a manager outside
// that person's own chain.
function canSeeThread(currentUser, data, threadId, threadType) {
  if (currentUser.isDeveloper) return true;
  if (threadType !== 'leave' && currentUser.canViewAllMessages) return true;
  return threadParticipants(data, threadId).indexOf(currentUser.id) !== -1;
}

function findRoot(data, threadId) {
  return data.messages.find(function (m) { return m.id === threadId; });
}

router.get('/users', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  res.json({
    users: data.users.filter(function (u) { return u.active; })
      .map(function (u) { return { id: u.id, fullName: u.fullName, username: u.username }; })
  });
});

router.get('/threads', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var q = req.query || {};
  var uMap = userMap(data);
  var roots = data.messages.filter(function (m) { return !m.parentId; });
  roots = roots.filter(function (m) { return canSeeThread(req.currentUser, data, m.threadId, m.type); });
  if (q.type) roots = roots.filter(function (m) { return m.type === q.type; });
  if (q.status && q.status !== 'all') roots = roots.filter(function (m) { return m.status === q.status; });

  var decorated = roots.map(function (root) {
    var replies = data.messages.filter(function (m) { return m.parentId === root.threadId; });
    var last = replies.length ? replies.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); })[0] : root;
    var participants = threadParticipants(data, root.threadId).map(function (id) { return uMap[id]; }).filter(Boolean);
    return {
      threadId: root.threadId, type: root.type, subject: root.subject, voucherNumber: root.voucherNumber,
      status: root.status, fromUser: uMap[root.fromUserId] || null, toUser: uMap[root.toUserId] || null,
      participants: participants,
      leaveDetails: root.leaveDetails || null, replyCount: replies.length, lastMessageAt: last.createdAt,
      createdAt: root.createdAt
    };
  }).sort(function (a, b) { return b.lastMessageAt.localeCompare(a.lastMessageAt); });

  res.json({ threads: decorated });
});

router.get('/threads/:threadId', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var rootForVisibility = findRoot(data, req.params.threadId);
  if (!canSeeThread(req.currentUser, data, req.params.threadId, rootForVisibility && rootForVisibility.type)) {
    return res.status(403).json({ error: 'شما دسترسی دیدن این گفتگو را ندارید' });
  }
  var uMap = userMap(data);
  var all = data.messages.filter(function (m) { return m.threadId === req.params.threadId; })
    .sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); });
  var decorated = all.map(function (m) {
    return Object.assign({}, m, { fromUser: uMap[m.fromUserId] || null, toUser: uMap[m.toUserId] || null });
  });
  var participants = threadParticipants(data, req.params.threadId).map(function (id) { return uMap[id]; }).filter(Boolean);
  res.json({ messages: decorated, participants: participants, threadType: rootForVisibility ? rootForVisibility.type : null });
});

router.post('/threads', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var type = body.type === 'leave' ? 'leave' : 'task';
  var text = String(body.body || '').trim();
  var data = dbMod.db();

  var recipientIds;
  if (type === 'leave') {
    // Leave requests go strictly to the requester's own bound manager (set by
    // the developer in "سطح دسترسی") — the client-sent recipient is always
    // ignored (never used as a fallback) so it can't be routed to someone
    // else's manager, and can never be a group ticket. If no manager is set
    // for this user, that's a setup problem the developer must fix — we
    // must not silently accept a client-chosen recipient instead.
    if (!req.currentUser.managerId) {
      return res.status(400).json({ error: 'مدیر شما در سیستم تعریف نشده — با توسعه‌دهنده تماس بگیرید' });
    }
    recipientIds = [req.currentUser.managerId];
  } else {
    // Task messages can go to several people at once ("همزمان به چند نفر").
    var raw = Array.isArray(body.toUserIds) && body.toUserIds.length ? body.toUserIds : (body.toUserId ? [body.toUserId] : []);
    recipientIds = raw.filter(function (id, idx) { return raw.indexOf(id) === idx; }); // dedupe
  }
  var validRecipients = recipientIds.filter(function (id) { return data.users.some(function (u) { return u.id === id && u.active; }); });
  if (!validRecipients.length || validRecipients.length !== recipientIds.length) {
    return res.status(400).json({ error: 'گیرنده(های) معتبر انتخاب کنید' });
  }
  if (!text) return res.status(400).json({ error: 'متن پیام را وارد کنید' });

  var leaveDetails = null;
  if (type === 'leave') {
    var ld = body.leaveDetails || {};
    var sJy = parseInt(ld.startJy, 10), sJm = parseInt(ld.startJm, 10), sJd = parseInt(ld.startJd, 10);
    var eJy = parseInt(ld.endJy, 10), eJm = parseInt(ld.endJm, 10), eJd = parseInt(ld.endJd, 10);
    if (!validate.isValidJalaliDate(sJy, sJm, sJd) || !validate.isValidJalaliDate(eJy, eJm, eJd)) {
      return res.status(400).json({ error: 'تاریخ شروع و پایان مرخصی را معتبر انتخاب کنید' });
    }
    if ((eJy * 10000 + eJm * 100 + eJd) < (sJy * 10000 + sJm * 100 + sJd)) {
      return res.status(400).json({ error: 'تاریخ پایان مرخصی نمی‌تواند قبل از تاریخ شروع باشد' });
    }
    leaveDetails = {
      startJy: sJy, startJm: sJm, startJd: sJd,
      endJy: eJy, endJm: eJm, endJd: eJd,
      reason: String(ld.reason || '').trim()
    };
  }

  var participantIds = validRecipients.slice();
  if (participantIds.indexOf(req.currentUser.id) === -1) participantIds.push(req.currentUser.id);

  var id = uid('msg');
  var msg = {
    id: id, threadId: id, parentId: null,
    fromUserId: req.currentUser.id, toUserId: validRecipients[0], toUserIds: validRecipients, type: type,
    participantIds: participantIds,
    voucherNumber: String(body.voucherNumber || '').trim(), subject: String(body.subject || '').trim(),
    body: text, status: type === 'leave' ? 'pending' : 'new',
    leaveDetails: leaveDetails, createdAt: new Date().toISOString()
  };
  data.messages.push(msg);
  dbMod.saveSync();
  res.json({ message: msg });
});

// Add more people to an existing task ticket (not allowed for leave requests,
// which must always stay a strict 1:1 employee↔manager conversation). Any
// current participant can loop someone else in.
router.post('/threads/:threadId/participants', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var root = data.messages.find(function (m) { return m.id === req.params.threadId; });
  if (!root) return res.status(404).json({ error: 'گفتگو یافت نشد' });
  if (!canSeeThread(req.currentUser, data, req.params.threadId, root.type)) {
    return res.status(403).json({ error: 'دسترسی ندارید' });
  }
  if (root.type === 'leave') return res.status(400).json({ error: 'امکان افزودن نفر به درخواست مرخصی وجود ندارد' });

  var body = req.body || {};
  var addIds = Array.isArray(body.userIds) ? body.userIds : (body.userId ? [body.userId] : []);
  addIds = addIds.filter(function (id) { return data.users.some(function (u) { return u.id === id && u.active; }); });
  if (!addIds.length) return res.status(400).json({ error: 'کاربر معتبر انتخاب کنید' });

  if (!Array.isArray(root.participantIds) || !root.participantIds.length) {
    root.participantIds = threadParticipants(data, req.params.threadId); // migrate a legacy thread on first use
  }
  addIds.forEach(function (id) { if (root.participantIds.indexOf(id) === -1) root.participantIds.push(id); });
  dbMod.saveSync();

  var uMap = userMap(data);
  res.json({ participants: root.participantIds.map(function (id) { return uMap[id]; }).filter(Boolean) });
});

router.post('/threads/:threadId/replies', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var root = data.messages.find(function (m) { return m.id === req.params.threadId; });
  if (!root) return res.status(404).json({ error: 'گفتگو یافت نشد' });
  if (!canSeeThread(req.currentUser, data, req.params.threadId, root.type)) {
    return res.status(403).json({ error: 'شما دسترسی پاسخ به این گفتگو را ندارید' });
  }
  var text = String((req.body || {}).body || '').trim();
  if (!text) return res.status(400).json({ error: 'متن پاسخ را وارد کنید' });

  var replyTo = (req.body || {}).toUserId || (req.currentUser.id === root.fromUserId ? root.toUserId : root.fromUserId);
  var reply = {
    id: uid('msg'), threadId: root.threadId, parentId: root.threadId,
    fromUserId: req.currentUser.id, toUserId: replyTo, type: root.type,
    voucherNumber: root.voucherNumber, subject: root.subject, body: text,
    status: root.status, leaveDetails: null, createdAt: new Date().toISOString()
  };
  data.messages.push(reply);
  if (root.type === 'task' && root.status === 'new') root.status = 'reviewing';
  dbMod.saveSync();
  res.json({ message: reply });
});

router.patch('/threads/:threadId/status', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var root = data.messages.find(function (m) { return m.id === req.params.threadId; });
  if (!root) return res.status(404).json({ error: 'گفتگو یافت نشد' });
  if (!canSeeThread(req.currentUser, data, req.params.threadId, root.type)) {
    return res.status(403).json({ error: 'دسترسی ندارید' });
  }
  var status = (req.body || {}).status;
  var validSet = root.type === 'leave' ? LEAVE_STATUSES : TASK_STATUSES;
  if (validSet.indexOf(status) === -1) return res.status(400).json({ error: 'وضعیت نامعتبر است' });
  // Only the specific manager the leave request was addressed to (or the
  // developer) can approve/reject it — NOT any role with canViewAllMessages,
  // so approval stays inside that employee's own management chain.
  if (root.type === 'leave' && (status === 'approved' || status === 'rejected')) {
    var isRecipientOrDeveloper = req.currentUser.id === root.toUserId || req.currentUser.isDeveloper;
    if (!isRecipientOrDeveloper) return res.status(403).json({ error: 'فقط مدیر بخش یا توسعه‌دهنده می‌تواند مرخصی را تایید/رد کند' });
  }
  root.status = status;
  dbMod.saveSync();
  res.json({ ok: true });
});

module.exports = router;
