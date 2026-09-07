'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var calc = require('../utils/calc');
var jalali = require('../utils/jalali');
var knex = require('../sql/knex').knex;

var router = express.Router();
var viewGuard = authMw.requirePermission('debt', 'view');
var editGuard = authMw.requirePermission('debt', 'edit');

// Debt lines only ever come from vouchers that actually have a supplier
// ("agent") and a non-zero amount owed to them -- pushing that filter into
// the query means we never pull unrelated vouchers (the vast majority, with
// no agent) out of the database at all.
function fetchAgentVoucherRows() {
  return knex('record_vouchers')
    .join('records', 'records.id', 'record_vouchers.record_id')
    .whereNot('record_vouchers.agent', '')
    .andWhere(function (qb) {
      qb.where('record_vouchers.purchase_amount', '>', 0).orWhere('record_vouchers.service_amount', '>', 0);
    })
    .select(
      'record_vouchers.id as voucher_id', 'record_vouchers.record_id', 'record_vouchers.number',
      'record_vouchers.agent', 'record_vouchers.hotel', 'record_vouchers.purchase_amount',
      'record_vouchers.purchase_currency', 'record_vouchers.service_amount',
      'record_vouchers.debt_settled', 'record_vouchers.debt_settled_at', 'record_vouchers.debt_receipt_file_name',
      'records.agency', 'records.counter', 'records.jy', 'records.jm', 'records.jd'
    );
}

function rowToDebtLine(row, currencyRates) {
  var amt = (row.purchase_amount || 0) + (row.service_amount || 0);
  var v = { purchaseAmount: row.purchase_amount, purchaseCurrency: row.purchase_currency, serviceAmount: row.service_amount };
  var record = { jy: row.jy, jm: row.jm, jd: row.jd };
  var rial = calc.voucherRialAmounts(v, record, currencyRates);
  return {
    voucherId: row.voucher_id, recordId: row.record_id, voucherNumber: row.number, agency: row.agency, counter: row.counter,
    agent: row.agent, hotel: row.hotel, purchaseAmount: row.purchase_amount || 0, serviceAmount: row.service_amount || 0,
    amount: amt, currency: row.purchase_currency || '—', jy: row.jy, jm: row.jm, jd: row.jd,
    exchangeRate: rial ? rial.rate : null, rialAmount: rial ? rial.totalRial : null,
    debtSettled: !!row.debt_settled, debtSettledAt: row.debt_settled_at || '', debtReceiptFileName: row.debt_receipt_file_name || ''
  };
}

router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var q = req.query || {};
  var data = dbMod.db();

  fetchAgentVoucherRows()
    .then(function (rows) {
      var allLines = rows.map(function (row) { return rowToDebtLine(row, data.currencyRates); });

      var lines = allLines;
      if (q.agent) lines = lines.filter(function (l) { return l.agent === q.agent; });
      if (q.status === 'unpaid') lines = lines.filter(function (l) { return !l.debtSettled; });
      if (q.status === 'paid') lines = lines.filter(function (l) { return l.debtSettled; });
      if (q.search) {
        var s = String(q.search).toLowerCase();
        lines = lines.filter(function (l) { return (l.voucherNumber + ' ' + l.agency + ' ' + l.counter + ' ' + l.agent).toLowerCase().indexOf(s) !== -1; });
      }
      lines.sort(function (a, b) { return (b.jy * 10000 + b.jm * 100 + b.jd) - (a.jy * 10000 + a.jm * 100 + a.jd); });

      var byAgent = {};
      allLines.forEach(function (l) {
        if (l.debtSettled) return;
        if (!byAgent[l.agent]) byAgent[l.agent] = {};
        byAgent[l.agent][l.currency] = (byAgent[l.agent][l.currency] || 0) + l.amount;
      });

      res.json({ lines: lines, unpaidTotalsByAgent: byAgent });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت بدهی‌ها' }); });
});

router.post('/settle', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var voucherIds = Array.isArray(body.voucherIds) ? body.voucherIds : [];
  if (!voucherIds.length) return res.status(400).json({ error: 'موردی برای علامت‌گذاری انتخاب نشده' });
  var t = jalali.todayJalali();
  var todayStr = jalali.jalaliStrOf(t.jy, t.jm, t.jd);

  var patch = { debt_settled: true, debt_settled_at: todayStr };
  if (body.receiptFileName) patch.debt_receipt_file_name = body.receiptFileName; // omit -> keep any existing filename

  knex('record_vouchers').whereIn('id', voucherIds)
    .update(patch)
    .then(function (count) { res.json({ ok: true, settledCount: count }); })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در ثبت تسویه' }); });
});

router.post('/revert', authMw.attachUser, editGuard, function (req, res) {
  var voucherId = (req.body || {}).voucherId;
  knex('record_vouchers').where('id', voucherId)
    .update({ debt_settled: false, debt_settled_at: '', debt_receipt_file_name: '' })
    .then(function (count) {
      if (!count) return res.status(404).json({ error: 'واچر یافت نشد' });
      res.json({ ok: true });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در بازگردانی' }); });
});

module.exports = router;
