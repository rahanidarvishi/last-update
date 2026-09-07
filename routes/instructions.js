'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;

var router = express.Router();
var viewGuard = authMw.requirePermission('instructions', 'view');
var editGuard = authMw.requirePermission('instructions', 'edit'); // only department managers (+ developer) get edit on this module

var MAX_DEPARTMENT_LEN = 100;
var MAX_SUBJECT_LEN = 150;
var MAX_DESCRIPTION_LEN = 5000;

function publicInstruction(ins) {
  return {
    id: ins.id,
    department: ins.department,
    subject: ins.subject,
    description: ins.description,
    createdBy: ins.createdBy,
    createdByName: ins.createdByName,
    createdAt: ins.createdAt
  };
}

// GET / — everyone with view access gets the full list; ?department=, ?subject=
// and ?search= (matches across both fields + description) narrow it down.
// Also returns the distinct list of departments already in use, so the
// frontend can offer them as quick-filter chips, and whether the current
// user is allowed to create a new instruction (drives the "+ new" form).
router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var q = req.query || {};
  var data = dbMod.db();
  var list = data.instructions.slice();

  if (q.department) {
    var dep = String(q.department).trim().toLowerCase();
    list = list.filter(function (i) { return i.department.toLowerCase().indexOf(dep) !== -1; });
  }
  if (q.subject) {
    var subj = String(q.subject).trim().toLowerCase();
    list = list.filter(function (i) { return i.subject.toLowerCase().indexOf(subj) !== -1; });
  }
  if (q.search) {
    var s = String(q.search).trim().toLowerCase();
    list = list.filter(function (i) {
      return (i.department + ' ' + i.subject + ' ' + i.description).toLowerCase().indexOf(s) !== -1;
    });
  }
  list.sort(function (a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });

  var departments = Array.from(new Set(data.instructions.map(function (i) { return i.department; }))).sort();
  var perm = req.currentUser.permissions && req.currentUser.permissions.instructions;
  var canCreate = !!(req.currentUser.isDeveloper || (perm && perm.edit));

  res.json({
    instructions: list.map(publicInstruction),
    departments: departments,
    canCreate: canCreate
  });
});

router.post('/', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var department = String(body.department || '').trim();
  var subject = String(body.subject || '').trim();
  var description = String(body.description || '').trim();

  if (!department) return res.status(400).json({ error: 'بخش را وارد کنید' });
  if (!subject) return res.status(400).json({ error: 'موضوع را وارد کنید' });
  if (!description) return res.status(400).json({ error: 'توضیحات را وارد کنید' });
  if (department.length > MAX_DEPARTMENT_LEN) return res.status(400).json({ error: 'نام بخش خیلی طولانی است' });
  if (subject.length > MAX_SUBJECT_LEN) return res.status(400).json({ error: 'موضوع خیلی طولانی است' });
  if (description.length > MAX_DESCRIPTION_LEN) return res.status(400).json({ error: 'توضیحات خیلی طولانی است' });

  var data = dbMod.db();
  var ins = {
    id: uid('instr'),
    department: department,
    subject: subject,
    description: description,
    createdBy: req.currentUser.id,
    createdByName: req.currentUser.fullName,
    createdAt: new Date().toISOString()
  };
  data.instructions.push(ins);
  dbMod.saveSync();
  res.json({ instruction: publicInstruction(ins) });
});

// Only the person who wrote it (or the developer) can remove a mistaken entry —
// everyone else with edit access can still add their own, but not touch others'.
router.delete('/:id', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var ins = data.instructions.find(function (i) { return i.id === req.params.id; });
  if (!ins) return res.status(404).json({ error: 'دستورالعمل یافت نشد' });
  var allowed = req.currentUser.isDeveloper || ins.createdBy === req.currentUser.id;
  if (!allowed) return res.status(403).json({ error: 'فقط سازنده یا توسعه‌دهنده می‌تواند این دستورالعمل را حذف کند' });
  data.instructions = data.instructions.filter(function (i) { return i.id !== req.params.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

module.exports = router;
