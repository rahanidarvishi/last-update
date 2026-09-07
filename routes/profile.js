'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');

var router = express.Router();

router.get('/me', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var data = dbMod.db();
  var u = data.users.find(function (x) { return x.id === req.currentUser.id; });
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد' });
  res.json({
    profile: {
      id: u.id, username: u.username, fullName: u.fullName,
      extension: u.extension || '', position: u.position || '',
      photoDataUrl: u.photoDataUrl || '', roleName: req.currentUser.roleName
    }
  });
});

// Only a genuine base64 image data URL is accepted — this is what stops
// someone from storing arbitrary HTML/JS in photoDataUrl and having it get
// rendered unescaped (as an <img src="..."> attribute) anywhere the app
// shows this person's avatar (status board, messenger, shifts, profile).
var IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// The ONLY thing a user can change about their own profile — everything else
// (name, extension, position) is set by the developer from "سطح دسترسی".
router.post('/me/photo', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var dataUrl = String((req.body || {}).photoDataUrl || '');
  if (dataUrl && dataUrl.length > 1500000) {
    return res.status(400).json({ error: 'حجم عکس زیاد است — لطفاً تصویر کوچک‌تری انتخاب کنید' });
  }
  if (dataUrl && !IMAGE_DATA_URL_RE.test(dataUrl)) {
    return res.status(400).json({ error: 'فرمت عکس نامعتبر است' });
  }
  var data = dbMod.db();
  var u = data.users.find(function (x) { return x.id === req.currentUser.id; });
  if (!u) return res.status(404).json({ error: 'کاربر یافت نشد' });
  u.photoDataUrl = dataUrl;
  dbMod.saveSync();
  res.json({ ok: true, photoDataUrl: u.photoDataUrl });
});

module.exports = router;
