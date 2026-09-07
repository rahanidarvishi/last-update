'use strict';
var express = require('express');
var bcrypt = require('bcryptjs');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var validate = require('../utils/validate');
var sensitiveLimiter = require('../middleware/rateLimiters');

var router = express.Router();

// Every route here is developer-only: user & role management IS the
// "سطح دسترسی" section the business owner said only they should touch.
function requireDeveloper(req, res, next) {
  if (!req.currentUser) return res.status(401).json({ error: 'ابتدا وارد سیستم شوید' });
  if (!req.currentUser.isDeveloper) return res.status(403).json({ error: 'فقط توسعه‌دهنده به این بخش دسترسی دارد' });
  next();
}

function publicUser(u, roles) {
  var role = roles.find(function (r) { return r.id === u.roleId; });
  return {
    id: u.id, username: u.username, fullName: u.fullName, active: u.active,
    roleId: u.roleId, roleName: role ? role.name : '—', mustChangePassword: !!u.mustChangePassword,
    managerId: u.managerId || null, extension: u.extension || '', position: u.position || '',
    photoDataUrl: u.photoDataUrl || '',
    createdAt: u.createdAt
  };
}

// Public-ish directory (name/photo/extension/position only) — available to ANY
// logged-in user, not just the developer, so a photo/name/extension can be
// looked up and shown next to a person anywhere in the app (status board,
// messenger, shifts...). Deliberately excludes username/role/managerId.
router.get('/directory', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var data = dbMod.db();
  res.json({
    users: data.users.filter(function (u) { return u.active; }).map(function (u) {
      return { id: u.id, fullName: u.fullName, extension: u.extension || '', position: u.position || '', photoDataUrl: u.photoDataUrl || '' };
    })
  });
});

router.get('/', authMw.attachUser, requireDeveloper, function (req, res) {
  var data = dbMod.db();
  res.json({ users: data.users.map(function (u) { return publicUser(u, data.roles); }) });
});

router.post('/', authMw.attachUser, requireDeveloper, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var body = req.body || {};
  var username = String(body.username || '').trim();
  var password = String(body.password || '');
  var fullName = String(body.fullName || '').trim();
  var roleId = String(body.roleId || '');
  if (!username || !password || !fullName || !roleId) {
    return res.status(400).json({ error: 'همه فیلدها الزامی است' });
  }
  var pwErr = validate.passwordPolicyError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  var data = dbMod.db();
  if (data.users.some(function (u) { return u.username === username; })) {
    return res.status(400).json({ error: 'این نام کاربری قبلاً استفاده شده' });
  }
  if (!data.roles.some(function (r) { return r.id === roleId; })) {
    return res.status(400).json({ error: 'سطح دسترسی انتخاب‌شده معتبر نیست' });
  }
  var newUser = {
    id: uid('user'), username: username, passwordHash: bcrypt.hashSync(password, 12),
    fullName: fullName, roleId: roleId, active: true, mustChangePassword: true,
    managerId: body.managerId || null,
    extension: String(body.extension || '').trim(),
    position: String(body.position || '').trim(),
    photoDataUrl: '',
    createdAt: new Date().toISOString()
  };
  if (newUser.managerId && !data.users.some(function (u) { return u.id === newUser.managerId; })) {
    return res.status(400).json({ error: 'مدیر انتخاب‌شده معتبر نیست' });
  }
  data.users.push(newUser);
  dbMod.saveSync();
  res.json({ user: publicUser(newUser, data.roles) });
});

router.patch('/:id', authMw.attachUser, requireDeveloper, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var data = dbMod.db();
  var u = data.users.find(function (x) { return x.id === req.params.id; });
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد' });
  var body = req.body || {};
  if (body.fullName != null) u.fullName = String(body.fullName).trim();
  if (body.roleId != null) {
    if (!data.roles.some(function (r) { return r.id === body.roleId; })) {
      return res.status(400).json({ error: 'سطح دسترسی نامعتبر است' });
    }
    u.roleId = body.roleId;
  }
  if (body.active != null) u.active = !!body.active;
  if (body.extension != null) u.extension = String(body.extension).trim();
  if (body.position != null) u.position = String(body.position).trim();
  if (body.managerId !== undefined) {
    var newManagerId = body.managerId || null;
    if (newManagerId === u.id) return res.status(400).json({ error: 'کاربر نمی‌تواند مدیر خودش باشد' });
    if (newManagerId && !data.users.some(function (x) { return x.id === newManagerId; })) {
      return res.status(400).json({ error: 'مدیر انتخاب‌شده معتبر نیست' });
    }
    u.managerId = newManagerId;
  }
  if (body.newPassword) {
    var pwErr2 = validate.passwordPolicyError(String(body.newPassword));
    if (pwErr2) return res.status(400).json({ error: pwErr2 });
    u.passwordHash = bcrypt.hashSync(String(body.newPassword), 12);
    u.mustChangePassword = true;
  }
  dbMod.saveSync();
  res.json({ user: publicUser(u, data.roles) });
});

router.delete('/:id', authMw.attachUser, requireDeveloper, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var data = dbMod.db();
  var u = data.users.find(function (x) { return x.id === req.params.id; });
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد' });
  var role = data.roles.find(function (r) { return r.id === u.roleId; });
  if (role && role.isDeveloper) {
    var otherDevs = data.users.filter(function (x) {
      var r2 = data.roles.find(function (rr) { return rr.id === x.roleId; });
      return x.id !== u.id && r2 && r2.isDeveloper && x.active;
    });
    if (!otherDevs.length) return res.status(400).json({ error: 'حداقل یک کاربر توسعه‌دهنده فعال باید باقی بماند' });
  }
  // Hard delete removes the user record entirely, but other users' managerId
  // (used to route leave requests — see routes/messenger.js) may still point
  // at this id. Leaving that dangling would silently break their leave
  // requests later (routed to a manager that no longer exists) with no
  // obvious error. Clear those references; the developer can reassign a new
  // manager afterward. (Deactivating instead of hard-deleting avoids this
  // entirely and is preferred where possible.)
  data.users.forEach(function (x) {
    if (x.managerId === req.params.id) x.managerId = null;
  });
  data.users = data.users.filter(function (x) { return x.id !== req.params.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

module.exports = router;
