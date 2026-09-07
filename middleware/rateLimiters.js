'use strict';
var rateLimit = require('express-rate-limit');

// Applied to endpoints that change account security state — password
// changes, user creation, admin password resets, role/permission edits.
// Keyed by the logged-in user's session (falls back to IP pre-login), so one
// legitimate admin doing normal work never gets throttled by another user's
// activity, but a compromised/scripted session hammering these endpoints does.
var sensitiveActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function (req) {
    return (req.session && req.session.userId) ? ('u:' + req.session.userId) : req.ip;
  },
  message: { error: 'تعداد درخواست‌های شما بیش از حد مجاز بود — چند دقیقه دیگر دوباره امتحان کنید' }
});

module.exports = { sensitiveActionLimiter: sensitiveActionLimiter };
