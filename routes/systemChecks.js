'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var systemChecks = require('../utils/systemChecks');
var sensitiveLimiter = require('../middleware/rateLimiters');

var router = express.Router();
var MAX_HISTORY = 30;

function requireDeveloper(req, res, next) {
  if (!req.currentUser) return res.status(401).json({ error: 'ابتدا وارد سیستم شوید' });
  if (!req.currentUser.isDeveloper) return res.status(403).json({ error: 'فقط توسعه‌دهنده به این بخش دسترسی دارد' });
  next();
}

// GET / — لیست آزمون‌های موجود (برای چک‌باکس‌های انتخاب) + تاریخچه‌ی اجراهای قبلی.
router.get('/', authMw.attachUser, requireDeveloper, function (req, res) {
  var data = dbMod.db();
  var catalogue = systemChecks.listAllChecks();
  res.json({ checks: catalogue.checks, runs: data.systemCheckRuns || [] });
});

// POST /run — اجرای فوری («اجرای الان»). چون این درخواست از یک نشست واقعی و
// لاگین‌شده می‌آید، همیشه تست کارکرد صفحات (HTTP) را هم شامل می‌شود — برخلاف
// اجرای شبانه‌ی خودکار که چنین نشستی ندارد. body.onlyKeys اختیاری است: اگر
// بیاید فقط همان آزمون‌های انتخاب‌شده اجرا می‌شوند («هر قسمتی که بخوام»).
router.post('/run', authMw.attachUser, requireDeveloper, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var body = req.body || {};
  var onlyKeys = Array.isArray(body.onlyKeys) && body.onlyKeys.length ? body.onlyKeys : null;
  var port = process.env.PORT || 3000;

  systemChecks.runAll({ includeHttp: true, port: port, cookie: req.headers.cookie, onlyKeys: onlyKeys })
    .then(function (run) {
      var data = dbMod.db();
      run.id = uid('chk');
      run.triggeredBy = 'manual';
      data.systemCheckRuns.unshift(run);
      if (data.systemCheckRuns.length > MAX_HISTORY) data.systemCheckRuns.length = MAX_HISTORY;
      dbMod.saveSync();
      res.json({ run: run });
    })
    .catch(function (e) {
      console.error('اجرای دستی تست سیستم با خطا مواجه شد:', e);
      res.status(500).json({ error: 'اجرای تست با خطا مواجه شد' });
    });
});

module.exports = router;
