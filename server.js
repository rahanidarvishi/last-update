'use strict';
// Load .env (if present) BEFORE anything below reads process.env — Node's
// built-in loader needs no extra dependency. .env is optional (e.g. in this
// dev sandbox, or when env vars are set some other way like PM2's env
// config), so a missing file must never crash the app.
try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
} catch (e) {
  if (e && e.code !== 'ENOENT') console.warn('هشدار: خواندن فایل .env با خطا مواجه شد:', e.message);
}

var express = require('express');
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var helmet = require('helmet');
var path = require('path');
var dbMod = require('./db');
var authMw = require('./middleware/auth');
var csrfMw = require('./middleware/csrf');

// Touch the store once at boot so the developer credentials get generated /
// printed immediately, even before the first HTTP request arrives.
dbMod.db();

var app = express();
app.disable('x-powered-by');

/* ---- Security hardening (from the deployment security checklist) ----
   TRUST_PROXY / FORCE_SECURE_COOKIE are OFF by default so the app keeps
   working out of the box for local testing and internal-LAN deployment
   (plain HTTP, no reverse proxy). Turn them ON in your .env only once the
   app is actually running behind Nginx + HTTPS on a public VPS — see
   README "Security checklist" section. */
var TRUST_PROXY = process.env.TRUST_PROXY === 'true';
var FORCE_SECURE_COOKIE = process.env.FORCE_SECURE_COOKIE === 'true';
if (TRUST_PROXY) app.set('trust proxy', 1);

// Helmet sets a solid baseline of security headers (X-Content-Type-Options,
// X-Frame-Options, etc). CSP used to need `cdnjs.cloudflare.com` allow-listed
// because Chart.js/SheetJS/html2canvas/jsPDF and the Vazirmatn font were
// pulled from CDNs — now they're all vendored locally (/vendor, /js), so CSP
// can be locked to 'self' only. style-src still needs 'unsafe-inline' because
// the UI builds a lot of inline style="" attributes directly in HTML strings
// (a real cleanup would move those to CSS classes, but that's a much larger
// refactor) — script-src does NOT have 'unsafe-inline', which is the
// directive that actually matters for blocking injected <script> tags.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'], // data: needed for base64 profile photos/logos stored in the DB
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: '2mb' })); // also satisfies the "limit request size" checklist item

// CSRF double-submit cookie: set on every request so it exists before any
// page's JS makes its first API call; verified below, only for /api/*,
// once the routes (and therefore req.currentUser via attachUser) are wired.
app.use(csrfMw.ensureCsrfCookie(FORCE_SECURE_COOKIE));

var SESSION_SECRET = process.env.SESSION_SECRET || 'darvishi-crm-change-this-secret-in-production';
if (SESSION_SECRET === 'darvishi-crm-change-this-secret-in-production') {
  console.warn('هشدار: SESSION_SECRET پیش‌فرض در حال استفاده است — قبل از انتشار عمومی، متغیر محیطی SESSION_SECRET را تنظیم کنید.');
}
var fs = require('fs');
// Same DARVISHI_DATA_DIR override as db.js/sql/knex.js, so an automated
// test run's session files land in its own throwaway directory too.
var APP_DATA_DIR = process.env.DARVISHI_DATA_DIR || path.join(__dirname, 'data');
var SESSIONS_DIR = path.join(APP_DATA_DIR, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
try { fs.chmodSync(SESSIONS_DIR, 0o700); } catch (e) { /* best effort, e.g. on Windows */ }

app.use(session({
  name: 'darvishi.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // Sessions used to live only in memory, meaning every PM2 restart /
  // deploy / crash silently logged everyone out. Storing them as files
  // under data/sessions keeps people logged in across restarts, and stays
  // consistent with the rest of the app's "no external database" design.
  store: new FileStore({
    path: SESSIONS_DIR,
    ttl: 60 * 60 * 12, // matches cookie maxAge below (12h)
    reapInterval: 60 * 60, // clean up expired session files hourly
    logFn: function () {} // silence session-file-store's own console logging
  }),
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
    sameSite: 'strict',
    secure: FORCE_SECURE_COOKIE
  }
}));

// Server-side enforcement of the "must change temporary password" rule.
// Previously this was only enforced by the UI (a banner + modal) — someone
// bypassing the UI (curl, browser devtools, a custom client) could keep
// using every API while still on a temporary password. attachUser is cheap
// and idempotent, so calling it here (in addition to each route's own call)
// just populates req.currentUser a little earlier; it does no harm.
app.use(authMw.attachUser);
var MUST_CHANGE_PASSWORD_ALLOWED_PATHS = [
  '/api/auth/change-password', '/api/auth/logout', '/api/auth/me'
];
app.use(function (req, res, next) {
  if (req.currentUser && req.currentUser.mustChangePassword && req.path.indexOf('/api/') === 0) {
    if (MUST_CHANGE_PASSWORD_ALLOWED_PATHS.indexOf(req.path) === -1) {
      return res.status(403).json({ error: 'ابتدا رمز عبور موقت خود را تغییر دهید', mustChangePassword: true });
    }
  }
  next();
});

// Defense-in-depth CSRF check for every mutating /api/* call (see
// middleware/csrf.js). Placed after attachUser/mustChangePassword so a
// rejected CSRF check never leaks past those, and before route mounting so
// no route can accidentally be added later without this check applying.
app.use('/api', csrfMw.verifyCsrfToken);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/records', require('./routes/records'));
app.use('/api/pending-deposits', require('./routes/pending'));
app.use('/api/debt', require('./routes/debt'));
app.use('/api/credit', require('./routes/credit'));
app.use('/api/messenger', require('./routes/messenger'));
app.use('/api/status', require('./routes/status'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/booking', require('./routes/booking'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/instructions', require('./routes/instructions'));
app.use('/api/system-checks', require('./routes/systemChecks'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/monitoring', require('./routes/monitoring'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notes', require('./routes/notes'));

app.use(express.static(path.join(__dirname, 'public')));

// Anything else that isn't a known static file or /api/* route falls back to
// the login page — the client-side script there checks the session and
// redirects to the app shell automatically if already logged in.
app.get('*', function (req, res) {
  if (req.path.indexOf('/api/') === 0) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

var PORT = process.env.PORT || 3000;
// HOST defaults to 0.0.0.0 (reachable on the LAN / directly) which is right
// for an internal-network deployment. On a public VPS behind Nginx, set
// HOST=127.0.0.1 in .env so Node is unreachable except through the proxy —
// see README "Security checklist" section for the full VPS hardening steps.
var HOST = process.env.HOST || '0.0.0.0';

// The SQL-backed tables (records/pendingDeposits — see sql/knex.js for why
// only these) need their migrations applied, and a one-time legacy-data
// import run, before the server can safely accept any request that touches
// them. Both are async (Knex), so the HTTP listener only starts once both
// resolve — a request arriving mid-migration would see an incomplete table.
require('./sql/knex').runMigrations()
  .then(function () { return require('./sql/migrate-legacy-records').migrateIfNeeded(); })
  .then(function () {
    app.listen(PORT, HOST, function () {
      console.log('سرور سیستم مدیریت درویشی روی ' + HOST + ':' + PORT + ' اجرا شد');
      require('./utils/dailyCheckScheduler').startDailyScheduler();
    });
  })
  .catch(function (e) {
    console.error('خطا در آماده‌سازی دیتابیس SQL — سرور بالا نیامد:', e);
    process.exit(1);
  });
