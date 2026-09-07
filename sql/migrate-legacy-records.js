'use strict';
/* =========================================================================
   One-time data migration: legacy in-memory `records` / `pendingDeposits`
   collections (db.js, the "entities" table) -> the new normalized,
   indexed SQL tables (sql/knex.js, darvishi-sql.db).

   Mirrors the same spirit as db.js's own migrateFromLegacyJson: run once,
   automatically, at boot; verify the result; never delete the old data
   (it stays in data/darvishi.db as a safety net, just unused going forward
   by routes/records.js and routes/pending.js).

   SAFETY / IDEMPOTENCY: if the new `records` table already has any rows,
   this is skipped entirely — it only ever runs against a genuinely empty
   new store, so re-running the app never double-imports or overwrites
   anything.
   ========================================================================= */
var dbMod = require('../db');
var knex = require('./knex').knex;

function sum(arr, fn) { return arr.reduce(function (s, x) { return s + (fn(x) || 0); }, 0); }

function migrateIfNeeded() {
  return Promise.all([
    knex('records').count({ c: 'id' }).first(),
    knex('pending_deposits').count({ c: 'id' }).first(),
    knex('tour_bookings').count({ c: 'id' }).first()
  ]).then(function (counts) {
    // Records and pending deposits are migrated together in one job
    // (migrateRecordsAndPending), so "already done" must check BOTH tables,
    // not just `records`. Checking only `records` meant an agency with
    // pending deposits but zero completed sales yet would leave `records`
    // permanently empty after migration, so recordsAlreadyMigrated would
    // stay false forever -- and every restart would try to re-INSERT the
    // same pending_deposits rows again and crash on the primary key
    // conflict. Both tables must show data (or neither did anything worth
    // redoing) before this is considered done.
    var recordsAndPendingAlreadyMigrated = (counts[0] && counts[0].c > 0) || (counts[1] && counts[1].c > 0);
    var bookingsAlreadyMigrated = counts[2] && counts[2].c > 0;

    var data = dbMod.db();
    var legacyRecords = data.records || [];
    var legacyPending = data.pendingDeposits || [];
    var legacyBookings = data.tourBookings || [];

    var jobs = [];
    if (!recordsAndPendingAlreadyMigrated && (legacyRecords.length || legacyPending.length)) {
      jobs.push(migrateRecordsAndPending(legacyRecords, legacyPending));
    } else if (recordsAndPendingAlreadyMigrated) {
      console.log('مهاجرت رکوردها به SQL: قبلاً انجام شده — رد شد.');
    }
    if (!bookingsAlreadyMigrated && legacyBookings.length) {
      jobs.push(migrateTourBookings(legacyBookings));
    } else if (bookingsAlreadyMigrated) {
      console.log('مهاجرت رزروهای تور به SQL: قبلاً انجام شده — رد شد.');
    }
    if (!jobs.length) console.log('مهاجرت داده به SQL: داده‌ی قدیمی‌ای برای مهاجرت پیدا نشد (شروع تازه).');
    return Promise.all(jobs);
  });
}

function migrateRecordsAndPending(legacyRecords, legacyPending) {
    console.log('در حال مهاجرت ' + legacyRecords.length + ' رکورد و ' + legacyPending.length + ' پیش‌واریزی به جداول SQL...');

    var pendingRows = legacyPending.map(function (p) {
      return {
        id: p.id, amount: p.amount, jy: p.jy, jm: p.jm, jd: p.jd, platform: p.platform,
        note: p.note || '', created_at: p.createdAt || new Date().toISOString(),
        bound: !!p.bound, bound_record_id: p.boundRecordId || null
      };
    });

    var recordRows = [], voucherRows = [], depositRows = [];
    legacyRecords.forEach(function (r) {
      recordRows.push({
        id: r.id, created_at: r.createdAt || new Date().toISOString(), jy: r.jy, jm: r.jm, jd: r.jd,
        agency: r.agency, counter: r.counter, procurement_expert: r.procurementExpert || '',
        created_by_user_id: r.createdByUserId, created_by_username: r.createdByUsername, created_by_full_name: r.createdByFullName,
        total_amount: r.totalAmount || 0, needs_correction: !!r.needsCorrection
      });
      (r.vouchers || []).forEach(function (v) {
        voucherRows.push({
          id: v.id, record_id: r.id, number: v.number, stay_city: v.stayCity || '', hotel: v.hotel || '', agent: v.agent || '',
          purchase_amount: v.purchaseAmount || 0, purchase_currency: v.purchaseCurrency || '', service_amount: v.serviceAmount || 0,
          flight_out_origin: v.flightOutOrigin || '', flight_out_destination: v.flightOutDestination || '',
          flight_in_origin: v.flightInOrigin || '', flight_in_destination: v.flightInDestination || '',
          flight_out_price_million: v.flightOutPriceMillion || 0, flight_in_price_million: v.flightInPriceMillion || 0,
          debt_settled: !!v.debtSettled, debt_settled_at: v.debtSettledAt || '', debt_receipt_file_name: v.debtReceiptFileName || ''
        });
      });
      (r.deposits || []).forEach(function (d) {
        depositRows.push({
          id: d.id || (r.id + '_d_' + depositRows.length), record_id: r.id, amount: d.amount, jy: d.jy, jm: d.jm, jd: d.jd,
          platform: d.platform, from_pending_id: d.fromPendingId || null
        });
      });
    });

    return knex.transaction(function (trx) {
      return insertChunked(trx, 'pending_deposits', pendingRows)
        .then(function () { return insertChunked(trx, 'records', recordRows); })
        .then(function () { return insertChunked(trx, 'record_vouchers', voucherRows); })
        .then(function () { return insertChunked(trx, 'record_deposits', depositRows); });
    }).then(function () {
      return verifyRecords(legacyRecords, legacyPending);
    });
}

function migrateTourBookings(legacyBookings) {
  console.log('در حال مهاجرت ' + legacyBookings.length + ' رزرو تور به جدول SQL...');
  var rows = legacyBookings.map(function (b) {
    var pricing = b.pricing || {};
    return {
      id: b.id, voucher_number: b.voucherNumber, created_at: b.createdAt || new Date().toISOString(),
      jy: b.jy, jm: b.jm, jd: b.jd, agency: b.agency, counter: b.counter, procurement_expert: b.procurementExpert || '',
      created_by_user_id: b.createdByUserId, created_by_full_name: b.createdByFullName,
      status: b.status || 'confirmed', needs_correction: !!b.needsCorrection,
      hotel_json: JSON.stringify(b.hotel || null), services_json: JSON.stringify(b.services || []),
      flight_out_json: JSON.stringify(b.flightOut || null), flight_in_json: JSON.stringify(b.flightIn || null),
      passengers_json: JSON.stringify(b.passengers || []), history_json: JSON.stringify(b.history || []),
      pricing_total_cost_rial: pricing.totalCostRial || 0, pricing_suggested_selling_rial: pricing.suggestedSellingRial || 0,
      pricing_selling_total_rial: pricing.sellingTotalRial || 0, pricing_profit_rial: pricing.profitRial || 0,
      pricing_cost_fully_known: pricing.costFullyKnown !== false
    };
  });
  return knex.transaction(function (trx) { return insertChunked(trx, 'tour_bookings', rows); })
    .then(function () { return verifyTourBookings(legacyBookings); });
}

// Insert in batches -- SQLite has a limit on bound parameters per statement,
// and better-sqlite3 (via Knex) sends one INSERT per call here, so very
// large legacy datasets are chunked defensively.
var CHUNK = 500;
function insertChunked(trx, table, rows) {
  if (!rows.length) return Promise.resolve();
  var chunks = [];
  for (var i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
  return chunks.reduce(function (p, chunk) { return p.then(function () { return trx(table).insert(chunk); }); }, Promise.resolve());
}

// Re-reads everything back out of SQL and checks it against the source
// data by count and by sum of every money figure that matters -- a count
// match alone wouldn't catch, say, a truncated amount.
function verifyRecords(legacyRecords, legacyPending) {
  return Promise.all([
    knex('records').count({ c: 'id' }).first(),
    knex('records').sum({ s: 'total_amount' }).first(),
    knex('record_vouchers').sum({ p: 'purchase_amount', srv: 'service_amount' }).first(),
    knex('record_deposits').sum({ s: 'amount' }).first(),
    knex('pending_deposits').count({ c: 'id' }).first()
  ]).then(function (results) {
    var newRecordCount = results[0].c;
    var newTotalAmount = results[1].s || 0;
    var newVoucherSum = (results[2].p || 0) + (results[2].srv || 0);
    var newDepositSum = results[3].s || 0;
    var newPendingCount = results[4].c;

    var oldTotalAmount = sum(legacyRecords, function (r) { return r.totalAmount; });
    var oldVoucherSum = sum(legacyRecords, function (r) { return sum(r.vouchers || [], function (v) { return (v.purchaseAmount || 0) + (v.serviceAmount || 0); }); });
    var oldDepositSum = sum(legacyRecords, function (r) { return sum(r.deposits || [], function (d) { return d.amount; }); });

    var problems = [];
    if (newRecordCount !== legacyRecords.length) problems.push('تعداد رکورد: قدیم=' + legacyRecords.length + ' جدید=' + newRecordCount);
    if (Math.abs(newTotalAmount - oldTotalAmount) > 1) problems.push('جمع مبلغ فروش: قدیم=' + oldTotalAmount + ' جدید=' + newTotalAmount);
    if (Math.abs(newVoucherSum - oldVoucherSum) > 1) problems.push('جمع خرید واچرها: قدیم=' + oldVoucherSum + ' جدید=' + newVoucherSum);
    if (Math.abs(newDepositSum - oldDepositSum) > 1) problems.push('جمع واریزی‌ها: قدیم=' + oldDepositSum + ' جدید=' + newDepositSum);
    if (newPendingCount !== legacyPending.length) problems.push('تعداد پیش‌واریزی: قدیم=' + legacyPending.length + ' جدید=' + newPendingCount);

    if (problems.length) {
      throw new Error('مهاجرت داده به SQL ناموفق -- عدم تطابق:\n  ' + problems.join('\n  '));
    }
    console.log('مهاجرت رکوردها به SQL با موفقیت انجام و راستی‌آزمایی شد (' + newRecordCount + ' رکورد، ' + newPendingCount + ' پیش‌واریزی).');
  });
}

function verifyTourBookings(legacyBookings) {
  return Promise.all([
    knex('tour_bookings').count({ c: 'id' }).first(),
    knex('tour_bookings').sum({ s: 'pricing_selling_total_rial' }).first()
  ]).then(function (results) {
    var newCount = results[0].c;
    var newSellingSum = results[1].s || 0;
    var oldSellingSum = sum(legacyBookings, function (b) { return (b.pricing || {}).sellingTotalRial; });

    var problems = [];
    if (newCount !== legacyBookings.length) problems.push('تعداد رزرو: قدیم=' + legacyBookings.length + ' جدید=' + newCount);
    if (Math.abs(newSellingSum - oldSellingSum) > 1) problems.push('جمع مبلغ فروش رزروها: قدیم=' + oldSellingSum + ' جدید=' + newSellingSum);

    if (problems.length) {
      throw new Error('مهاجرت رزروهای تور به SQL ناموفق -- عدم تطابق:\n  ' + problems.join('\n  '));
    }
    console.log('مهاجرت رزروهای تور به SQL با موفقیت انجام و راستی‌آزمایی شد (' + newCount + ' رزرو).');
  });
}

module.exports = { migrateIfNeeded: migrateIfNeeded };
