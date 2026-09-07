'use strict';
var express = require('express');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var validate = require('../utils/validate');
var knex = require('../sql/knex').knex;

var router = express.Router();
var viewGuard = authMw.requirePermission('pending', 'view');
var editGuard = authMw.requirePermission('pending', 'edit');

function toApiShape(row) {
  return {
    id: row.id, amount: row.amount, jy: row.jy, jm: row.jm, jd: row.jd,
    platform: row.platform, note: row.note || '', createdAt: row.created_at,
    bound: !!row.bound, boundRecordId: row.bound_record_id || null
  };
}

router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var status = (req.query || {}).status || 'unbound';
  var q = knex('pending_deposits');
  if (status === 'unbound') q = q.where('bound', false);
  if (status === 'bound') q = q.where('bound', true);
  q.orderBy('created_at', 'desc').select()
    .then(function (rows) { res.json({ pendingDeposits: rows.map(toApiShape) }); })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت پیش‌واریزی‌ها' }); });
});

router.post('/', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var amount = parseFloat(body.amount);
  var jy = parseInt(body.jy, 10), jm = parseInt(body.jm, 10), jd = parseInt(body.jd, 10);
  if (!validate.isPositiveNumber(amount) || !validate.isValidJalaliDate(jy, jm, jd) || !validate.isNonEmptyString(body.platform)) {
    return res.status(400).json({ error: 'مبلغ، تاریخ و پلتفرم را کامل و معتبر وارد کنید' });
  }
  var row = {
    id: uid('pd'), amount: amount, jy: jy, jm: jm, jd: jd, platform: body.platform,
    note: String(body.note || '').trim(), created_at: new Date().toISOString(), bound: false, bound_record_id: null
  };
  knex('pending_deposits').insert(row)
    .then(function () { res.json({ pendingDeposit: toApiShape(row) }); })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در ثبت پیش‌واریزی' }); });
});

router.delete('/:id', authMw.attachUser, editGuard, function (req, res) {
  knex('pending_deposits').where('id', req.params.id).first()
    .then(function (p) {
      if (!p) { res.status(404).json({ error: 'پیش‌واریزی یافت نشد' }); return null; }
      // A pending deposit that has already been bound into a record's deposit
      // list must not be deletable from here — doing so would silently orphan
      // the record's financial history. Unbind it from the record first.
      if (p.bound) { res.status(400).json({ error: 'این پیش‌واریزی به یک رکورد متصل شده و قابل حذف نیست — ابتدا از داخل همان رکورد آن را جدا کنید' }); return null; }
      return knex('pending_deposits').where('id', req.params.id).del().then(function () { res.json({ ok: true }); });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در حذف پیش‌واریزی' }); });
});

module.exports = router;
