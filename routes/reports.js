'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var calc = require('../utils/calc');
var jalali = require('../utils/jalali');
var knex = require('../sql/knex').knex;
var recSql = require('../utils/recordsSql');

var router = express.Router();
var viewGuard = authMw.requirePermission('reports', 'view');

var DIMENSION_FIELD = {
  procurementExpert: function (r) { return r.procurementExpert || '(بدون کارشناس)'; },
  counter: function (r) { return r.counter || '(بدون کانتر)'; },
  agency: function (r) { return r.agency || '(بدون آژانس)'; },
  createdBy: function (r) { return r.createdByFullName || r.createdByUsername || '(نامشخص)'; }
};

function periodKeyOf(period, r) {
  if (period === 'week') return jalali.jalaliWeekKey(r.jy, r.jm, r.jd);
  if (period === 'month') return jalali.jalaliMonthKey(r.jy, r.jm);
  if (period === 'year') return jalali.jalaliYearKey(r.jy);
  return jalali.jalaliStrOf(r.jy, r.jm, r.jd); // day
}
function periodLabelOf(period, r) {
  if (period === 'month') return jalali.PERSIAN_MONTHS[r.jm - 1] + ' ' + r.jy;
  if (period === 'year') return '' + r.jy;
  if (period === 'week') return 'هفته منتهی به ' + jalali.jalaliStrOf(r.jy, r.jm, r.jd);
  return jalali.jalaliStrOf(r.jy, r.jm, r.jd);
}

router.get('/performance', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var q = req.query || {};
  var dimension = DIMENSION_FIELD[q.dimension] ? q.dimension : 'procurementExpert';
  var period = ['day', 'week', 'month', 'year'].indexOf(q.period) !== -1 ? q.period : 'month';

  // A report is, by definition, scoped to a date range -- pushing that
  // range into the SQL query means an "این ماه" or "امسال" report never
  // touches years of unrelated historical records to compute it. With no
  // range given (rare -- an all-time report), it falls back to everything,
  // same as before.
  //
  // Date-range comparison needs a single sortable key, not three separate
  // column comparisons (jy/jm/jd) which can't express "on/after" correctly
  // across a year or month boundary with independent >= per column -- so we
  // compare against the same (jy*10000+jm*100+jd) key used everywhere else
  // in this codebase, computed in SQL.
  var dateKeyExpr = "(records.jy * 10000 + records.jm * 100 + records.jd)";
  var recordsQuery = knex('records');
  if (q.from) {
    var fm2 = /^(\d+)\/(\d+)\/(\d+)$/.exec(String(q.from));
    if (fm2) recordsQuery = recordsQuery.andWhereRaw(dateKeyExpr + ' >= ?', [+fm2[1] * 10000 + +fm2[2] * 100 + +fm2[3]]);
  }
  if (q.to) {
    var tm = /^(\d+)\/(\d+)\/(\d+)$/.exec(String(q.to));
    if (tm) recordsQuery = recordsQuery.andWhereRaw(dateKeyExpr + ' <= ?', [+tm[1] * 10000 + +tm[2] * 100 + +tm[3]]);
  }

  recSql.fetchFullRecords(recordsQuery.select())
    .then(function (records) {
      var dimensionValue = q.dimensionValue;
      var recordsForPeriodChart = dimensionValue
        ? records.filter(function (r) { return DIMENSION_FIELD[dimension](r) === dimensionValue; })
        : records;

      function emptyAgg() { return { recordCount: 0, voucherCount: 0, totalSales: 0, totalCost: 0, totalProfit: 0, totalDeposits: 0, unknownCostCount: 0 }; }
      function addRecord(agg, r) {
        var cost = calc.totalPurchaseCostRial(r, data.currencyRates);
        agg.recordCount += 1;
        agg.voucherCount += r.vouchers.length;
        agg.totalSales += (r.totalAmount || 0);
        agg.totalDeposits += calc.depositSumOf(r);
        // A record whose cost can't be computed (missing FX rate for a
        // currency it used) is excluded from totalCost/totalProfit rather
        // than silently counted as zero cost -- that would inflate profit.
        // unknownCostCount tells the frontend to warn the totals are partial.
        if (cost == null) {
          agg.unknownCostCount += 1;
        } else {
          agg.totalCost += cost;
          agg.totalProfit += (r.totalAmount || 0) - cost;
        }
      }

      // 1) grouped by dimension (ignores dimensionValue filter -- this IS the breakdown)
      var byDimensionMap = {};
      records.forEach(function (r) {
        var key = DIMENSION_FIELD[dimension](r);
        if (!byDimensionMap[key]) byDimensionMap[key] = emptyAgg();
        addRecord(byDimensionMap[key], r);
      });
      var byDimension = Object.keys(byDimensionMap).map(function (key) {
        return Object.assign({ key: key }, byDimensionMap[key]);
      }).sort(function (a, b) { return b.totalSales - a.totalSales; });

      // 2) grouped by time period (respects dimensionValue filter, for "X در طول زمان")
      var byPeriodMap = {};
      recordsForPeriodChart.forEach(function (r) {
        var pk = periodKeyOf(period, r);
        if (!byPeriodMap[pk]) byPeriodMap[pk] = Object.assign({ periodKey: pk, periodLabel: periodLabelOf(period, r) }, emptyAgg());
        addRecord(byPeriodMap[pk], r);
      });
      var byPeriod = Object.keys(byPeriodMap).map(function (k) { return byPeriodMap[k]; })
        .sort(function (a, b) { return a.periodKey < b.periodKey ? -1 : (a.periodKey > b.periodKey ? 1 : 0); });

      // 3) overall summary (respects dimensionValue filter)
      var summary = emptyAgg();
      recordsForPeriodChart.forEach(function (r) { addRecord(summary, r); });

      res.json({
        dimension: dimension, period: period, dimensionValue: dimensionValue || null,
        byDimension: byDimension, byPeriod: byPeriod, summary: summary,
        availableDimensionValues: Object.keys(byDimensionMap)
      });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در تولید گزارش' }); });
});

module.exports = router;
