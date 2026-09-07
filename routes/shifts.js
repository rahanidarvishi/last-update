'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var validate = require('../utils/validate');
var jalali = require('../utils/jalali');

var router = express.Router();
var viewGuard = authMw.requirePermission('shifts', 'view');
var editGuard = authMw.requirePermission('shifts', 'edit');

// Persian week index for a Jalali date: 0=شنبه ... 6=جمعه (mirrors the
// convention used by the calendar widget on the frontend).
function persianWeekday(jy, jm, jd) {
  var g = jalali.toGregorian(jy, jm, jd);
  var jsDay = new Date(g.gy, g.gm - 1, g.gd).getDay(); // 0=Sunday
  return (jsDay + 1) % 7;
}

// Inclusive list of {jy,jm,jd} between two Jalali dates, walked via the
// Julian day number so month/year rollovers "just work".
function jalaliDateRange(from, to) {
  var out = [];
  var startJdn = jalali.j2d(from.jy, from.jm, from.jd);
  var endJdn = jalali.j2d(to.jy, to.jm, to.jd);
  for (var jdn = startJdn; jdn <= endJdn; jdn++) {
    var d = jalali.d2j(jdn);
    out.push({ jy: d.jy, jm: d.jm, jd: d.jd });
  }
  return out;
}

// "My staff" = users whose managerId points at me (set from "سطح دسترسی" per user).
// The developer is treated as everyone's manager for this purpose, so they can
// schedule/view shifts for anyone without needing to be set as managerId.
function directReportIds(data, managerUserId) {
  return data.users.filter(function (u) { return u.managerId === managerUserId; }).map(function (u) { return u.id; });
}

function publicShift(s, uMap) {
  return {
    id: s.id, userId: s.userId, userName: uMap[s.userId] ? uMap[s.userId].fullName : '—',
    jy: s.jy, jm: s.jm, jd: s.jd, startTime: s.startTime, endTime: s.endTime, note: s.note,
    createdBy: s.createdBy, createdByName: uMap[s.createdBy] ? uMap[s.createdBy].fullName : '—',
    createdAt: s.createdAt
  };
}

// GET / — own shifts, plus (if I manage anyone) my team's shifts, plus the list
// of staff I'm allowed to schedule for (so the frontend can build the picker).
router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var uMap = {};
  data.users.forEach(function (u) { uMap[u.id] = u; });

  var reportIds = req.currentUser.isDeveloper
    ? data.users.filter(function (u) { return u.id !== req.currentUser.id; }).map(function (u) { return u.id; })
    : directReportIds(data, req.currentUser.id);

  var visible = data.shifts.filter(function (s) {
    return s.userId === req.currentUser.id || reportIds.indexOf(s.userId) !== -1;
  });

  var myStaff = data.users.filter(function (u) {
    return u.active && u.id !== req.currentUser.id && reportIds.indexOf(u.id) !== -1;
  }).map(function (u) { return { id: u.id, fullName: u.fullName }; });

  res.json({
    shifts: visible.map(function (s) { return publicShift(s, uMap); }),
    myStaff: myStaff,
    canManageAnyone: !!req.currentUser.isDeveloper
  });
});

router.post('/', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var data = dbMod.db();
  var targetUser = data.users.find(function (u) { return u.id === body.userId && u.active; });
  if (!targetUser) return res.status(400).json({ error: 'نیروی موردنظر را انتخاب کنید' });

  var allowed = req.currentUser.isDeveloper || targetUser.managerId === req.currentUser.id;
  if (!allowed) return res.status(403).json({ error: 'فقط می‌توانید برای نیروهای زیرمجموعه خودتان شیفت تعریف کنید' });

  var jy = parseInt(body.jy, 10), jm = parseInt(body.jm, 10), jd = parseInt(body.jd, 10);
  var startTime = String(body.startTime || '').trim();
  var endTime = String(body.endTime || '').trim();
  if (!validate.isValidJalaliDate(jy, jm, jd)) {
    return res.status(400).json({ error: 'تاریخ شیفت معتبر نیست' });
  }
  if (!validate.isValidTimeStr(startTime) || !validate.isValidTimeStr(endTime)) {
    return res.status(400).json({ error: 'ساعت شروع و پایان باید به‌صورت HH:MM (مثلاً 09:00) باشد' });
  }

  var shift = {
    id: uid('shift'), userId: targetUser.id, jy: jy, jm: jm, jd: jd,
    startTime: startTime, endTime: endTime, note: String(body.note || '').trim(),
    createdBy: req.currentUser.id, createdAt: new Date().toISOString()
  };
  data.shifts.push(shift);
  dbMod.saveSync();

  var uMap = {}; data.users.forEach(function (u) { uMap[u.id] = u; });
  res.json({ shift: publicShift(shift, uMap) });
});

// POST /bulk — lay out shifts across a date range in one go: pick which
// weekdays get a shift (leave empty for "every day"), a start/end date,
// and one start/end time + note applied to every generated day. Used for
// both the "weekly" and "monthly" pickers on the frontend — they just
// differ in what range they pre-fill. Individual days can still be
// edited/deleted afterward via PATCH/DELETE below, which is how someone
// "corrects" a couple of days after laying out a whole month at once.
var MAX_BULK_DAYS = 366;

router.post('/bulk', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var data = dbMod.db();
  var targetUser = data.users.find(function (u) { return u.id === body.userId && u.active; });
  if (!targetUser) return res.status(400).json({ error: 'نیروی موردنظر را انتخاب کنید' });

  var allowed = req.currentUser.isDeveloper || targetUser.managerId === req.currentUser.id;
  if (!allowed) return res.status(403).json({ error: 'فقط می‌توانید برای نیروهای زیرمجموعه خودتان شیفت تعریف کنید' });

  var from = body.from || {}, to = body.to || {};
  var fy = parseInt(from.jy, 10), fm = parseInt(from.jm, 10), fd = parseInt(from.jd, 10);
  var ty = parseInt(to.jy, 10), tm = parseInt(to.jm, 10), td = parseInt(to.jd, 10);
  if (!validate.isValidJalaliDate(fy, fm, fd) || !validate.isValidJalaliDate(ty, tm, td)) {
    return res.status(400).json({ error: 'بازهٔ تاریخ معتبر نیست' });
  }
  if (jalali.j2d(ty, tm, td) < jalali.j2d(fy, fm, fd)) {
    return res.status(400).json({ error: 'تاریخ پایان باید بعد از تاریخ شروع باشد' });
  }

  var startTime = String(body.startTime || '').trim();
  var endTime = String(body.endTime || '').trim();
  if (!validate.isValidTimeStr(startTime) || !validate.isValidTimeStr(endTime)) {
    return res.status(400).json({ error: 'ساعت شروع و پایان باید به‌صورت HH:MM (مثلاً 09:00) باشد' });
  }
  var note = String(body.note || '').trim();

  // weekdays: 0=شنبه..6=جمعه. Empty/omitted = every day in the range
  // (this is what "monthly" uses by default).
  var weekdays = Array.isArray(body.weekdays)
    ? body.weekdays.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return n >= 0 && n <= 6; })
    : [];

  var overwrite = !!body.overwrite;

  var dates = jalaliDateRange({ jy: fy, jm: fm, jd: fd }, { jy: ty, jm: tm, jd: td });
  if (dates.length > MAX_BULK_DAYS) {
    return res.status(400).json({ error: 'بازهٔ انتخابی خیلی بزرگ است' });
  }
  if (weekdays.length) {
    dates = dates.filter(function (d) { return weekdays.indexOf(persianWeekday(d.jy, d.jm, d.jd)) !== -1; });
  }

  var created = [], updated = [], skipped = 0;
  dates.forEach(function (d) {
    var existing = data.shifts.find(function (s) {
      return s.userId === targetUser.id && s.jy === d.jy && s.jm === d.jm && s.jd === d.jd;
    });
    if (existing) {
      if (!overwrite) { skipped++; return; }
      existing.startTime = startTime; existing.endTime = endTime; existing.note = note;
      existing.createdBy = req.currentUser.id; existing.createdAt = new Date().toISOString();
      updated.push(existing);
      return;
    }
    var shift = {
      id: uid('shift'), userId: targetUser.id, jy: d.jy, jm: d.jm, jd: d.jd,
      startTime: startTime, endTime: endTime, note: note,
      createdBy: req.currentUser.id, createdAt: new Date().toISOString()
    };
    data.shifts.push(shift);
    created.push(shift);
  });

  if (created.length || updated.length) dbMod.saveSync();

  var uMap = {}; data.users.forEach(function (u) { uMap[u.id] = u; });
  res.json({
    created: created.map(function (s) { return publicShift(s, uMap); }),
    updated: updated.map(function (s) { return publicShift(s, uMap); }),
    skipped: skipped
  });
});

// PATCH /:id — correct a single already-scheduled day (time/note) without
// deleting and re-adding it. This is the "fix a couple of days after
// laying out the whole month" path.
router.patch('/:id', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var data = dbMod.db();
  var shift = data.shifts.find(function (s) { return s.id === req.params.id; });
  if (!shift) return res.status(404).json({ error: 'شیفت یافت نشد' });
  var targetUser = data.users.find(function (u) { return u.id === shift.userId; });
  var allowed = req.currentUser.isDeveloper ||
    shift.createdBy === req.currentUser.id ||
    (targetUser && targetUser.managerId === req.currentUser.id);
  if (!allowed) return res.status(403).json({ error: 'دسترسی ویرایش این شیفت را ندارید' });

  var startTime = String(body.startTime || '').trim();
  var endTime = String(body.endTime || '').trim();
  if (!validate.isValidTimeStr(startTime) || !validate.isValidTimeStr(endTime)) {
    return res.status(400).json({ error: 'ساعت شروع و پایان باید به‌صورت HH:MM (مثلاً 09:00) باشد' });
  }
  shift.startTime = startTime;
  shift.endTime = endTime;
  shift.note = String(body.note || '').trim();
  dbMod.saveSync();

  var uMap = {}; data.users.forEach(function (u) { uMap[u.id] = u; });
  res.json({ shift: publicShift(shift, uMap) });
});

router.delete('/:id', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var shift = data.shifts.find(function (s) { return s.id === req.params.id; });
  if (!shift) return res.status(404).json({ error: 'شیفت یافت نشد' });
  var targetUser = data.users.find(function (u) { return u.id === shift.userId; });
  var allowed = req.currentUser.isDeveloper ||
    shift.createdBy === req.currentUser.id ||
    (targetUser && targetUser.managerId === req.currentUser.id);
  if (!allowed) return res.status(403).json({ error: 'دسترسی حذف این شیفت را ندارید' });
  data.shifts = data.shifts.filter(function (s) { return s.id !== req.params.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

module.exports = router;
