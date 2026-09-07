'use strict';
var crypto = require('crypto');

/* =========================================================================
   CSRF protection -- double-submit cookie pattern.
   ---------------------------------------------------------------------
   The session cookie already has sameSite:'strict' (see server.js), which
   blocks the vast majority of real-world CSRF on its own. This adds a
   second, independent layer: a random token is set in a cookie that
   JavaScript CAN read (httpOnly:false, unlike the session cookie), and the
   frontend must echo that exact value back in a custom request header
   (X-CSRF-Token) on every state-changing call (see public/js/api.js).

   Why this still matters even with SameSite=strict:
   - It protects requests that a browser sends without honoring SameSite
     (older browsers, some in-app webviews).
   - It keeps working as a safety net if sameSite is ever relaxed later
     (e.g. to support an external link/integration) without anyone
     noticing CSRF protection quietly disappeared.
   - A cross-site attacker's page can trigger a request that carries the
     cookie automatically, but it cannot READ the cookie's value (browsers
     enforce same-origin on cookie access), so it cannot produce a matching
     header -- that's the whole trick of double-submit.
   ========================================================================= */

var COOKIE_NAME = 'darvishi.csrf';
var HEADER_NAME = 'x-csrf-token';
var SAFE_METHODS = { GET: true, HEAD: true, OPTIONS: true };

// No cookie-parser dependency in this project -- a raw Cookie header only
// ever needs this one value read back out of it, so a tiny manual parse is
// simpler than adding a new dependency for one line of functionality.
function readCookie(req, name) {
  var header = req.headers.cookie;
  if (!header) return null;
  var parts = header.split(';');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq === -1) continue;
    var key = parts[i].slice(0, eq).trim();
    if (key === name) return decodeURIComponent(parts[i].slice(eq + 1).trim());
  }
  return null;
}

// Runs on every request (API and static alike) so the token cookie exists
// before any page's JavaScript makes its first API call -- including the
// very first page load, before login.
function ensureCsrfCookie(forceSecureCookie) {
  return function (req, res, next) {
    var token = readCookie(req, COOKIE_NAME);
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      res.cookie(COOKIE_NAME, token, {
        httpOnly: false,
        sameSite: 'strict',
        secure: !!forceSecureCookie,
        maxAge: 1000 * 60 * 60 * 12 // matches the session cookie's lifetime
      });
    }
    next();
  };
}

// Verifies the double-submit token on any state-changing request. GET/HEAD/
// OPTIONS are exempt since they must never mutate state in the first place.
function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS[req.method]) return next();
  var cookieToken = readCookie(req, COOKIE_NAME);
  var headerToken = req.get(HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'درخواست نامعتبر است — لطفاً صفحه را رفرش کنید و دوباره امتحان کنید' });
  }
  next();
}

module.exports = {
  ensureCsrfCookie: ensureCsrfCookie,
  verifyCsrfToken: verifyCsrfToken,
  COOKIE_NAME: COOKIE_NAME,
  HEADER_NAME: HEADER_NAME
};
