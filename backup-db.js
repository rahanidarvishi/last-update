'use strict';
/* =========================================================================
   Takes a consistent, point-in-time backup of BOTH SQLite databases this
   app uses, while the server keeps running -- no need to stop the app or
   lock any tables:
     - data/darvishi.db      the legacy "entities" store (users, roles,
                              inventory, settings, and anything not yet
                              migrated to the tables below)
     - data/darvishi-sql.db  the normalized tables (records, record_vouchers,
                              record_deposits, pending_deposits, tour_bookings
                              -- see sql/knex.js)

   A backup of only one of these is INCOMPLETE: sales records, deposits,
   and tour bookings live in darvishi-sql.db, while users/permissions/
   inventory live in darvishi.db. Restoring only one file back onto a fresh
   install would silently lose the other half of the business's data.

   Uses better-sqlite3's built-in backup() method for each file, which wraps
   SQLite's own online backup API (the same mechanism the `sqlite3 .backup`
   CLI command uses), so each result is a single valid, self-contained .db
   file even if writes are happening at that exact moment.

   Usage:
     node backup-db.js                        (backups/darvishi-<timestamp>.db
                                                 and darvishi-sql-<timestamp>.db)
     node backup-db.js /path/to/backups/darvishi-2026-09-03.db
                                               (same stem, "-sql" inserted
                                                before the .db extension for
                                                the second file)
   ========================================================================= */
var fs = require('fs');
var path = require('path');
var Database = require('better-sqlite3');

var SOURCES = [
  { file: path.join(__dirname, 'data', 'darvishi.db'), suffix: '' },
  { file: path.join(__dirname, 'data', 'darvishi-sql.db'), suffix: '-sql' }
];

function defaultDestStem() {
  var dir = path.join(__dirname, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  var stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  return path.join(dir, 'darvishi-' + stamp + '.db');
}

// Turns a requested dest path + a suffix ("" or "-sql") into the actual
// path for that source, so both backups share one timestamp/name and are
// obviously a matched pair: darvishi-2026-09-03.db + darvishi-sql-2026-09-03.db
function destPathFor(baseDest, suffix) {
  if (!suffix) return baseDest;
  var dir = path.dirname(baseDest);
  var ext = path.extname(baseDest) || '.db';
  var stem = path.basename(baseDest, ext);
  return path.join(dir, stem + suffix + ext);
}

var baseDest = process.argv[2] || defaultDestStem();
var destDir = path.dirname(baseDest);
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

var missing = SOURCES.filter(function (s) { return !fs.existsSync(s.file); });
if (missing.length === SOURCES.length) {
  console.error('هیچ‌کدام از فایل‌های دیتابیس یافت نشدند — آیا برنامه حداقل یک‌بار اجرا شده؟');
  process.exit(1);
}
missing.forEach(function (s) {
  console.warn('هشدار: ' + s.file + ' یافت نشد — از آن پرش می‌شود (شاید هنوز ایجاد نشده).');
});

var jobs = SOURCES.filter(function (s) { return fs.existsSync(s.file); }).map(function (s) {
  var dest = destPathFor(baseDest, s.suffix);
  var db = new Database(s.file, { readonly: true });
  return db.backup(dest)
    .then(function () {
      try { fs.chmodSync(dest, 0o600); } catch (e) { /* best effort, e.g. on Windows */ }
      console.log('بک‌آپ با موفقیت ذخیره شد: ' + dest);
      db.close();
    })
    .catch(function (err) {
      db.close();
      throw new Error(path.basename(s.file) + ': ' + err.message);
    });
});

Promise.all(jobs)
  .then(function () {
    if (missing.length) {
      console.warn('توجه: بک‌آپ ناقص است — ' + missing.length + ' فایل موجود نبود. برای بک‌آپ کامل هر دو فایل لازم است.');
    }
  })
  .catch(function (err) {
    console.error('بک‌آپ ناموفق بود:', err.message);
    process.exit(1);
  });
