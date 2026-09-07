'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;

var router = express.Router();

/* =========================================================================
   Personal sticky notes — deliberately NOT part of the MODULES/permissions
   system (see db.js). Every logged-in user gets their own private notes
   with no role/admin setup required, the same way "پروفایل من" always is.
   The only special case is the developer, who can additionally search/view
   (read-only) everyone's notes -- see GET /all below.
   ========================================================================= */

var MAX_TITLE_LEN = 150;
var MAX_CONTENT_LEN = 20000;
var COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
var DEFAULT_COLOR = 'yellow';

function publicNote(n) {
  return {
    id: n.id, title: n.title, content: n.content, color: n.color,
    pinned: !!n.pinned, createdAt: n.createdAt, updatedAt: n.updatedAt
  };
}

function sortNotes(list) {
  // Pinned first, then most-recently-updated first within each group.
  return list.slice().sort(function (a, b) {
    if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function matchesSearch(n, needle) {
  if (!needle) return true;
  var hay = (n.title + ' ' + n.content).toLowerCase();
  return hay.indexOf(needle) !== -1;
}

/* ---- own notes ---- */

router.get('/', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var data = dbMod.db();
  var needle = String((req.query || {}).search || '').trim().toLowerCase();
  var mine = data.notes.filter(function (n) { return n.userId === req.currentUser.id; });
  if (needle) mine = mine.filter(function (n) { return matchesSearch(n, needle); });
  res.json({ notes: sortNotes(mine).map(publicNote) });
});

router.post('/', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var body = req.body || {};
  var title = String(body.title || '').trim().slice(0, MAX_TITLE_LEN);
  var content = String(body.content || '').slice(0, MAX_CONTENT_LEN);
  if (!title && !content.trim()) {
    return res.status(400).json({ error: 'یادداشت خالی است — عنوان یا متنی وارد کنید' });
  }
  var color = COLORS.indexOf(body.color) !== -1 ? body.color : DEFAULT_COLOR;
  var now = new Date().toISOString();
  var note = {
    id: uid('note'), userId: req.currentUser.id, title: title, content: content,
    color: color, pinned: false, createdAt: now, updatedAt: now
  };
  var data = dbMod.db();
  data.notes.push(note);
  dbMod.saveSync();
  res.json({ note: publicNote(note) });
});

router.patch('/:id', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var data = dbMod.db();
  var note = data.notes.find(function (n) { return n.id === req.params.id; });
  if (!note) return res.status(404).json({ error: 'یادداشت یافت نشد' });
  // Notes are strictly private -- even the developer cannot edit someone
  // else's note, only search/view it (see GET /all). Only the owner can
  // change their own note's content.
  if (note.userId !== req.currentUser.id) {
    return res.status(403).json({ error: 'شما فقط می‌توانید یادداشت‌های خودتان را ویرایش کنید' });
  }
  var body = req.body || {};
  if (body.title !== undefined) note.title = String(body.title).trim().slice(0, MAX_TITLE_LEN);
  if (body.content !== undefined) note.content = String(body.content).slice(0, MAX_CONTENT_LEN);
  if (body.color !== undefined && COLORS.indexOf(body.color) !== -1) note.color = body.color;
  if (body.pinned !== undefined) note.pinned = !!body.pinned;
  if (!note.title && !note.content.trim()) {
    return res.status(400).json({ error: 'یادداشت خالی است — عنوان یا متنی وارد کنید' });
  }
  note.updatedAt = new Date().toISOString();
  dbMod.saveSync();
  res.json({ note: publicNote(note) });
});

router.delete('/:id', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var data = dbMod.db();
  var note = data.notes.find(function (n) { return n.id === req.params.id; });
  if (!note) return res.status(404).json({ error: 'یادداشت یافت نشد' });
  if (note.userId !== req.currentUser.id) {
    return res.status(403).json({ error: 'شما فقط می‌توانید یادداشت‌های خودتان را حذف کنید' });
  }
  data.notes = data.notes.filter(function (n) { return n.id !== note.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

/* ---- developer: search/view everyone's notes (read-only) ---- */

function requireDeveloper(req, res, next) {
  if (!req.currentUser) return res.status(401).json({ error: 'ابتدا وارد سیستم شوید' });
  if (!req.currentUser.isDeveloper) return res.status(403).json({ error: 'فقط توسعه‌دهنده به این بخش دسترسی دارد' });
  next();
}

router.get('/all', authMw.attachUser, requireDeveloper, function (req, res) {
  var data = dbMod.db();
  var needle = String((req.query || {}).search || '').trim().toLowerCase();
  var userFilter = String((req.query || {}).userId || '').trim();
  var usersById = {};
  data.users.forEach(function (u) { usersById[u.id] = u; });

  var list = data.notes.slice();
  if (userFilter) list = list.filter(function (n) { return n.userId === userFilter; });
  if (needle) list = list.filter(function (n) { return matchesSearch(n, needle); });

  var decorated = sortNotes(list).map(function (n) {
    var owner = usersById[n.userId];
    var out = publicNote(n);
    out.userId = n.userId;
    out.ownerName = owner ? owner.fullName : '—';
    out.ownerUsername = owner ? owner.username : '—';
    return out;
  });
  res.json({
    notes: decorated,
    users: data.users.map(function (u) { return { id: u.id, fullName: u.fullName }; })
  });
});

module.exports = router;
