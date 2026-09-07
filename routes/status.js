'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var jalali = require('../utils/jalali');

var router = express.Router();
var viewGuard = authMw.requirePermission('statusBoard', 'view');
var editGuard = authMw.requirePermission('statusBoard', 'edit');

// A curated set of quick-pick work statuses and moods — kept short and fun,
// per the request that this feature should feel playful, not corporate.
var STATUS_PRESETS = [
  { emoji: '✅', text: 'پای میزم' },
  { emoji: '⏳', text: 'مشغول کارم، صبر کن' },
  { emoji: '🚶', text: 'رفتم بیرون، برمی‌گردم' },
  { emoji: '📞', text: 'در تماس/جلسه‌ام' },
  { emoji: '🍵', text: 'رفتم یه چای بیارم' },
  { emoji: '🧠', text: 'در حال تمرکز عمیق — مزاحم نشید' }
];
var MOOD_PRESETS = [
  { emoji: '😄', text: 'امروز روز خوبیه، بیاید سراغم' },
  { emoji: '😐', text: 'امروز بی‌حوصله‌ام، دوروبرم نگردید' },
  { emoji: '🥰', text: 'امروز مود مهربونم' },
  { emoji: '😤', text: 'امروز حوصله شوخی ندارم' },
  { emoji: '🚀', text: 'امروز پرانرژی‌ام، بزن بریم' },
  { emoji: '☕', text: 'هنوز قهوه‌ام رو نخوردم، احتیاط کنید' }
];

function isOnApprovedLeaveToday(messages, userId) {
  var t = jalali.todayJalali();
  var todayKey = jalali.dateKey(t.jy, t.jm, t.jd);
  var roots = messages.filter(function (m) {
    return !m.parentId && m.type === 'leave' && m.status === 'approved' && m.fromUserId === userId && m.leaveDetails;
  });
  for (var i = 0; i < roots.length; i++) {
    var ld = roots[i].leaveDetails;
    var startKey = jalali.dateKey(ld.startJy, ld.startJm, ld.startJd);
    var endKey = jalali.dateKey(ld.endJy, ld.endJm, ld.endJd);
    if (todayKey >= startKey && todayKey <= endKey) return true;
  }
  return false;
}

router.get('/presets', authMw.attachUser, viewGuard, function (req, res) {
  res.json({ statusPresets: STATUS_PRESETS, moodPresets: MOOD_PRESETS });
});

router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var board = data.users.filter(function (u) { return u.active; }).map(function (u) {
    var entry = data.userStatuses.find(function (s) { return s.userId === u.id; });
    var onLeave = isOnApprovedLeaveToday(data.messages, u.id);
    return {
      userId: u.id, fullName: u.fullName,
      statusEmoji: onLeave ? '🌴' : (entry ? entry.statusEmoji : '✅'),
      statusText: onLeave ? 'مرخصی است' : (entry ? entry.statusText : 'پای میزم'),
      moodEmoji: entry ? entry.moodEmoji : '',
      moodText: entry ? entry.moodText : '',
      onLeave: onLeave,
      isSelf: u.id === req.currentUser.id,
      updatedAt: entry ? entry.updatedAt : null
    };
  });
  // Put the current user's own card first for quick access, then most-recently-updated others.
  board.sort(function (a, b) {
    if (a.isSelf) return -1;
    if (b.isSelf) return 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  res.json({ board: board });
});

router.patch('/me', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var data = dbMod.db();
  var entry = data.userStatuses.find(function (s) { return s.userId === req.currentUser.id; });
  if (!entry) {
    entry = { userId: req.currentUser.id, statusEmoji:'✅', statusText:'پای میزم', moodEmoji:'', moodText:'', updatedAt: new Date().toISOString() };
    data.userStatuses.push(entry);
  }
  if (body.statusEmoji != null) entry.statusEmoji = String(body.statusEmoji).slice(0, 8);
  if (body.statusText != null) entry.statusText = String(body.statusText).slice(0, 80).trim();
  if (body.moodEmoji != null) entry.moodEmoji = String(body.moodEmoji).slice(0, 8);
  if (body.moodText != null) entry.moodText = String(body.moodText).slice(0, 120).trim();
  entry.updatedAt = new Date().toISOString();
  dbMod.saveSync();
  res.json({ ok: true, entry: entry });
});

module.exports = router;
