'use strict';
/* =========================================================================
   Integration test -- boots the ACTUAL server.js as a child process against
   a throwaway data directory (DARVISHI_DATA_DIR), then talks to it over
   real HTTP exactly like a browser would. This is what actually proves:
     - login/captcha/session flow works end to end
     - the CSRF double-submit check genuinely blocks a request missing the
       header, and genuinely allows one that has it
     - a staff user can edit their OWN record but gets a 403 editing/
       deleting someone else's -- the ownership fix -- while a developer/
       manager can still manage any record
   Run with: node --test tests/integration.test.js
   (or just `npm test`, which runs everything under tests/)
   ========================================================================= */
var test = require('node:test');
var assert = require('node:assert/strict');
var { spawn } = require('node:child_process');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');

var PORT = 20000 + (process.pid % 20000);
var BASE = 'http://127.0.0.1:' + PORT;
var DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'darvishi-test-'));
var CREDENTIALS_FILE = path.join(DATA_DIR, 'INITIAL_DEVELOPER_CREDENTIALS.txt');

var child;

function waitForServer(timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  function attempt() {
    return fetch(BASE + '/api/auth/captcha').then(
      function (res) { return res; },
      function () {
        if (Date.now() > deadline) throw new Error('سرور در زمان مقرر بالا نیامد');
        return new Promise(function (r) { setTimeout(r, 150); }).then(attempt);
      }
    );
  }
  return attempt();
}

test.before(async function () {
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      DARVISHI_DATA_DIR: DATA_DIR,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      SESSION_SECRET: 'integration-test-secret-not-for-real-use',
      TRUST_PROXY: 'false',
      FORCE_SECURE_COOKIE: 'false'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitForServer(15000);
});

test.after(function () {
  if (child) child.kill();
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) { /* best effort */ }
});

/* ---- tiny cookie-jar + fetch wrapper, mirroring what a browser does ---- */
function makeClient() {
  var cookies = {}; // name -> value
  function cookieHeader() {
    return Object.keys(cookies).map(function (k) { return k + '=' + cookies[k]; }).join('; ');
  }
  function absorbSetCookie(res) {
    var setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    setCookies.forEach(function (sc) {
      var first = sc.split(';')[0];
      var eq = first.indexOf('=');
      if (eq === -1) return;
      cookies[first.slice(0, eq)] = first.slice(eq + 1);
    });
  }
  async function call(method, p, body, extraHeaders) {
    var headers = Object.assign({}, extraHeaders || {});
    if (cookieHeader()) headers['Cookie'] = cookieHeader();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var res = await fetch(BASE + p, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    absorbSetCookie(res);
    var data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, data: data };
  }
  return {
    csrfToken: function () { return cookies['darvishi.csrf'] || null; },
    get: function (p) { return call('GET', p); },
    // Mutating calls automatically attach the CSRF header, exactly like
    // public/js/api.js does -- pass includeCsrf:false to deliberately omit
    // it when testing that the check actually rejects requests without it.
    mutate: function (method, p, body, opts) {
      opts = opts || {};
      var headers = {};
      if (opts.includeCsrf !== false) {
        var t = opts.csrfOverride !== undefined ? opts.csrfOverride : this.csrfToken();
        if (t) headers['X-CSRF-Token'] = t;
      }
      return call(method, p, body, headers);
    }
  };
}

async function solveCaptcha(client) {
  var res = await client.get('/api/auth/captcha');
  assert.equal(res.status, 200);
  var m = /^(\d+)\s*([+-])\s*(\d+)/.exec(res.data.question);
  assert.ok(m, 'unexpected captcha question format: ' + res.data.question);
  var a = parseInt(m[1], 10), op = m[2], b = parseInt(m[3], 10);
  return op === '+' ? a + b : a - b;
}

async function login(client, username, password) {
  var answer = await solveCaptcha(client);
  return client.mutate('POST', '/api/auth/login', { username: username, password: password, captcha: String(answer) });
}

/* ========================================================================= */

test('server boots and issues a CSRF cookie on first contact', async function () {
  var client = makeClient();
  var res = await client.get('/api/auth/captcha');
  assert.equal(res.status, 200);
  assert.ok(client.csrfToken(), 'expected a darvishi.csrf cookie to be set');
});

test('CSRF: a mutating request without the header is rejected with 403', async function () {
  var client = makeClient();
  await client.get('/api/auth/captcha'); // primes the CSRF cookie
  var res = await client.mutate('POST', '/api/auth/login', { username: 'nobody', password: 'x', captcha: '0' }, { includeCsrf: false });
  assert.equal(res.status, 403);
});

test('CSRF: a mutating request with a WRONG token is rejected with 403', async function () {
  var client = makeClient();
  await client.get('/api/auth/captcha');
  var res = await client.mutate('POST', '/api/auth/login', { username: 'nobody', password: 'x', captcha: '0' }, { csrfOverride: 'totally-not-the-real-token' });
  assert.equal(res.status, 403);
});

test('login: wrong captcha is rejected before credentials are even checked', async function () {
  var client = makeClient();
  await client.get('/api/auth/captcha');
  var res = await client.mutate('POST', '/api/auth/login', { username: 'developer', password: 'whatever', captcha: '999999' });
  assert.equal(res.status, 400);
  assert.equal(res.data.captchaFailed, true);
});

/* ---- full flow: developer logs in, must change password, sets up staff users, ownership rules are enforced ---- */

var developerClient, aliceClient, bobClient;
var staffRoleId, managerRoleId;
var aliceRecordId;

test('developer can log in with the auto-generated credentials and is forced to change password', async function () {
  assert.ok(fs.existsSync(CREDENTIALS_FILE), 'expected the initial credentials file to exist: ' + CREDENTIALS_FILE);
  var raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
  var userM = /نام کاربری: (.+)/.exec(raw);
  var passM = /رمز عبور: (.+)/.exec(raw);
  assert.ok(userM && passM, 'could not parse credentials file');

  developerClient = makeClient();
  var res = await login(developerClient, userM[1].trim(), passM[1].trim());
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.user.isDeveloper, true);
  assert.equal(res.data.user.mustChangePassword, true);

  // Server-side enforcement: even logged in, non-allowed endpoints must be
  // blocked until the temporary password is changed.
  var blocked = await developerClient.get('/api/records');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.mustChangePassword, true);

  var change = await developerClient.mutate('POST', '/api/auth/change-password', {
    currentPassword: passM[1].trim(), newPassword: 'DeveloperStrongPass123!'
  });
  assert.equal(change.status, 200, JSON.stringify(change.data));

  // The one-time plaintext credentials file must be deleted once the
  // developer has actually set their own password.
  assert.equal(fs.existsSync(CREDENTIALS_FILE), false);
});

test('developer can look up the seeded staff and manager role ids', async function () {
  var res = await developerClient.get('/api/roles');
  assert.equal(res.status, 200);
  var staff = res.data.roles.find(function (r) { return r.name.indexOf('کارشناس') !== -1; });
  var manager = res.data.roles.find(function (r) { return r.name.indexOf('مدیر داخلی') !== -1; });
  assert.ok(staff, 'expected a seeded staff role');
  assert.ok(manager, 'expected a seeded manager role');
  staffRoleId = staff.id;
  managerRoleId = manager.id;
});

test('developer creates two staff users (alice, bob) and one manager (carol)', async function () {
  var users = [
    { username: 'alice', password: 'AliceStrongPass123!', fullName: 'Alice Staff', roleId: staffRoleId },
    { username: 'bob', password: 'BobStrongPass123!', fullName: 'Bob Staff', roleId: staffRoleId },
    { username: 'carol', password: 'CarolStrongPass123!', fullName: 'Carol Manager', roleId: managerRoleId }
  ];
  for (var i = 0; i < users.length; i++) {
    var res = await developerClient.mutate('POST', '/api/users', users[i]);
    assert.equal(res.status, 200, JSON.stringify(res.data));
  }
});

test('alice logs in, changes her temp password, and creates a sales record', async function () {
  aliceClient = makeClient();
  var loginRes = await login(aliceClient, 'alice', 'AliceStrongPass123!');
  assert.equal(loginRes.status, 200, JSON.stringify(loginRes.data));

  var change = await aliceClient.mutate('POST', '/api/auth/change-password', {
    currentPassword: 'AliceStrongPass123!', newPassword: 'AliceEvenStrongerPass123!'
  });
  assert.equal(change.status, 200, JSON.stringify(change.data));

  var created = await aliceClient.mutate('POST', '/api/records', {
    agency: 'Test Agency', counter: 'Counter 1',
    vouchers: [{ number: 'V-1001' }],
    totalAmount: 50000000
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  aliceRecordId = created.data.record.id;
  assert.ok(aliceRecordId);
});

test('alice can edit her own record', async function () {
  var res = await aliceClient.mutate('PATCH', '/api/records/' + aliceRecordId, { counter: 'Counter 1 (edited by alice)' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.record.counter, 'Counter 1 (edited by alice)');
});

test("bob (a peer, not alice's manager) CANNOT edit or delete alice's record", async function () {
  bobClient = makeClient();
  var loginRes = await login(bobClient, 'bob', 'BobStrongPass123!');
  assert.equal(loginRes.status, 200, JSON.stringify(loginRes.data));
  await bobClient.mutate('POST', '/api/auth/change-password', {
    currentPassword: 'BobStrongPass123!', newPassword: 'BobEvenStrongerPass123!'
  });

  var patchRes = await bobClient.mutate('PATCH', '/api/records/' + aliceRecordId, { counter: 'hijacked by bob' });
  assert.equal(patchRes.status, 403);

  var delRes = await bobClient.mutate('DELETE', '/api/records/' + aliceRecordId);
  assert.equal(delRes.status, 403);

  // Prove it genuinely didn't change anything.
  var check = await developerClient.get('/api/records/' + aliceRecordId);
  assert.equal(check.data.record.counter, 'Counter 1 (edited by alice)');
});

test('a manager (carol) CAN edit records she did not create', async function () {
  var carolClient = makeClient();
  var loginRes = await login(carolClient, 'carol', 'CarolStrongPass123!');
  assert.equal(loginRes.status, 200, JSON.stringify(loginRes.data));
  await carolClient.mutate('POST', '/api/auth/change-password', {
    currentPassword: 'CarolStrongPass123!', newPassword: 'CarolEvenStrongerPass123!'
  });

  var patchRes = await carolClient.mutate('PATCH', '/api/records/' + aliceRecordId, { counter: 'reviewed by carol' });
  assert.equal(patchRes.status, 200, JSON.stringify(patchRes.data));
  assert.equal(patchRes.data.record.counter, 'reviewed by carol');
});

test('the developer can also edit/delete any record regardless of creator', async function () {
  var res = await developerClient.mutate('DELETE', '/api/records/' + aliceRecordId);
  assert.equal(res.status, 200, JSON.stringify(res.data));
});

test('an unauthenticated request to a protected endpoint is rejected', async function () {
  var anon = makeClient();
  await anon.get('/api/auth/captcha');
  var res = await anon.get('/api/records');
  assert.equal(res.status, 401);
});
