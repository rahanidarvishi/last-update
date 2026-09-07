'use strict';
var express = require('express');
var authMw = require('../middleware/auth');
var knex = require('../sql/knex').knex;

var router = express.Router();
var viewGuard = authMw.requirePermission('credit', 'view');

router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var q = req.query || {};

  // "Credit" lines are only records that still have money owed by the
  // agency (outstanding > 0) -- that filter is pushed into SQL, so
  // fully-settled records (the majority, over time) never get pulled out
  // of the database for this view at all.
  var depositSumSub = knex('record_deposits').select('record_id').sum({ depositSum: 'amount' }).groupBy('record_id').as('ds');
  var voucherNumbersSub = knex('record_vouchers').select('record_id')
    .select(knex.raw("group_concat(number, '، ') as voucherNumbers")).groupBy('record_id').as('vn');

  var query = knex('records')
    .leftJoin(depositSumSub, 'ds.record_id', 'records.id')
    .leftJoin(voucherNumbersSub, 'vn.record_id', 'records.id')
    .select('records.id as recordId', 'records.agency', 'records.counter', 'records.jy', 'records.jm', 'records.jd', 'records.total_amount as totalAmount')
    .select(knex.raw('COALESCE(ds.depositSum, 0) as depSum'))
    .select(knex.raw("COALESCE(vn.voucherNumbers, '') as voucherNumbers"))
    .whereRaw('(records.total_amount - COALESCE(ds.depositSum, 0)) > 0');

  if (q.agency) query = query.andWhere('records.agency', q.agency);

  query
    .then(function (rows) {
      var lines = rows.map(function (r) {
        return {
          recordId: r.recordId, agency: r.agency, counter: r.counter, voucherNumbers: r.voucherNumbers,
          totalAmount: r.totalAmount, depSum: r.depSum, outstanding: r.totalAmount - r.depSum,
          jy: r.jy, jm: r.jm, jd: r.jd
        };
      });
      if (q.search) {
        var s = String(q.search).toLowerCase();
        lines = lines.filter(function (l) { return (l.voucherNumbers + ' ' + l.agency + ' ' + l.counter).toLowerCase().indexOf(s) !== -1; });
      }
      lines.sort(function (a, b) { return (b.jy * 10000 + b.jm * 100 + b.jd) - (a.jy * 10000 + a.jm * 100 + a.jd); });

      var byAgency = {};
      lines.forEach(function (l) { byAgency[l.agency] = (byAgency[l.agency] || 0) + l.outstanding; });

      res.json({ lines: lines, totalsByAgency: byAgency });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت مانده‌های اعتباری' }); });
});

module.exports = router;
