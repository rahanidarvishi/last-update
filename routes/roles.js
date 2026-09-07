'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var sensitiveLimiter = require('../middleware/rateLimiters');

var router = express.Router();

function requireDeveloper(req, res, next) {
  if (!req.currentUser) return res.status(401).json({ error: 'ابتدا وارد سیستم شوید' });
  if (!req.currentUser.isDeveloper) return res.status(403).json({ error: 'فقط توسعه‌دهنده به این بخش دسترسی دارد' });
  next();
}

router.get('/', authMw.attachUser, requireDeveloper, function (req, res) {
  var data = dbMod.db();
  res.json({ roles: data.roles, modules: dbMod.MODULES });
});

router.post('/', authMw.attachUser, requireDeveloper, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var body = req.body || {};
  var name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام سطح دسترسی را وارد کنید' });
  var data = dbMod.db();
  var role = {
    id: uid('role'), name: name, isDeveloper: false,
    permissions: dbMod.emptyPermissions(false, false),
    canViewAllMessages: false,
    roleCategory: null,
    createdAt: new Date().toISOString()
  };
  data.roles.push(role);
  dbMod.saveSync();
  res.json({ role: role });
});

// Full permission-matrix update — this is the endpoint the "سطح دسترسی"
// screen calls whenever a checkbox in the module × (view/edit) grid changes.
router.patch('/:id', authMw.attachUser, requireDeveloper, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var data = dbMod.db();
  var role = data.roles.find(function (r) { return r.id === req.params.id; });
  if (!role) return res.status(404).json({ error: 'سطح دسترسی یافت نشد' });
  if (role.isDeveloper) return res.status(400).json({ error: 'نقش توسعه‌دهنده همیشه دسترسی کامل دارد و قابل تغییر نیست' });

  var body = req.body || {};
  if (body.name != null) role.name = String(body.name).trim() || role.name;
  if (body.canViewAllMessages != null) role.canViewAllMessages = !!body.canViewAllMessages;
  // Which free-text "category" this role maps to elsewhere in the app (records/booking
  // forms used to have separate manually-typed "کانتر"/"کارشناس تأمین" lists — now those
  // lists are derived from whichever users have a role tagged with the matching category).
  if (body.roleCategory !== undefined) {
    var validCategories = ['counter', 'procurementExpert', null];
    var incomingCategory = body.roleCategory === '' ? null : body.roleCategory;
    if (validCategories.indexOf(incomingCategory) === -1) {
      return res.status(400).json({ error: 'دسته نقش نامعتبر است' });
    }
    role.roleCategory = incomingCategory;
  }
  if (body.permissions && typeof body.permissions === 'object') {
    dbMod.MODULES.forEach(function (m) {
      var incoming = body.permissions[m.key];
      if (!incoming) return;
      var view = !!incoming.view || !!incoming.edit; // edit implies view
      var edit = !!incoming.edit;
      role.permissions[m.key] = { view: view, edit: edit };
    });
  }
  dbMod.saveSync();
  res.json({ role: role });
});

router.delete('/:id', authMw.attachUser, requireDeveloper, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var data = dbMod.db();
  var role = data.roles.find(function (r) { return r.id === req.params.id; });
  if (!role) return res.status(404).json({ error: 'سطح دسترسی یافت نشد' });
  if (role.isDeveloper) return res.status(400).json({ error: 'نقش توسعه‌دهنده قابل حذف نیست' });
  if (data.users.some(function (u) { return u.roleId === role.id; })) {
    return res.status(400).json({ error: 'ابتدا کاربران این سطح دسترسی را به سطح دیگری منتقل کنید' });
  }
  data.roles = data.roles.filter(function (r) { return r.id !== role.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

module.exports = router;
