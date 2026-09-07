'use strict';
/* =========================================================================
   SQLite-backed data store.
   ---------------------------------------------------------------------
   This used to be a single JSON file rewritten wholesale on every save.
   That was fine at small scale, but with ~100 users adding records all
   day it meant EVERY api call that changed anything (even adding one
   deposit to one record) re-serialized and rewrote the ENTIRE file —
   every user's data, every photo, every inventory item, all of it.

   This version keeps the exact same in-memory shape and the exact same
   public API (db(), save(), saveSync()) that every route file already
   uses — so no route file needed to change. Under the hood:

     - Each top-level collection (users, roles, records, messages, ...)
       is stored as one row per item in a single `entities` table
       (collection, id, json). Saving diffs the in-memory array against
       a snapshot of what was last written, so a save only touches the
       rows that actually changed — not the whole database.
     - SQLite runs in WAL mode, so reads are never blocked by a write in
       progress, and a crash mid-write can't corrupt existing data
       (SQLite's WAL journal guarantees atomic transactions).
     - All of that runs inside one transaction per save() — either every
       change in that save lands, or none of them do.

   If an old data/data.json is found on first boot (upgrading from the
   previous version of this app), it's imported automatically and then
   renamed to a .bak file (kept, not deleted) — see migrateFromLegacyJson.
   ========================================================================= */
var fs = require('fs');
var path = require('path');
var bcrypt = require('bcryptjs');
var Database = require('better-sqlite3');
var uid = require('./utils/id').uid;

// Overridable via env so automated tests (see tests/) can run against a
// throwaway directory instead of touching real data.
var DATA_DIR = process.env.DARVISHI_DATA_DIR || path.join(__dirname, 'data');
var DB_FILE = path.join(DATA_DIR, 'darvishi.db');
var LEGACY_JSON_FILE = path.join(DATA_DIR, 'data.json');
var CREDENTIALS_FILE = path.join(DATA_DIR, 'INITIAL_DEVELOPER_CREDENTIALS.txt');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
try { fs.chmodSync(DATA_DIR, 0o700); } catch (e) { /* best effort, e.g. on Windows */ }

/* ---- Permission modules: single source of truth, used by both the
   permissions-admin UI and the server-side access-control middleware. ---- */
var MODULES = [
  { key: 'dashboard', label: 'داشبورد' },
  { key: 'statusBoard', label: 'وضعیت پرسنل / مود روز (BRB)' },
  { key: 'newEntry', label: 'ثبت جدید (واچر و رزرو)' },
  { key: 'pending', label: 'پیش‌واریزی' },
  { key: 'records', label: 'رکوردها' },
  { key: 'debt', label: 'بدهی به کارگزاران' },
  { key: 'credit', label: 'بستانکاری آژانس‌ها' },
  { key: 'messenger', label: 'پیام‌رسان و مرخصی' },
  { key: 'describer', label: 'توضیح‌ساز و درخواست لینک' },
  { key: 'inventory', label: 'تعریف پرواز و هتل (انبار نرخ)' },
  { key: 'booking', label: 'رزرواسیون تور' },
  { key: 'shifts', label: 'شیفت‌بندی نیروها' },
  { key: 'instructions', label: 'دستورالعمل‌ها' },
  { key: 'monitoring', label: 'مانیتورینگ و لاگ ورود' },
  { key: 'reports', label: 'گزارش عملکرد' },
  { key: 'settings', label: 'تنظیمات پایه' },
  { key: 'permissions', label: 'مدیریت کاربران و سطح دسترسی' }
];

function emptyPermissions(defaultView, defaultEdit) {
  var p = {};
  MODULES.forEach(function (m) { p[m.key] = { view: !!defaultView, edit: !!defaultEdit }; });
  return p;
}

function defaultData() {
  return {
    users: [],
    roles: [],
    agencies: [], counters: [], procurementExperts: [], currencies: [],
    cities: [], // [{id,name,hotels:[],agents:[]}]
    currencyRates: [], // {id,currency,jy,jm,jd,rate,createdAt}
    records: [], // vouchers & sales records
    pendingDeposits: [],
    messages: [], // includes leave requests (type:'leave'); task threads can have multiple recipients via participantIds
    userStatuses: [], // {userId, statusEmoji, statusText, moodEmoji, moodText, updatedAt} — the fun BRB/mood board
    hotelInventory: [], // { id, cityId, name, roomTypes:[{id,name}], services:[{id,name}], rates:[{id,itemType,itemId,jy,jm,jd,price,currency}] }
    flightInventory: [], // { id, origin, destination, airline, flightNumber, departJy/Jm/Jd, departTime, arriveJy/Jm/Jd, arriveTime, fareClasses:[{id,name,capacity,seatsSold,price,currency,costPrice,costCurrency}] }
    tourBookings: [], // full tour reservations combining hotel + flight(s) + passenger manifest
    shifts: [], // { id, userId, jy, jm, jd, startTime, endTime, note, createdBy, createdAt } — assigned by a user's manager (or the developer)
    instructions: [], // { id, department, subject, description, createdBy, createdByName, createdAt } — دستورالعمل‌های بخش‌ها، فقط توسط مدیران بخش (edit:true روی این ماژول) قابل تعریف است
    notes: [], // { id, userId, title, content, color, pinned, createdAt, updatedAt } — یادداشت‌های شخصی هر کاربر (شبیه استیکی‌نوت)، کاملاً خصوصی؛ فقط توسعه‌دهنده می‌تواند همه را سرچ/مشاهده کند (نه ویرایش)
    systemCheckRuns: [], // { id, startedAt, finishedAt, includeHttp, triggeredBy:'manual'|'daily', results:[{key,category,label,status,message,details}], summary:{ok,warn,fail} } — تاریخچه‌ی «تست خودکار سیستم» (فقط توسعه‌دهنده)
    loginLogs: [], // { id, at, username, userId, ip, userAgent, success, failReason }
    notificationSettings: { telegramBotToken: '', telegramChatId: '', notifyOnLogin: false },
    companySettings: { logoDataUrl: '', agencyNameEn: '' },
    meta: { schemaVersion: 1, nextBookingNumber: 1, lastDailyCheckKey: null }
  };
}

// Fills in any collections that didn't exist yet in older data, so upgrading
// the app code never crashes on a missing field. Same logic as before, now
// also run after loading from SQLite (cheap no-op once everything is current).
function normalizeSchema(data) {
  var defaults = defaultData();
  Object.keys(defaults).forEach(function (key) {
    if (data[key] === undefined) data[key] = defaults[key];
  });
  if (!data.meta) data.meta = defaults.meta;
  if (data.meta.nextBookingNumber == null) data.meta.nextBookingNumber = 1;
  if (data.meta.lastDailyCheckKey === undefined) data.meta.lastDailyCheckKey = null;
  if (!data.companySettings) data.companySettings = defaults.companySettings;
  if (!data.notificationSettings) data.notificationSettings = defaults.notificationSettings;
  (data.roles || []).forEach(function (r) {
    if (r.roleCategory === undefined) r.roleCategory = null;
    // Upgrade path for the "دستورالعمل‌ها" module added after this role was created: everyone
    // gets to view instructions by default, but only roles already flagged as managerial
    // (canViewAllMessages — the same signal used elsewhere for "sees everything") can define
    // new ones. A developer can always fine-tune this per role from «سطح دسترسی» afterwards.
    if (!r.permissions) r.permissions = emptyPermissions(false, false);
    if (!r.permissions.instructions) {
      r.permissions.instructions = { view: true, edit: !!r.canViewAllMessages };
    }
  });
  (data.users || []).forEach(function (u) {
    if (u.managerId === undefined) u.managerId = null;
    if (u.photoDataUrl === undefined) u.photoDataUrl = '';
    if (u.extension === undefined) u.extension = '';
    if (u.position === undefined) u.position = '';
  });
}

/* ---- Collection registry: tells the generic load/save code how each
   top-level key in defaultData() should be stored. --------------------- */
// Arrays of objects, one row per item, keyed by the given field.
var ID_COLLECTIONS = {
  users: 'id', roles: 'id', cities: 'id', currencyRates: 'id', records: 'id',
  pendingDeposits: 'id', messages: 'id', userStatuses: 'userId',
  hotelInventory: 'id', flightInventory: 'id', tourBookings: 'id',
  shifts: 'id', loginLogs: 'id', instructions: 'id', systemCheckRuns: 'id', notes: 'id'
};
// Small plain string arrays — cheap enough to store as a single row each.
var LIST_COLLECTIONS = ['agencies', 'counters', 'procurementExperts', 'currencies'];
// Single objects, not arrays — also one row each.
var SINGLETON_COLLECTIONS = ['notificationSettings', 'companySettings', 'meta'];
var WHOLE_ROW_ID = '__all__';

var db = null;
var stmt = {};
var cache = null;
var snapshot = null; // last-written JSON string per row, used to diff on save
var saveTimer = null;

function openDb() {
  if (db) return db;
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL'); // readers never block on a writer, and crash-safe
  db.pragma('synchronous = NORMAL'); // safe with WAL, notably faster than FULL
  db.exec('CREATE TABLE IF NOT EXISTS entities (' +
    'collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, ' +
    'PRIMARY KEY (collection, id))');
  db.exec('CREATE INDEX IF NOT EXISTS idx_entities_collection ON entities(collection)');
  stmt.upsert = db.prepare('INSERT INTO entities (collection, id, json) VALUES (@collection, @id, @json) ' +
    'ON CONFLICT(collection, id) DO UPDATE SET json = excluded.json');
  stmt.remove = db.prepare('DELETE FROM entities WHERE collection = ? AND id = ?');
  stmt.selectCollection = db.prepare('SELECT id, json FROM entities WHERE collection = ? ORDER BY rowid');
  stmt.selectOne = db.prepare('SELECT json FROM entities WHERE collection = ? AND id = ?');
  stmt.countAll = db.prepare('SELECT COUNT(*) AS c FROM entities');
  chmodDbFiles();
  return db;
}

function chmodDbFiles() {
  [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm'].forEach(function (f) {
    try { if (fs.existsSync(f)) fs.chmodSync(f, 0o600); } catch (e) { /* best effort, e.g. on Windows */ }
  });
}

function loadFromDb() {
  var data = defaultData();
  var snap = {};
  Object.keys(ID_COLLECTIONS).forEach(function (key) {
    var rows = stmt.selectCollection.all(key);
    data[key] = rows.map(function (r) { return JSON.parse(r.json); });
    var m = {};
    rows.forEach(function (r) { m[r.id] = r.json; });
    snap[key] = m;
  });
  LIST_COLLECTIONS.forEach(function (key) {
    var row = stmt.selectOne.get(key, WHOLE_ROW_ID);
    if (row) { data[key] = JSON.parse(row.json); snap[key] = row.json; }
  });
  SINGLETON_COLLECTIONS.forEach(function (key) {
    var row = stmt.selectOne.get(key, WHOLE_ROW_ID);
    if (row) { data[key] = JSON.parse(row.json); snap[key] = row.json; }
  });
  normalizeSchema(data);
  return { data: data, snap: snap };
}

// Writes every row whose current JSON differs from what was last written,
// and removes rows for items that no longer exist — all inside one
// transaction. This is what makes routine saves cheap even with a lot of
// data: adding one deposit to one record only touches that one row.
function persistNow() {
  var tx = db.transaction(function () {
    Object.keys(ID_COLLECTIONS).forEach(function (key) {
      var idField = ID_COLLECTIONS[key];
      var arr = cache[key] || [];
      var prevMap = snapshot[key] || {};
      var seen = {};
      var newMap = {};
      arr.forEach(function (item) {
        if (item == null || item[idField] == null) { return; } // skip malformed entries defensively
        var id = String(item[idField]);
        seen[id] = true;
        var json = JSON.stringify(item);
        newMap[id] = json;
        if (prevMap[id] !== json) stmt.upsert.run({ collection: key, id: id, json: json });
      });
      Object.keys(prevMap).forEach(function (id) {
        if (!seen[id]) stmt.remove.run(key, id);
      });
      snapshot[key] = newMap;
    });
    LIST_COLLECTIONS.concat(SINGLETON_COLLECTIONS).forEach(function (key) {
      var json = JSON.stringify(cache[key]);
      if (snapshot[key] !== json) {
        stmt.upsert.run({ collection: key, id: WHOLE_ROW_ID, json: json });
        snapshot[key] = json;
      }
    });
  });
  tx();
  chmodDbFiles();
}

function emptySnapshot() {
  var snap = {};
  Object.keys(ID_COLLECTIONS).forEach(function (key) { snap[key] = {}; });
  LIST_COLLECTIONS.concat(SINGLETON_COLLECTIONS).forEach(function (key) { snap[key] = undefined; });
  return snap;
}

// One-time upgrade path: if this server previously ran on the old
// JSON-file version of this app, import everything into SQLite the first
// time it boots, then rename (never delete) the old file as a safety net.
function migrateFromLegacyJson() {
  console.log('فایل قدیمی data.json پیدا شد — در حال انتقال یک‌باره به دیتابیس SQLite...');
  var raw;
  try {
    raw = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, 'utf8'));
  } catch (e) {
    console.error('خواندن data.json قدیمی ناموفق بود، با داده خالی شروع می‌شود:', e.message);
    raw = defaultData();
  }
  normalizeSchema(raw);
  cache = raw;
  snapshot = emptySnapshot(); // everything looks "new" so the first persistNow() writes it all
  persistNow();
  var backupName = LEGACY_JSON_FILE + '.migrated-' + Date.now() + '.bak';
  try {
    fs.renameSync(LEGACY_JSON_FILE, backupName);
    fs.chmodSync(backupName, 0o600);
    console.log('انتقال کامل شد. نسخه پشتیبان فایل قدیمی اینجاست (می‌توانید بعداً پاکش کنید): ' + backupName);
  } catch (e) {
    console.error('انتقال به SQLite کامل شد، اما تغییر نام data.json قدیمی ناموفق بود:', e.message);
  }
}

function loadSync() {
  if (cache) return cache;
  openDb();
  var isEmpty = stmt.countAll.get().c === 0;
  if (isEmpty && fs.existsSync(LEGACY_JSON_FILE)) {
    migrateFromLegacyJson();
  } else if (isEmpty) {
    cache = defaultData();
    snapshot = emptySnapshot();
    seedInitialData(cache);
    persistNow();
  } else {
    var loaded = loadFromDb();
    cache = loaded.data;
    snapshot = loaded.snap;
  }
  return cache;
}

// Debounced save: many API calls can happen in a burst; this coalesces them
// into a single disk write a few ms later instead of writing on every call.
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try { persistNow(); } catch (e) { console.error('خطا در ذخیره‌سازی داده:', e); }
  }, 50);
}
// For places that need a guarantee the write has happened (e.g. right before
// responding to the client with "saved successfully").
function saveSync() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  persistNow();
}

function randomPassword() {
  // crypto.randomBytes, not Math.random — this seeds the very first
  // developer account's password, so it needs to be unpredictable.
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  var bytes = require('crypto').randomBytes(16);
  var out = '';
  for (var i = 0; i < 16; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function seedInitialData(data) {
  // Developer role: hard-coded full access, cannot be edited away — this is
  // the role the business owner asked to always retain complete control.
  var devRoleId = uid('role');
  data.roles.push({
    id: devRoleId,
    name: 'توسعه‌دهنده (دسترسی کامل)',
    isDeveloper: true,
    permissions: emptyPermissions(true, true),
    canViewAllMessages: true,
    roleCategory: null,
    createdAt: new Date().toISOString()
  });

  // A sensible starting "staff" role so the developer isn't forced to build
  // every role from zero — ordinary reservation/sales staff, no admin access.
  var staffRoleId = uid('role');
  var staffPerms = emptyPermissions(false, false);
  ['dashboard', 'statusBoard', 'newEntry', 'pending', 'records', 'messenger', 'describer', 'booking'].forEach(function (k) {
    staffPerms[k] = { view: true, edit: true };
  });
  staffPerms.shifts = { view: true, edit: false }; // everyone can see their own assigned shifts
  staffPerms.instructions = { view: true, edit: false }; // can read, but only managers define instructions
  data.roles.push({
    id: staffRoleId,
    name: 'کارشناس رزرواسیون',
    isDeveloper: false,
    permissions: staffPerms,
    canViewAllMessages: false,
    roleCategory: null,
    createdAt: new Date().toISOString()
  });

  // A "manager" role that can see everything read-only plus reports/debt/credit,
  // and sees all messenger threads (useful for approving leave requests).
  var managerRoleId = uid('role');
  var managerPerms = emptyPermissions(true, false);
  ['newEntry', 'pending', 'records', 'messenger', 'describer'].forEach(function (k) {
    managerPerms[k] = { view: true, edit: true };
  });
  managerPerms.statusBoard = { view: true, edit: true };
  managerPerms.inventory = { view: true, edit: true };
  managerPerms.booking = { view: true, edit: true };
  managerPerms.monitoring = { view: true, edit: false };
  managerPerms.permissions = { view: false, edit: false };
  managerPerms.shifts = { view: true, edit: true }; // managers can schedule shifts for their own staff
  managerPerms.instructions = { view: true, edit: true }; // department managers can define instructions
  data.roles.push({
    id: managerRoleId,
    name: 'مدیر داخلی',
    isDeveloper: false,
    permissions: managerPerms,
    canViewAllMessages: true,
    roleCategory: null,
    createdAt: new Date().toISOString()
  });

  var devUsername = 'developer';
  var devPassword = randomPassword();
  data.users.push({
    id: uid('user'),
    username: devUsername,
    passwordHash: bcrypt.hashSync(devPassword, 12),
    fullName: 'توسعه‌دهنده سیستم',
    roleId: devRoleId,
    active: true,
    mustChangePassword: true,
    managerId: null,
    photoDataUrl: '',
    extension: '',
    position: '',
    createdAt: new Date().toISOString()
  });

  try {
    fs.writeFileSync(CREDENTIALS_FILE,
      'اطلاعات ورود اولیه توسعه‌دهنده (فقط یک‌بار اینجا نوشته می‌شود؛ لطفاً بعد از اولین ورود رمز را عوض کن):\n' +
      'نام کاربری: ' + devUsername + '\n' +
      'رمز عبور: ' + devPassword + '\n' +
      'تاریخ ساخت: ' + new Date().toISOString() + '\n',
      'utf8');
  } catch (e) { /* non-fatal — credentials are also printed to the console below */ }

  console.log('================================================================');
  console.log(' کاربر توسعه‌دهنده (سطح دسترسی کامل) ساخته شد:');
  console.log('   نام کاربری : ' + devUsername);
  console.log('   رمز عبور   : ' + devPassword);
  console.log(' این اطلاعات همچنین در فایل زیر ذخیره شد:');
  console.log('   ' + CREDENTIALS_FILE);
  console.log(' لطفاً بلافاصله بعد از اولین ورود، رمز را از بخش «مدیریت کاربران» عوض کن.');
  console.log('================================================================');
}

module.exports = {
  MODULES: MODULES,
  emptyPermissions: emptyPermissions,
  db: loadSync,
  save: save,
  saveSync: saveSync
};
