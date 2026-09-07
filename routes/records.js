'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var jalali = require('../utils/jalali');
var validate = require('../utils/validate');
var knex = require('../sql/knex').knex;
var recSql = require('../utils/recordsSql');

var router = express.Router();
var viewGuard = authMw.requirePermission('records', 'view');
var newEntryEditGuard = authMw.requirePermission('newEntry', 'edit');

var MAX_PAGE_SIZE = 200;
var DEFAULT_PAGE_SIZE = 50;

// Anyone with newEntry.edit can CREATE records, but editing/deleting an
// EXISTING record must be restricted to whoever created it, unless the user
// is a developer or a manager (canViewAllMessages -- the same flag already
// used elsewhere in this codebase as the "sees/manages everything" signal).
// Without this, any staff member could alter or delete a colleague's sales
// record with no ownership check at all.
function canManageOthersRecords(user) {
  return !!(user.isDeveloper || user.canViewAllMessages);
}
function assertCanManageRecord(req, res, existingRow) {
  if (existingRow.created_by_user_id === req.currentUser.id) return true;
  if (canManageOthersRecords(req.currentUser)) return true;
  res.status(403).json({ error: 'شما فقط می‌توانید رکوردهای ثبت‌شده توسط خودتان را ویرایش یا حذف کنید' });
  return false;
}

function freshVoucherFromBody(v) {
  return {
    id: v.id || uid('rv'),
    number: String(v.number || '').trim(),
    stayCity: v.stayCity || '', hotel: v.hotel || '', agent: v.agent || '',
    purchaseAmount: parseFloat(v.purchaseAmount) || 0, purchaseCurrency: v.purchaseCurrency || '',
    serviceAmount: parseFloat(v.serviceAmount) || 0,
    flightOutOrigin: v.flightOutOrigin || '', flightOutDestination: v.flightOutDestination || '',
    flightInOrigin: v.flightInOrigin || '', flightInDestination: v.flightInDestination || '',
    flightOutPriceMillion: parseFloat(v.flightOutPriceMillion) || 0,
    flightInPriceMillion: parseFloat(v.flightInPriceMillion) || 0,
    debtSettled: !!v.debtSettled, debtSettledAt: v.debtSettledAt || '',
    debtReceiptFileName: v.debtReceiptFileName || ''
  };
}

function voucherToRow(v, recordId) {
  return {
    id: v.id, record_id: recordId, number: v.number, stay_city: v.stayCity, hotel: v.hotel, agent: v.agent,
    purchase_amount: v.purchaseAmount, purchase_currency: v.purchaseCurrency, service_amount: v.serviceAmount,
    flight_out_origin: v.flightOutOrigin, flight_out_destination: v.flightOutDestination,
    flight_in_origin: v.flightInOrigin, flight_in_destination: v.flightInDestination,
    flight_out_price_million: v.flightOutPriceMillion, flight_in_price_million: v.flightInPriceMillion,
    debt_settled: !!v.debtSettled, debt_settled_at: v.debtSettledAt, debt_receipt_file_name: v.debtReceiptFileName
  };
}

var voucherRowToApi = recSql.voucherRowToApi;
var depositRowToApi = recSql.depositRowToApi;
var recordRowToApi = recSql.recordRowToApi;
var decorateRecord = recSql.decorateRecord;
var loadChildren = recSql.loadChildren;

function depositToRow(d, recordId) {
  return {
    id: d.id || uid('rd'), record_id: recordId, amount: d.amount, jy: d.jy, jm: d.jm, jd: d.jd,
    platform: d.platform, from_pending_id: d.fromPendingId || null
  };
}

/* ================= List (filtered, paginated, all filtering pushed to SQL) ================= */

router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var q = req.query || {};
  var page = Math.max(1, parseInt(q.page, 10) || 1);
  // ?all=1 bypasses pagination entirely -- used by the Excel/PDF export
  // buttons, which must always operate on every matching record, never
  // just the page currently on screen.
  var noPagination = q.all === '1' || q.all === 'true';
  var pageSize = noPagination ? null : Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.pageSize, 10) || DEFAULT_PAGE_SIZE));

  var base = knex('records');
  if (q.agency) base = base.where('records.agency', q.agency);
  if (q.date) {
    var m = /^(\d+)\/(\d+)\/(\d+)$/.exec(String(q.date));
    if (m) base = base.where({ jy: +m[1], jm: +m[2], jd: +m[3] });
  }
  if (q.search) {
    var s = '%' + String(q.search).trim() + '%';
    base = base.where(function (qb) {
      qb.where('records.agency', 'like', s).orWhere('records.counter', 'like', s)
        .orWhereIn('records.id', function () { this.select('record_id').from('record_vouchers').where('number', 'like', s); });
    });
  }
  if (q.status === 'needsCorrection') base = base.where('needs_correction', true);

  // Settled/pending status needs each record's deposit total -- computed via
  // a join against a per-record SUM subquery, so the filtering happens in
  // SQL instead of pulling every record into JS to add up deposits.
  var withDepositSum = base.clone()
    .leftJoin(
      knex('record_deposits').select('record_id').sum({ depositSum: 'amount' }).groupBy('record_id').as('ds'),
      'ds.record_id', 'records.id'
    )
    .select('records.*', knex.raw('COALESCE(ds.depositSum, 0) as depositSum'));

  if (q.status === 'settled') {
    withDepositSum = withDepositSum.andWhereRaw('COALESCE(ds.depositSum,0) >= records.total_amount AND records.total_amount > 0');
  } else if (q.status === 'pending') {
    withDepositSum = withDepositSum.andWhereRaw('(COALESCE(ds.depositSum,0) < records.total_amount OR records.total_amount <= 0)');
  }

  withDepositSum.clone().clearSelect().clearOrder().count({ c: 'records.id' }).first()
    .then(function (countRow) {
      var total = countRow ? countRow.c : 0;
      var listQuery = withDepositSum.clone().orderBy('records.created_at', 'desc');
      if (pageSize) listQuery = listQuery.limit(pageSize).offset((page - 1) * pageSize);
      return listQuery.then(function (recordRows) { return { total: total, recordRows: recordRows }; });
    })
    .then(function (r) {
      var ids = r.recordRows.map(function (row) { return row.id; });
      return loadChildren(ids).then(function (children) {
        var data = dbMod.db();
        var decorated = r.recordRows.map(function (row) {
          var full = recordRowToApi(row, children.vouchersByRecord[row.id] || [], children.depositsByRecord[row.id] || []);
          return decorateRecord(full, data.currencyRates);
        });
        res.json({ records: decorated, total: r.total, page: page, pageSize: pageSize || r.total });
      });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت رکوردها' }); });
});

router.get('/:id', authMw.attachUser, viewGuard, function (req, res) {
  knex('records').where('id', req.params.id).first()
    .then(function (row) {
      if (!row) { res.status(404).json({ error: 'رکورد یافت نشد' }); return null; }
      return loadChildren([row.id]).then(function (children) {
        var data = dbMod.db();
        var full = recordRowToApi(row, children.vouchersByRecord[row.id] || [], children.depositsByRecord[row.id] || []);
        res.json({ record: decorateRecord(full, data.currencyRates) });
      });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت رکورد' }); });
});

/* ================= Create ================= */

router.post('/', authMw.attachUser, newEntryEditGuard, function (req, res) {
  var body = req.body || {};
  if (!body.agency || !body.counter) return res.status(400).json({ error: 'آژانس و کانتر الزامی است' });
  var vouchers = (body.vouchers || []).map(freshVoucherFromBody).filter(function (v) { return v.number; });
  if (!vouchers.length) return res.status(400).json({ error: 'حداقل یک شماره واچر وارد کنید' });
  for (var i = 0; i < vouchers.length; i++) {
    if (vouchers[i].purchaseAmount > 0 && !vouchers[i].purchaseCurrency) {
      return res.status(400).json({ error: 'واچر ' + (i + 1) + ': برای مبلغ خرید باید ارز را هم انتخاب کنی' });
    }
  }
  var totalAmount = parseFloat(body.totalAmount) || 0;
  if (totalAmount <= 0) return res.status(400).json({ error: 'مبلغ کل فروش را وارد کنید' });

  var deposits = (body.deposits || []).filter(function (d) { return d.amount > 0 && d.jy && d.platform; })
    .map(function (d) { return { amount: parseFloat(d.amount) || 0, jy: parseInt(d.jy, 10), jm: parseInt(d.jm, 10), jd: parseInt(d.jd, 10), platform: d.platform, fromPendingId: d.fromPendingId || null }; });
  for (var di = 0; di < deposits.length; di++) {
    if (!validate.isValidJalaliDate(deposits[di].jy, deposits[di].jm, deposits[di].jd)) {
      return res.status(400).json({ error: 'تاریخ واریزی شماره ' + (di + 1) + ' معتبر نیست' });
    }
  }
  var usedPendingIds = deposits.map(function (d) { return d.fromPendingId; }).filter(Boolean);
  var dupePendingId = usedPendingIds.find(function (id, idx) { return usedPendingIds.indexOf(id) !== idx; });
  if (dupePendingId) return res.status(400).json({ error: 'یک پیش‌واریزی نمی‌تواند دوبار در یک رکورد استفاده شود' });

  var t = jalali.todayJalali();
  var recordId = uid('rec');
  var recordRow = {
    id: recordId, created_at: new Date().toISOString(), jy: t.jy, jm: t.jm, jd: t.jd,
    agency: body.agency, counter: body.counter, procurement_expert: body.procurementExpert || '',
    created_by_user_id: req.currentUser.id, created_by_username: req.currentUser.username, created_by_full_name: req.currentUser.fullName,
    total_amount: totalAmount, needs_correction: !!body.needsCorrection
  };

  knex.transaction(function (trx) {
    return Promise.resolve()
      .then(function () {
        if (!usedPendingIds.length) return [];
        return trx('pending_deposits').whereIn('id', usedPendingIds);
      })
      .then(function (pendingRows) {
        var alreadyBound = pendingRows.find(function (p) { return p.bound; });
        if (alreadyBound) throw Object.assign(new Error('پیش‌واریزی قبلاً به رکورد دیگری متصل شده'), { statusCode: 400 });
        return trx('records').insert(recordRow);
      })
      .then(function () {
        if (!vouchers.length) return null;
        return trx('record_vouchers').insert(vouchers.map(function (v) { return voucherToRow(v, recordId); }));
      })
      .then(function () {
        if (!deposits.length) return null;
        return trx('record_deposits').insert(deposits.map(function (d) { return depositToRow(d, recordId); }));
      })
      .then(function () {
        if (!usedPendingIds.length) return null;
        return trx('pending_deposits').whereIn('id', usedPendingIds).update({ bound: true, bound_record_id: recordId });
      });
  })
    .then(function () {
      var data = dbMod.db();
      var full = recordRowToApi(recordRow, vouchers, deposits.map(function (d) { return Object.assign({ id: null }, d); }));
      res.json({ record: decorateRecord(full, data.currencyRates) });
    })
    .catch(function (e) {
      if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'خطا در ثبت رکورد' });
    });
});

/* ================= Update ================= */

router.patch('/:id', authMw.attachUser, newEntryEditGuard, function (req, res) {
  var body = req.body || {};
  var recordId = req.params.id;

  knex('records').where('id', recordId).first()
    .then(function (existing) {
      if (!existing) { res.status(404).json({ error: 'رکورد یافت نشد' }); return null; }
      if (!assertCanManageRecord(req, res, existing)) return null;

      var patch = {};
      if (body.agency != null) patch.agency = body.agency;
      if (body.counter != null) patch.counter = body.counter;
      if (body.procurementExpert != null) patch.procurement_expert = body.procurementExpert;
      if (body.needsCorrection != null) patch.needs_correction = !!body.needsCorrection;
      if (body.totalAmount != null) {
        var ta = parseFloat(body.totalAmount) || 0;
        if (ta <= 0) { res.status(400).json({ error: 'مبلغ کل فروش نامعتبر است' }); return null; }
        patch.total_amount = ta;
      }

      var newVouchers = null;
      if (Array.isArray(body.vouchers)) {
        newVouchers = body.vouchers.map(freshVoucherFromBody).filter(function (v) { return v.number; });
        if (!newVouchers.length) { res.status(400).json({ error: 'حداقل یک شماره واچر وارد کنید' }); return null; }
      }

      var newDeposits = null;
      if (Array.isArray(body.deposits)) {
        newDeposits = body.deposits.filter(function (d) { return d.amount > 0 && d.jy && d.platform; })
          .map(function (d) { return { amount: parseFloat(d.amount) || 0, jy: parseInt(d.jy, 10), jm: parseInt(d.jm, 10), jd: parseInt(d.jd, 10), platform: d.platform, fromPendingId: d.fromPendingId || null }; });
        for (var ndi = 0; ndi < newDeposits.length; ndi++) {
          if (!validate.isValidJalaliDate(newDeposits[ndi].jy, newDeposits[ndi].jm, newDeposits[ndi].jd)) {
            res.status(400).json({ error: 'تاریخ واریزی شماره ' + (ndi + 1) + ' معتبر نیست' });
            return null;
          }
        }
        var newUsedPendingIds = newDeposits.map(function (d) { return d.fromPendingId; }).filter(Boolean);
        var dupe = newUsedPendingIds.find(function (id, idx) { return newUsedPendingIds.indexOf(id) !== idx; });
        if (dupe) { res.status(400).json({ error: 'یک پیش‌واریزی نمی‌تواند دوبار در یک رکورد استفاده شود' }); return null; }
      }

      return knex.transaction(function (trx) {
        return Promise.resolve()
          .then(function () {
            if (Object.keys(patch).length) return trx('records').where('id', recordId).update(patch);
          })
          .then(function () {
            if (newVouchers == null) return null;
            // Preserve debt-settlement state for vouchers that already existed.
            return trx('record_vouchers').where('record_id', recordId).then(function (oldRows) {
              var oldById = {};
              oldRows.forEach(function (o) { oldById[o.id] = o; });
              newVouchers.forEach(function (nv) {
                var old = oldById[nv.id];
                if (old) { nv.debtSettled = !!old.debt_settled; nv.debtSettledAt = old.debt_settled_at || ''; nv.debtReceiptFileName = old.debt_receipt_file_name || ''; }
              });
              return trx('record_vouchers').where('record_id', recordId).del()
                .then(function () { return trx('record_vouchers').insert(newVouchers.map(function (v) { return voucherToRow(v, recordId); })); });
            });
          })
          .then(function () {
            if (newDeposits == null) return null;
            return trx('record_deposits').where('record_id', recordId)
              .then(function (oldDepositRows) {
                var oldPendingIds = oldDepositRows.map(function (d) { return d.from_pending_id; }).filter(Boolean);
                var newPendingIds = newDeposits.map(function (d) { return d.fromPendingId; }).filter(Boolean);

                // A pending deposit can only be (re)bound here if it's currently
                // unbound, OR it was already bound to THIS record -- editing a
                // record's own deposits shouldn't trip over its own binding.
                var toCheck = newPendingIds.filter(function (id) { return oldPendingIds.indexOf(id) === -1; });
                return Promise.resolve(toCheck.length ? trx('pending_deposits').whereIn('id', toCheck) : [])
                  .then(function (rows) {
                    var alreadyBound = rows.find(function (p) { return p.bound; });
                    if (alreadyBound) throw Object.assign(new Error('این پیش‌واریزی قبلاً به رکورد دیگری متصل شده'), { statusCode: 400 });

                    return trx('record_deposits').where('record_id', recordId).del()
                      .then(function () { return newDeposits.length ? trx('record_deposits').insert(newDeposits.map(function (d) { return depositToRow(d, recordId); })) : null; })
                      .then(function () {
                        var toUnbind = oldPendingIds.filter(function (id) { return newPendingIds.indexOf(id) === -1; });
                        var toBind = newPendingIds.filter(function (id) { return oldPendingIds.indexOf(id) === -1; });
                        return Promise.all([
                          toUnbind.length ? trx('pending_deposits').whereIn('id', toUnbind).update({ bound: false, bound_record_id: null }) : null,
                          toBind.length ? trx('pending_deposits').whereIn('id', toBind).update({ bound: true, bound_record_id: recordId }) : null
                        ]);
                      });
                  });
              });
          });
      }).then(function () {
        return knex('records').where('id', recordId).first().then(function (updated) {
          return loadChildren([recordId]).then(function (children) {
            var data = dbMod.db();
            var full = recordRowToApi(updated, children.vouchersByRecord[recordId] || [], children.depositsByRecord[recordId] || []);
            res.json({ record: decorateRecord(full, data.currencyRates) });
          });
        });
      });
    })
    .catch(function (e) {
      if (res.headersSent) return;
      if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'خطا در ویرایش رکورد' });
    });
});

/* ================= Delete ================= */

router.delete('/:id', authMw.attachUser, newEntryEditGuard, function (req, res) {
  var recordId = req.params.id;
  knex('records').where('id', recordId).first()
    .then(function (existing) {
      if (!existing) { res.status(404).json({ error: 'رکورد یافت نشد' }); return null; }
      if (!assertCanManageRecord(req, res, existing)) return null;
      // Deleting the record must not leave its bound pending deposits stuck
      // forever (bound=true pointing at a record that no longer exists) --
      // release them back to the unbound pool before the cascade delete
      // removes the record_deposits rows that reference them.
      return knex.transaction(function (trx) {
        return trx('record_deposits').where('record_id', recordId).whereNotNull('from_pending_id')
          .then(function (rows) {
            var pendingIds = rows.map(function (r) { return r.from_pending_id; });
            return Promise.resolve(pendingIds.length ? trx('pending_deposits').whereIn('id', pendingIds).update({ bound: false, bound_record_id: null }) : null)
              .then(function () { return trx('records').where('id', recordId).del(); }); // cascades to record_vouchers/record_deposits
          });
      }).then(function () { res.json({ ok: true }); });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در حذف رکورد' }); });
});

/* ================= Add a single deposit (installment) without editing the whole record ================= */

router.post('/:id/deposits', authMw.attachUser, authMw.requirePermission('records', 'edit'), function (req, res) {
  var recordId = req.params.id;
  var body = req.body || {};
  var amount = parseFloat(body.amount);
  var depJy = parseInt(body.jy, 10), depJm = parseInt(body.jm, 10), depJd = parseInt(body.jd, 10);
  if (!validate.isPositiveNumber(amount) || !validate.isValidJalaliDate(depJy, depJm, depJd) || !validate.isNonEmptyString(body.platform)) {
    return res.status(400).json({ error: 'مبلغ، تاریخ و پلتفرم را کامل و معتبر وارد کنید' });
  }
  var fromPendingId = body.fromPendingId || null;
  var dep = { id: uid('rd'), amount: amount, jy: depJy, jm: depJm, jd: depJd, platform: body.platform, fromPendingId: fromPendingId };

  knex('records').where('id', recordId).first()
    .then(function (existing) {
      if (!existing) { res.status(404).json({ error: 'رکورد یافت نشد' }); return null; }
      if (!assertCanManageRecord(req, res, existing)) return null;
      return knex.transaction(function (trx) {
        return Promise.resolve()
          .then(function () { return fromPendingId ? trx('pending_deposits').where('id', fromPendingId).first() : null; })
          .then(function (p) {
            if (p && p.bound) throw Object.assign(new Error('این پیش‌واریزی قبلاً به رکورد دیگری متصل شده'), { statusCode: 400 });
            return trx('record_deposits').insert(depositToRow(dep, recordId));
          })
          .then(function () {
            if (!fromPendingId) return null;
            return trx('pending_deposits').where('id', fromPendingId).update({ bound: true, bound_record_id: recordId });
          });
      }).then(function () {
        return loadChildren([recordId]).then(function (children) {
          var data = dbMod.db();
          var full = recordRowToApi(existing, children.vouchersByRecord[recordId] || [], children.depositsByRecord[recordId] || []);
          res.json({ record: decorateRecord(full, data.currencyRates) });
        });
      });
    })
    .catch(function (e) {
      if (res.headersSent) return;
      if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'خطا در ثبت واریزی' });
    });
});

module.exports = router;
