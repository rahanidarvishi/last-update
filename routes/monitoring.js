'use strict';
var express = require('express');
var os = require('os');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var knex = require('../sql/knex').knex;

var router = express.Router();
var viewGuard = authMw.requirePermission('monitoring', 'view');
var editGuard = authMw.requirePermission('monitoring', 'edit');

var ONLINE_WINDOW_MS = 5 * 60 * 1000; // considered "online now" if active in the last 5 minutes

router.get('/overview', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var now = Date.now();
  var onlineUsers = data.users.filter(function (u) {
    return u.active && u.lastActiveAt && (now - new Date(u.lastActiveAt).getTime()) < ONLINE_WINDOW_MS;
  }).map(function (u) { return { id: u.id, fullName: u.fullName, username: u.username, lastActiveAt: u.lastActiveAt }; });

  var todayStr = new Date().toISOString().slice(0, 10);
  var loginsToday = data.loginLogs.filter(function (l) { return l.success && l.at.slice(0, 10) === todayStr; }).length;
  var failedToday = data.loginLogs.filter(function (l) { return !l.success && l.at.slice(0, 10) === todayStr; }).length;

  Promise.all([
    knex('records').count({ c: 'id' }).first(),
    knex('tour_bookings').where('status', '!=', 'cancelled').count({ c: 'id' }).first()
  ])
    .then(function (rows) {
      res.json({
        server: {
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          platform: os.platform() + ' ' + os.release(),
          memory: {
            rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            totalMb: Math.round(os.totalmem() / 1024 / 1024),
            freeMb: Math.round(os.freemem() / 1024 / 1024)
          },
          loadAvg: os.loadavg()
        },
        counts: {
          users: data.users.filter(function (u) { return u.active; }).length,
          records: rows[0] ? rows[0].c : 0,
          tourBookings: rows[1] ? rows[1].c : 0,
          loginsToday: loginsToday,
          failedLoginsToday: failedToday
        },
        onlineUsers: onlineUsers
      });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت آمار' }); });
});

router.get('/logins', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var q = req.query || {};
  var list = data.loginLogs.slice().sort(function (a, b) { return b.at.localeCompare(a.at); });
  if (q.username) list = list.filter(function (l) { return l.username === q.username; });
  if (q.status === 'success') list = list.filter(function (l) { return l.success; });
  if (q.status === 'failed') list = list.filter(function (l) { return !l.success; });
  var limit = Math.min(parseInt(q.limit, 10) || 200, 1000);
  res.json({ logins: list.slice(0, limit), total: list.length });
});

router.get('/notification-settings', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  // Never send the bot token back in full to the browser after it's saved —
  // show only enough to confirm something is configured.
  var ns = data.notificationSettings;
  res.json({
    notifyOnLogin: ns.notifyOnLogin,
    telegramChatId: ns.telegramChatId,
    telegramBotTokenSet: !!ns.telegramBotToken
  });
});

router.post('/notification-settings', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var data = dbMod.db();
  if (body.telegramBotToken) data.notificationSettings.telegramBotToken = String(body.telegramBotToken).trim();
  if (body.telegramChatId != null) data.notificationSettings.telegramChatId = String(body.telegramChatId).trim();
  if (body.notifyOnLogin != null) data.notificationSettings.notifyOnLogin = !!body.notifyOnLogin;
  dbMod.saveSync();
  res.json({ ok: true });
});

module.exports = router;
