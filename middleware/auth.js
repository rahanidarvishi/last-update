'use strict';
var dbMod = require('../db');

var ACTIVITY_THROTTLE_MS = 60 * 1000; // update lastActiveAt at most once a minute per user

function getUserWithRole(userId) {
  var data = dbMod.db();
  var user = data.users.find(function (u) { return u.id === userId && u.active; });
  if (!user) return null;
  var role = data.roles.find(function (r) { return r.id === user.roleId; });
  if (!role) return null;
  return { user: user, role: role };
}

// Attaches req.currentUser (safe fields only) when a valid session exists.
// Never blocks the request by itself — routes decide what they need.
function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    var found = getUserWithRole(req.session.userId);
    if (found) {
      req.currentUser = {
        id: found.user.id,
        username: found.user.username,
        fullName: found.user.fullName,
        mustChangePassword: !!found.user.mustChangePassword,
        roleId: found.role.id,
        roleName: found.role.name,
        isDeveloper: !!found.role.isDeveloper,
        canViewAllMessages: !!found.role.canViewAllMessages,
        permissions: found.role.permissions,
        managerId: found.user.managerId || null,
        photoDataUrl: found.user.photoDataUrl || '',
        extension: found.user.extension || '',
        position: found.user.position || ''
      };
      // Cheap "who's online" signal for the monitoring dashboard — throttled
      // so a busy user doesn't trigger a disk write on every single API call.
      var now = Date.now();
      var last = found.user.lastActiveAt ? new Date(found.user.lastActiveAt).getTime() : 0;
      if (now - last > ACTIVITY_THROTTLE_MS) {
        found.user.lastActiveAt = new Date(now).toISOString();
        dbMod.save();
      }
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.currentUser) return res.status(401).json({ error: 'ابتدا وارد سیستم شوید' });
  next();
}

// level: 'view' | 'edit'. Developer role always passes. 'edit' does NOT
// automatically require 'view' to also be true in the stored data — in
// practice the permissions UI always keeps view checked when edit is
// checked, but we double-check here for safety.
function requirePermission(moduleKey, level) {
  return function (req, res, next) {
    if (!req.currentUser) return res.status(401).json({ error: 'ابتدا وارد سیستم شوید' });
    if (req.currentUser.isDeveloper) return next();
    var perm = req.currentUser.permissions && req.currentUser.permissions[moduleKey];
    var ok = perm && (level === 'edit' ? perm.edit : (perm.view || perm.edit));
    if (!ok) return res.status(403).json({ error: 'دسترسی لازم برای این بخش را ندارید' });
    next();
  };
}

module.exports = { attachUser: attachUser, requireAuth: requireAuth, requirePermission: requirePermission, getUserWithRole: getUserWithRole };
