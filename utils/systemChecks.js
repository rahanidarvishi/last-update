'use strict';
/* =========================================================================
   خودآزمایی سیستم — «تست خودکار» که فقط توسعه‌دهنده می‌بیند (routes/systemChecks.js).

   سه دسته آزمون:
   - DATA_CHECKS: روی داده‌ای که همین الان در حافظه است (db.js) اجرا می‌شوند —
     سریع، بدون I/O اضافه.
   - SQL_CHECKS: به دیتابیس SQL جداگانه (records/pendingDeposits/...) کوئری
     می‌زنند — knex.
   - HTTP_CHECKS: واقعاً به API خود سرور (روی لوپ‌بک) درخواست می‌زنند تا
     مطمئن شوند هر صفحه واقعاً بالا می‌آید، نه فقط داده‌اش سالم است. این‌ها
     به یک کوکی نشست واقعی نیاز دارند (کسی باید لاگین‌کرده باشد) — پس فقط
     وقتی توسعه‌دهنده از مرورگرش «اجرای الان» را می‌زند اجرا می‌شوند، نه در
     اجرای شبانه‌ی بی‌صدا (که کاربر لاگین‌شده‌ای ندارد).
   ========================================================================= */
var fs = require('fs');
var path = require('path');
var dbMod = require('../db');
var knex = require('../sql/knex').knex;

function mk(status, message, details) { return { status: status, message: message, details: details || null }; }
function ok(message, details) { return mk('ok', message, details); }
function warn(message, details) { return mk('warn', message, details); }
function fail(message, details) { return mk('fail', message, details); }

/* ================= دسته: امنیت و زیرساخت ================= */
var DATA_CHECKS = [
  {
    key: 'sessionSecret', category: 'امنیت', label: 'رمز نشست (SESSION_SECRET)',
    run: function () {
      var v = process.env.SESSION_SECRET;
      if (!v || v === 'darvishi-crm-change-this-secret-in-production') {
        return fail('SESSION_SECRET هنوز مقدار پیش‌فرض/خالی است — در .env یک مقدار رندوم واقعی تنظیم کنید');
      }
      return ok('SESSION_SECRET روی مقدار اختصاصی تنظیم شده');
    }
  },
  {
    key: 'devCredentialsFile', category: 'امنیت', label: 'فایل رمز اولیه توسعه‌دهنده',
    run: function () {
      var f = path.join(__dirname, '..', 'data', 'INITIAL_DEVELOPER_CREDENTIALS.txt');
      if (fs.existsSync(f)) return warn('فایل INITIAL_DEVELOPER_CREDENTIALS.txt هنوز روی دیسک است — بعد از یادداشت رمز، پاکش کنید');
      return ok('فایل رمز اولیه دیگر روی دیسک نیست');
    }
  },
  {
    key: 'devMustChangePassword', category: 'امنیت', label: 'رمز موقت کاربر developer',
    run: function (data) {
      var dev = data.users.find(function (u) { return u.username === 'developer'; });
      if (dev && dev.mustChangePassword) return warn('کاربر developer هنوز رمز موقت اولیه‌اش را عوض نکرده');
      return ok('رمز کاربر توسعه‌دهنده از حالت موقت خارج شده (یا کاربر developer دیگر وجود ندارد)');
    }
  },
  {
    key: 'proxyCookieConsistency', category: 'امنیت', label: 'هماهنگی TRUST_PROXY / کوکی امن',
    run: function () {
      var trustProxy = process.env.TRUST_PROXY === 'true';
      var forceSecure = process.env.FORCE_SECURE_COOKIE === 'true';
      if (trustProxy && !forceSecure) {
        return warn('TRUST_PROXY=true است ولی FORCE_SECURE_COOKIE نه — پشت Nginx+HTTPS واقعی هر دو باید true باشند');
      }
      return ok('تنظیمات TRUST_PROXY و FORCE_SECURE_COOKIE هماهنگ‌اند');
    }
  },
  {
    key: 'mustChangeOthers', category: 'امنیت', label: 'کاربران با رمز موقت باقی‌مانده',
    run: function (data) {
      var stale = data.users.filter(function (u) { return u.active && u.username !== 'developer' && u.mustChangePassword; });
      if (stale.length) return warn(stale.length + ' کاربر فعال هنوز رمز موقت اولیه‌شان را عوض نکرده‌اند', stale.map(function (u) { return u.username; }));
      return ok('همه کاربران فعال رمز خودشان را تغییر داده‌اند');
    }
  },

  /* ================= دسته: یکپارچگی داده ================= */
  {
    key: 'orphanUserRoles', category: 'یکپارچگی داده', label: 'کاربران با نقش نامعتبر',
    run: function (data) {
      var roleIds = {}; data.roles.forEach(function (r) { roleIds[r.id] = true; });
      var bad = data.users.filter(function (u) { return !roleIds[u.roleId]; });
      if (bad.length) return fail(bad.length + ' کاربر به نقشی اشاره می‌کنند که دیگر وجود ندارد', bad.map(function (u) { return u.username; }));
      return ok('همه کاربران به نقش معتبر متصل‌اند');
    }
  },
  {
    key: 'orphanManagers', category: 'یکپارچگی داده', label: 'مدیر نامعتبر کاربران',
    run: function (data) {
      var userIds = {}; data.users.forEach(function (u) { userIds[u.id] = true; });
      var bad = data.users.filter(function (u) { return u.managerId && !userIds[u.managerId]; });
      if (bad.length) return warn(bad.length + ' کاربر به مدیری اشاره می‌کنند که دیگر وجود ندارد', bad.map(function (u) { return u.username; }));
      return ok('همه‌ی مدیرهای تعیین‌شده معتبرند');
    }
  },
  {
    key: 'duplicateUsernames', category: 'یکپارچگی داده', label: 'نام کاربری تکراری',
    run: function (data) {
      var seen = {}; var dups = [];
      data.users.forEach(function (u) {
        var k = u.username.toLowerCase();
        if (seen[k]) dups.push(u.username); else seen[k] = true;
      });
      if (dups.length) return fail('نام کاربری تکراری پیدا شد', dups);
      return ok('نام کاربری تکراری وجود ندارد');
    }
  },
  {
    key: 'orphanShifts', category: 'یکپارچگی داده', label: 'شیفت‌های بدون کاربر',
    run: function (data) {
      var userIds = {}; data.users.forEach(function (u) { userIds[u.id] = true; });
      var bad = data.shifts.filter(function (s) { return !userIds[s.userId]; });
      if (bad.length) return warn(bad.length + ' شیفت به کاربری اشاره می‌کند که دیگر وجود ندارد');
      return ok('همه شیفت‌ها به کاربر معتبر متصل‌اند');
    }
  },
  {
    key: 'instructionsIntegrity', category: 'یکپارچگی داده', label: 'دستورالعمل‌های ناقص',
    run: function (data) {
      var list = data.instructions || [];
      var bad = list.filter(function (i) { return !i.department || !i.subject || !i.description; });
      if (bad.length) return fail(bad.length + ' دستورالعمل با فیلد خالی پیدا شد');
      return ok('همه‌ی ' + list.length + ' دستورالعمل ثبت‌شده کامل‌اند');
    }
  },
  {
    key: 'flightCapacitySanity', category: 'یکپارچگی داده', label: 'ظرفیت فروخته‌شده پروازها',
    run: function (data) {
      var bad = [];
      (data.flightInventory || []).forEach(function (f) {
        (f.fareClasses || []).forEach(function (fc) {
          if ((fc.seatsSold || 0) > (fc.capacity || 0)) bad.push((f.flightNumber || f.id) + ' / ' + fc.name);
        });
      });
      if (bad.length) return fail('ظرفیت این کلاس‌های پروازی بیش از حد فروخته شده', bad);
      return ok('ظرفیت هیچ کلاس پروازی از حد مجاز بیشتر فروخته نشده');
    }
  },
  {
    key: 'roleModuleCoverage', category: 'دسترسی‌ها', label: 'پوشش ماژول‌ها در نقش‌ها',
    run: function (data) {
      var missing = [];
      data.roles.forEach(function (r) {
        if (r.isDeveloper) return;
        dbMod.MODULES.forEach(function (m) {
          if (!r.permissions || !r.permissions[m.key]) missing.push(r.name + ' / ' + m.label);
        });
      });
      if (missing.length) return warn(missing.length + ' ترکیب نقش/ماژول اصلاً تنظیم نشده (پیش‌فرض: بدون دسترسی)', missing);
      return ok('همه نقش‌ها برای همه ماژول‌ها یک مقدار دسترسی مشخص دارند');
    }
  },
  {
    key: 'developerRoleExists', category: 'دسترسی‌ها', label: 'وجود حداقل یک کاربر توسعه‌دهنده فعال',
    run: function (data) {
      var devRoleIds = {}; data.roles.forEach(function (r) { if (r.isDeveloper) devRoleIds[r.id] = true; });
      var activeDevs = data.users.filter(function (u) { return u.active && devRoleIds[u.roleId]; });
      if (!activeDevs.length) return fail('هیچ کاربر فعالی با نقش توسعه‌دهنده وجود ندارد — این خطرناک است');
      return ok(activeDevs.length + ' کاربر فعال با دسترسی کامل توسعه‌دهنده وجود دارد');
    }
  }
];

/* ================= دسته: زیرساخت (SQL) ================= */
var SQL_CHECKS = [
  {
    key: 'sqliteIntegrity', category: 'زیرساخت', label: 'سلامت فایل SQL (records/deposits/bookings)',
    run: function () {
      return knex.raw('PRAGMA integrity_check').then(function (result) {
        var rows = Array.isArray(result) ? result : (result && result.rows) || [];
        var val = rows[0] ? (rows[0].integrity_check || Object.keys(rows[0]).map(function (k) { return rows[0][k]; })[0]) : null;
        if (val === 'ok') return ok('دیتابیس SQL سالم است');
        return fail('نتیجه integrity_check سالم نبود', rows);
      });
    }
  },
  {
    key: 'orphanPendingBindings', category: 'یکپارچگی داده', label: 'پیش‌واریزی‌های متصل به رکورد ناموجود',
    run: function () {
      return knex('pending_deposits')
        .where('bound', true).whereNotNull('bound_record_id')
        .leftJoin('records', 'records.id', 'pending_deposits.bound_record_id')
        .whereNull('records.id')
        .select('pending_deposits.id')
        .then(function (rows) {
          if (rows.length) return fail(rows.length + ' پیش‌واریزی به رکوردی که دیگر وجود ندارد متصل مانده — احتمالاً آن رکورد حذف شده');
          return ok('همه‌ی پیوندهای پیش‌واریزی به رکورد معتبرند');
        });
    }
  },
  {
    key: 'settledDebtWithoutReceipt', category: 'یکپارچگی داده', label: 'بدهی‌های تسویه‌شده بدون رسید',
    run: function () {
      return knex('record_vouchers').where('debt_settled', true)
        .andWhere(function (qb) { qb.whereNull('debt_receipt_file_name').orWhere('debt_receipt_file_name', ''); })
        .count('* as c').then(function (rows) {
          var c = rows[0].c;
          if (c > 0) return warn(c + ' واچر بدهی، تسویه‌شده ولی بدون فایل رسید ثبت شده‌اند');
          return ok('همه بدهی‌های تسویه‌شده فایل رسید دارند');
        });
    }
  }
];

/* ================= دسته: تست کارکرد صفحات (فقط با نشست واقعی) ================= */
var HTTP_CHECKS = [
  { key: 'http_auth_me', category: 'تست کارکرد صفحات', label: 'احراز هویت / نشست', path: '/api/auth/me' },
  { key: 'http_dashboard', category: 'تست کارکرد صفحات', label: 'داشبورد / گزارش عملکرد', path: '/api/reports/performance?period=month' },
  { key: 'http_status', category: 'تست کارکرد صفحات', label: 'وضعیت پرسنل', path: '/api/status' },
  { key: 'http_records', category: 'تست کارکرد صفحات', label: 'رکوردها', path: '/api/records?page=1&pageSize=1' },
  { key: 'http_pending', category: 'تست کارکرد صفحات', label: 'پیش‌واریزی', path: '/api/pending-deposits' },
  { key: 'http_debt', category: 'تست کارکرد صفحات', label: 'بدهی به کارگزاران', path: '/api/debt' },
  { key: 'http_credit', category: 'تست کارکرد صفحات', label: 'بستانکاری آژانس‌ها', path: '/api/credit' },
  { key: 'http_messenger', category: 'تست کارکرد صفحات', label: 'پیام‌رسان', path: '/api/messenger/threads' },
  { key: 'http_inventory_hotels', category: 'تست کارکرد صفحات', label: 'انبار نرخ هتل', path: '/api/inventory/hotels' },
  { key: 'http_inventory_flights', category: 'تست کارکرد صفحات', label: 'انبار نرخ پرواز', path: '/api/inventory/flights' },
  { key: 'http_booking', category: 'تست کارکرد صفحات', label: 'رزرواسیون تور', path: '/api/booking' },
  { key: 'http_shifts', category: 'تست کارکرد صفحات', label: 'شیفت‌بندی', path: '/api/shifts' },
  { key: 'http_instructions', category: 'تست کارکرد صفحات', label: 'دستورالعمل‌ها', path: '/api/instructions' },
  { key: 'http_monitoring', category: 'تست کارکرد صفحات', label: 'مانیتورینگ', path: '/api/monitoring/overview' },
  { key: 'http_settings', category: 'تست کارکرد صفحات', label: 'تنظیمات پایه', path: '/api/settings' },
  { key: 'http_users', category: 'تست کارکرد صفحات', label: 'مدیریت کاربران', path: '/api/users' },
  { key: 'http_roles', category: 'تست کارکرد صفحات', label: 'سطح دسترسی', path: '/api/roles' }
];

function runHttpCheck(check, port, cookieHeader) {
  var start = Date.now();
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
  var url = 'http://127.0.0.1:' + (port || 3000) + check.path;
  return fetch(url, { headers: { cookie: cookieHeader || '' }, signal: controller ? controller.signal : undefined })
    .then(function (res) {
      if (timer) clearTimeout(timer);
      var dur = Date.now() - start;
      if (!res.ok) return fail('پاسخ HTTP ' + res.status + ' (' + dur + ' ms)');
      return res.json().then(
        function () { return ok('پاسخ موفق (' + dur + ' ms)'); },
        function () { return warn('پاسخ 200 اما بدنه JSON نامعتبر بود (' + dur + ' ms)'); }
      );
    })
    .catch(function (e) {
      if (timer) clearTimeout(timer);
      return fail('درخواست ناموفق: ' + (e && e.message ? e.message : String(e)));
    });
}

function wrapCheck(c, runner) {
  return runner().catch(function (e) {
    return fail('اجرای این آزمون با خطای داخلی مواجه شد: ' + (e && e.message ? e.message : String(e)));
  }).then(function (r) {
    return { key: c.key, category: c.category, label: c.label, status: r.status, message: r.message, details: r.details };
  });
}

// opts: { includeHttp, port, cookie, onlyKeys }
// includeHttp/port/cookie فقط برای اجرای دستی (با نشست واقعی) پر می‌شوند —
// اجرای شبانه‌ی خودکار همیشه includeHttp:false صدا می‌زند چون کاربر لاگین‌شده‌ای ندارد.
function runAll(opts) {
  opts = opts || {};
  var data = dbMod.db();
  var onlyKeys = opts.onlyKeys;
  function shouldRun(key) { return !onlyKeys || onlyKeys.indexOf(key) !== -1; }

  var tasks = [];
  DATA_CHECKS.forEach(function (c) {
    if (!shouldRun(c.key)) return;
    tasks.push(wrapCheck(c, function () { return Promise.resolve(c.run(data)); }));
  });
  SQL_CHECKS.forEach(function (c) {
    if (!shouldRun(c.key)) return;
    tasks.push(wrapCheck(c, function () { return c.run(); }));
  });
  if (opts.includeHttp) {
    HTTP_CHECKS.forEach(function (c) {
      if (!shouldRun(c.key)) return;
      tasks.push(wrapCheck(c, function () { return runHttpCheck(c, opts.port, opts.cookie); }));
    });
  }

  var startedAt = new Date().toISOString();
  return Promise.all(tasks).then(function (results) {
    var summary = { ok: 0, warn: 0, fail: 0 };
    results.forEach(function (r) { summary[r.status] = (summary[r.status] || 0) + 1; });
    return { startedAt: startedAt, finishedAt: new Date().toISOString(), includeHttp: !!opts.includeHttp, results: results, summary: summary };
  });
}

// Full catalogue (for the UI's "انتخاب آزمون‌ها" checklist) — httpChecks flagged
// separately so the frontend can grey them out until the user runs a live check.
function listAllChecks() {
  return {
    checks: DATA_CHECKS.concat(SQL_CHECKS).map(function (c) { return { key: c.key, category: c.category, label: c.label, requiresSession: false }; })
      .concat(HTTP_CHECKS.map(function (c) { return { key: c.key, category: c.category, label: c.label, requiresSession: true }; }))
  };
}

module.exports = { runAll: runAll, listAllChecks: listAllChecks };
