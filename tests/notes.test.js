'use strict';
/* =========================================================================
   Integration test for the personal notes feature (/api/notes).
   Boots the real server the same way tests/integration.test.js does, then
   proves:
     - a user only ever sees their OWN notes from GET /api/notes
     - search matches title/content, case-insensitively
     - a user cannot edit or delete someone else's note (403)
     - only the developer can hit GET /api/notes/all, and it is read-only
       (view/search everyone's notes -- it must never allow editing them)
   ========================================================================= */
var test = require('node:test');
var assert = require('node:assert/strict');
var { spawn } = require('node:child_process');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');

var PORT = 24000 + (process.pid % 15000);
var BASE = 'http://127.0.0.1:' + PORT;
var DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'darvishi-notes-test-'));
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

function makeClient() {
  var cookies = {};
  function cookieHeader() { return Object.keys(cookies).map(function (k) { return k + '=' + cookies[k]; }).join('; '); }
  function absorbSetCookie(res) {
    var setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    setCookies.forEach(function (sc) {
      var first = sc.split(';')[0]; var eq = first.indexOf('=');
      if (eq !== -1) cookies[first.slice(0, eq)] = first.slice(eq + 1);
    });
  }
  async function call(method, p, body, extraHeaders) {
    var headers = Object.assign({}, extraHeaders || {});
    if (cookieHeader()) headers['Cookie'] = cookieHeader();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var res = await fetch(BASE + p, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    absorbSetCookie(res);
    var data = null; try { data = await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, data: data };
  }
  return {
    csrfToken: function () { return cookies['darvishi.csrf'] || null; },
    get: function (p) { return call('GET', p); },
    mutate: function (method, p, body) {
      var headers = {};
      var t = this.csrfToken();
      if (t) headers['X-CSRF-Token'] = t;
      return call(method, p, body, headers);
    }
  };
}

async function login(client, username, password) {
  var capRes = await client.get('/api/auth/captcha');
  var m = /^(\d+)\s*([+-])\s*(\d+)/.exec(capRes.data.question);
  var answer = m[2] === '+' ? parseInt(m[1], 10) + parseInt(m[3], 10) : parseInt(m[1], 10) - parseInt(m[3], 10);
  return client.mutate('POST', '/api/auth/login', { username: username, password: password, captcha: String(answer) });
}

var developerClient, aliceClient, bobClient, staffRoleId;
var alicePrivateNoteId;

test('developer logs in, changes password, creates two staff users', async function () {
  var raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
  var userM = /نام کاربری: (.+)/.exec(raw);
  var passM = /رمز عبور: (.+)/.exec(raw);

  developerClient = makeClient();
  var res = await login(developerClient, userM[1].trim(), passM[1].trim());
  assert.equal(res.status, 200, JSON.stringify(res.data));

  var change = await developerClient.mutate('POST', '/api/auth/change-password', {
    currentPassword: passM[1].trim(), newPassword: 'DeveloperStrongPass123!'
  });
  assert.equal(change.status, 200, JSON.stringify(change.data));

  var rolesRes = await developerClient.get('/api/roles');
  var staff = rolesRes.data.roles.find(function (r) { return r.name.indexOf('کارشناس') !== -1; });
  staffRoleId = staff.id;

  var users = [
    { username: 'notes_alice', password: 'AliceStrongPass123!', fullName: 'Alice Notes', roleId: staffRoleId },
    { username: 'notes_bob', password: 'BobStrongPass123!', fullName: 'Bob Notes', roleId: staffRoleId }
  ];
  for (var i = 0; i < users.length; i++) {
    var uRes = await developerClient.mutate('POST', '/api/users', users[i]);
    assert.equal(uRes.status, 200, JSON.stringify(uRes.data));
  }
});

test('alice creates a private note and can see it in her own list', async function () {
  aliceClient = makeClient();
  var loginRes = await login(aliceClient, 'notes_alice', 'AliceStrongPass123!');
  assert.equal(loginRes.status, 200, JSON.stringify(loginRes.data));
  await aliceClient.mutate('POST', '/api/auth/change-password', {
    currentPassword: 'AliceStrongPass123!', newPassword: 'AliceEvenStrongerPass123!'
  });

  var created = await aliceClient.mutate('POST', '/api/notes', {
    title: 'یادداشت محرمانه آلیس', content: 'این متن فقط باید برای خودم دیده بشه', color: 'pink'
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  alicePrivateNoteId = created.data.note.id;
  assert.equal(created.data.note.color, 'pink');

  var list = await aliceClient.get('/api/notes');
  assert.equal(list.status, 200);
  assert.equal(list.data.notes.length, 1);
  assert.equal(list.data.notes[0].id, alicePrivateNoteId);
});

test("bob cannot see alice's note in his own list, and cannot edit/delete it", async function () {
  bobClient = makeClient();
  var loginRes = await login(bobClient, 'notes_bob', 'BobStrongPass123!');
  assert.equal(loginRes.status, 200, JSON.stringify(loginRes.data));
  await bobClient.mutate('POST', '/api/auth/change-password', {
    currentPassword: 'BobStrongPass123!', newPassword: 'BobEvenStrongerPass123!'
  });

  var bobList = await bobClient.get('/api/notes');
  assert.equal(bobList.status, 200);
  assert.equal(bobList.data.notes.length, 0, "bob's note list must not contain alice's note");

  var patchRes = await bobClient.mutate('PATCH', '/api/notes/' + alicePrivateNoteId, { content: 'hijacked' });
  assert.equal(patchRes.status, 403);

  var delRes = await bobClient.mutate('DELETE', '/api/notes/' + alicePrivateNoteId);
  assert.equal(delRes.status, 403);

  // GET /api/notes/all must be off-limits to a non-developer entirely.
  var allRes = await bobClient.get('/api/notes/all');
  assert.equal(allRes.status, 403);
});

test('search matches title/content case-insensitively, within the searching user\'s own notes only', async function () {
  await bobClient.mutate('POST', '/api/notes', { title: 'Follow up with Acme Agency', content: '' });
  await bobClient.mutate('POST', '/api/notes', { title: 'یادآوری', content: 'تماس با آژانس آسیا' });

  var res = await bobClient.get('/api/notes?search=' + encodeURIComponent('acme'));
  assert.equal(res.status, 200);
  assert.equal(res.data.notes.length, 1);
  assert.match(res.data.notes[0].title, /Acme/);
});

test('the developer can search/view everyone\'s notes via /api/notes/all, but cannot edit them', async function () {
  var res = await developerClient.get('/api/notes/all?search=' + encodeURIComponent('محرمانه'));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.notes.length, 1);
  assert.equal(res.data.notes[0].id, alicePrivateNoteId);
  assert.equal(res.data.notes[0].ownerUsername, 'notes_alice');

  // Read-only: there is deliberately no PATCH/DELETE path for the developer
  // on someone else's note -- the same ownership check alice/bob hit above
  // applies equally to the developer.
  var patchRes = await developerClient.mutate('PATCH', '/api/notes/' + alicePrivateNoteId, { content: 'edited by developer' });
  assert.equal(patchRes.status, 403);
});

test('pinning and unpinning a note works and affects ordering', async function () {
  var second = await aliceClient.mutate('POST', '/api/notes', { title: 'دومی', content: 'x' });
  var pin = await aliceClient.mutate('PATCH', '/api/notes/' + alicePrivateNoteId, { pinned: true });
  assert.equal(pin.status, 200);
  assert.equal(pin.data.note.pinned, true);

  var list = await aliceClient.get('/api/notes');
  assert.equal(list.data.notes[0].id, alicePrivateNoteId, 'pinned note must sort first');
  assert.ok(second.data.note.id);
});

test('an empty note (no title, no content) is rejected', async function () {
  var res = await aliceClient.mutate('POST', '/api/notes', { title: '  ', content: '' });
  assert.equal(res.status, 400);
});
