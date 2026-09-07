'use strict';
/* Shared row<->API-shape mapping for the SQL-backed records/vouchers/deposits
   tables (sql/migrations/..._create_pending_and_records.js). Used by
   routes/records.js and by any other route (reports, credit, debt) that
   needs to read records the same way. Keeping this in one place means a
   schema change only has to be taught to convert-functions once. */
var knex = require('../sql/knex').knex;
var calc = require('./calc');

function voucherRowToApi(row) {
  return {
    id: row.id, number: row.number, stayCity: row.stay_city || '', hotel: row.hotel || '', agent: row.agent || '',
    purchaseAmount: row.purchase_amount || 0, purchaseCurrency: row.purchase_currency || '',
    serviceAmount: row.service_amount || 0,
    flightOutOrigin: row.flight_out_origin || '', flightOutDestination: row.flight_out_destination || '',
    flightInOrigin: row.flight_in_origin || '', flightInDestination: row.flight_in_destination || '',
    flightOutPriceMillion: row.flight_out_price_million || 0, flightInPriceMillion: row.flight_in_price_million || 0,
    debtSettled: !!row.debt_settled, debtSettledAt: row.debt_settled_at || '', debtReceiptFileName: row.debt_receipt_file_name || ''
  };
}

function depositRowToApi(row) {
  return { id: row.id, amount: row.amount, jy: row.jy, jm: row.jm, jd: row.jd, platform: row.platform, fromPendingId: row.from_pending_id || null };
}

function recordRowToApi(row, vouchers, deposits) {
  return {
    id: row.id, createdAt: row.created_at, jy: row.jy, jm: row.jm, jd: row.jd,
    agency: row.agency, counter: row.counter, procurementExpert: row.procurement_expert || '',
    createdByUserId: row.created_by_user_id, createdByUsername: row.created_by_username, createdByFullName: row.created_by_full_name,
    vouchers: vouchers, totalAmount: row.total_amount, deposits: deposits,
    needsCorrection: !!row.needs_correction
  };
}

function decorateRecord(record, currencyRates) {
  var depSum = calc.depositSumOf(record);
  var cost = calc.totalPurchaseCostRial(record, currencyRates);
  return Object.assign({}, record, {
    depositSum: depSum,
    outstanding: (record.totalAmount || 0) - depSum,
    settled: calc.isSettled(record),
    totalCostRial: cost, // null = can't be computed yet (a used currency has no FX rate) -- NOT zero
    profit: cost == null ? null : (record.totalAmount || 0) - cost,
    costUnknown: cost == null
  });
}

// Loads vouchers+deposits for a batch of record ids in two queries (not one
// per record) and groups them in JS -- avoids N+1 queries for a one-to-many
// fetch.
function loadChildren(recordIds) {
  if (!recordIds.length) return Promise.resolve({ vouchersByRecord: {}, depositsByRecord: {} });
  return Promise.all([
    knex('record_vouchers').whereIn('record_id', recordIds),
    knex('record_deposits').whereIn('record_id', recordIds)
  ]).then(function (results) {
    var vouchersByRecord = {}, depositsByRecord = {};
    results[0].forEach(function (v) { (vouchersByRecord[v.record_id] = vouchersByRecord[v.record_id] || []).push(voucherRowToApi(v)); });
    results[1].forEach(function (d) { (depositsByRecord[d.record_id] = depositsByRecord[d.record_id] || []).push(depositRowToApi(d)); });
    return { vouchersByRecord: vouchersByRecord, depositsByRecord: depositsByRecord };
  });
}

// Fetches full record objects (with vouchers+deposits nested, same shape as
// the legacy in-memory model) for an arbitrary knex query over `records`.
// Intended for report-style consumers that need to run JS aggregation
// (which needs currencyRates from the old store) over a bounded set of
// records -- callers should filter `recordsQuery` (date range, agency,
// etc.) before calling this, so only the relevant slice is ever loaded.
function fetchFullRecords(recordsQuery) {
  return recordsQuery.then(function (rows) {
    var ids = rows.map(function (r) { return r.id; });
    return loadChildren(ids).then(function (children) {
      return rows.map(function (row) {
        return recordRowToApi(row, children.vouchersByRecord[row.id] || [], children.depositsByRecord[row.id] || []);
      });
    });
  });
}

module.exports = {
  voucherRowToApi: voucherRowToApi, depositRowToApi: depositRowToApi, recordRowToApi: recordRowToApi,
  decorateRecord: decorateRecord, loadChildren: loadChildren, fetchFullRecords: fetchFullRecords
};
