'use strict';
var express = require('express');
var bcrypt = require('bcryptjs');
var fs = require('fs');
var path = require('path');
var rateLimit = require('express-rate-limit');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var validate = require('../utils/validate');
var sensitiveLimiter = require('../middleware/rateLimiters');

var router = express.Router();
// Same DARVISHI_DATA_DIR override as db.js, so this always points at the
// same data directory db.js actually wrote the credentials file into.
var CREDENTIALS_FILE = path.join(process.env.DARVISHI_DATA_DIR || path.join(__dirname, '..', 'data'), 'INITIAL_DEVELOPER_CREDENTIALS.txt');

// Security checklist item: rate-limit the login endpoint against brute force.
// Keyed by IP; a genuine user mistyping a password a few times is unaffected,
// but a scripted attacker hammering the endpoint gets throttled hard.
var loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد تلاش‌های ورود بیش از حد مجاز بود — چند دقیقه دیگر دوباره امتحان کنید' }
});

// Simple math captcha — intentionally not "advanced" per the request, just
// enough to block trivial scripted login attempts. The correct answer is
// kept server-side in the session, never sent to the client.
router.get('/captcha', function (req, res) {
  var a = 1 + Math.floor(Math.random() * 9);
  var b = 1 + Math.floor(Math.random() * 9);
  var ops = ['+', '-'];
  var op = ops[Math.floor(Math.random() * ops.length)];
  var answer = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
  var question = (op === '+') ? (a + ' + ' + b) : (Math.max(a, b) + ' - ' + Math.min(a, b));
  req.session.captchaAnswer = answer;
  res.json({ question: question + ' = ?' });
});

function logLoginAttempt(data, username, userId, req, success, failReason) {
  var entry = {
    id: uid('login'), at: new Date().toISOString(), username: username, userId: userId || null,
    ip: req.ip, userAgent: req.get('User-Agent') || '', success: !!success, failReason: failReason || ''
  };
  data.loginLogs.push(entry);
  // Login history can grow forever on a busy system — keep the most recent
  // 5000 entries so the JSON file doesn't grow unbounded over years of use.
  if (data.loginLogs.length > 5000) data.loginLogs = data.loginLogs.slice(-5000);
  return entry;
}

// Fire-and-forget Telegram push notification — lets the developer know the
// instant anyone logs in, any hour of the day, without having the app open.
// Silently does nothing if not configured; never blocks or fails the login.
function notifyTelegramLogin(data, user, req) {
  var ns = data.notificationSettings;
  if (!ns || !ns.notifyOnLogin || !ns.telegramBotToken || !ns.telegramChatId) return;
  var text = '🔐 ورود به سیستم اتوماسیون داخلی\n' +
    'کاربر: ' + user.fullName + ' (' + user.username + ')\n' +
    'زمان: ' + new Date().toLocaleString('fa-IR') + '\n' +
    'IP: ' + req.ip;
  var url = 'https://api.telegram.org/bot' + ns.telegramBotToken + '/sendMessage';
  fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ns.telegramChatId, text: text })
  }).catch(function (e) { console.error('Telegram notification failed:', e.message); });
}

router.post('/login', loginLimiter, function (req, res) {
  var body = req.body || {};
  var username = String(body.username || '').trim();
  var password = String(body.password || '');
  var captcha = String(body.captcha || '').trim();
  var data = dbMod.db();

  if (req.session.captchaAnswer == null) {
    return res.status(400).json({ error: 'ابتدا کد امنیتی را دریافت کنید (صفحه را رفرش کنید)' });
  }
  if (captcha === '' || parseInt(captcha, 10) !== req.session.captchaAnswer) {
    req.session.captchaAnswer = null;
    logLoginAttempt(data, username, null, req, false, 'کد امنیتی اشتباه');
    dbMod.saveSync();
    return res.status(400).json({ error: 'کد امنیتی اشتباه است', captchaFailed: true });
  }
  req.session.captchaAnswer = null;

  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور را وارد کنید' });
  }

  var user = data.users.find(function (u) { return u.username === username; });
  if (!user || !user.active || !bcrypt.compareSync(password, user.passwordHash)) {
    logLoginAttempt(data, username, user ? user.id : null, req, false, !user ? 'کاربر یافت نشد' : (!user.active ? 'کاربر غیرفعال' : 'رمز اشتباه'));
    dbMod.saveSync();
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است' });
  }

  logLoginAttempt(data, username, user.id, req, true, '');
  dbMod.saveSync();
  notifyTelegramLogin(data, user, req);

  // Regenerate the session (new ID) on every successful login — standard
  // defense against session fixation (an attacker pre-setting a session ID
  // for the victim before they authenticate). Everything the pre-login
  // session held (captchaAnswer) was already consumed above, so nothing is
  // lost by starting fresh here.
  req.session.regenerate(function (regenErr) {
    if (regenErr) return res.status(500).json({ error: 'خطا در ایجاد نشست' });
    req.session.userId = user.id;
    req.session.save(function () {
      var found = authMw.getUserWithRole(user.id);
      res.json({
        ok: true,
        user: {
          id: user.id, username: user.username, fullName: user.fullName,
          roleName: found.role.name, isDeveloper: !!found.role.isDeveloper,
          mustChangePassword: !!user.mustChangePassword
        }
      });
    });
  });
});

router.post('/logout', function (req, res) {
  req.session.destroy(function () { res.json({ ok: true }); });
});

router.get('/me', authMw.attachUser, function (req, res) {
  if (!req.currentUser) return res.json({ user: null });
  res.json({ user: req.currentUser });
});

router.post('/change-password', authMw.attachUser, authMw.requireAuth, sensitiveLimiter.sensitiveActionLimiter, function (req, res) {
  var body = req.body || {};
  var currentPassword = String(body.currentPassword || '');
  var newPassword = String(body.newPassword || '');
  var pwErr = validate.passwordPolicyError(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });

  var data = dbMod.db();
  var user = data.users.find(function (u) { return u.id === req.currentUser.id; });
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'رمز فعلی نادرست است' });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 12);
  var wasMustChange = user.mustChangePassword;
  user.mustChangePassword = false;
  dbMod.saveSync();

  // Security checklist item: once the developer has actually set their own
  // password, the plaintext initial-password file has served its purpose —
  // remove it so it isn't sitting on disk indefinitely.
  if (wasMustChange) {
    try { if (fs.existsSync(CREDENTIALS_FILE)) fs.unlinkSync(CREDENTIALS_FILE); } catch (e) { /* best effort */ }
  }
  res.json({ ok: true });
});

module.exports = router;
