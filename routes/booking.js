'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var jalali = require('../utils/jalali');
var calc = require('../utils/calc');
var fareAlloc = require('../utils/fareAllocation');
var validate = require('../utils/validate');
var knex = require('../sql/knex').knex;

var router = express.Router();
var viewGuard = authMw.requirePermission('booking', 'view');
var editGuard = authMw.requirePermission('booking', 'edit');

var MAX_PAGE_SIZE = 200;
var DEFAULT_PAGE_SIZE = 50;

/* ================= Read-only lookups the booking wizard needs ================= */

// For a given room type or service, walks each night in [checkIn, checkOut)
// and returns the per-night rate, erroring out (returns null) if ANY night
// is missing a price -- the person then knows exactly which date to fix.
function nightlyBreakdown(hotel, itemType, itemId, checkIn, checkOut) {
  if (!validate.isValidJalaliDate((checkIn||{}).jy, (checkIn||{}).jm, (checkIn||{}).jd)) return { error: 'تاریخ ورود معتبر نیست' };
  if (!validate.isValidJalaliDate((checkOut||{}).jy, (checkOut||{}).jm, (checkOut||{}).jd)) return { error: 'تاریخ خروج معتبر نیست' };
  var nights = [];
  var cursor = jalali.j2d(checkIn.jy, checkIn.jm, checkIn.jd);
  var endJdn = jalali.j2d(checkOut.jy, checkOut.jm, checkOut.jd);
  if (endJdn <= cursor) return { error: 'تاریخ خروج باید بعد از تاریخ ورود باشد' };
  while (cursor < endJdn) {
    var nightDate = jalali.d2j(cursor);
    var rate = hotel.rates.find(function (r) {
      return r.itemType === itemType && r.itemId === itemId &&
        r.jy === nightDate.jy && r.jm === nightDate.jm && r.jd === nightDate.jd;
    });
    if (!rate) return { error: 'نرخ شب ' + jalali.jalaliStrOf(nightDate.jy, nightDate.jm, nightDate.jd) + ' برای این مورد ثبت نشده' };
    nights.push({ jy: nightDate.jy, jm: nightDate.jm, jd: nightDate.jd, price: rate.price, currency: rate.currency });
    cursor++;
  }
  return { nights: nights };
}

router.get('/hotel-quote', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var q = req.query || {};
  var hotel = data.hotelInventory.find(function (h) { return h.id === q.hotelId; });
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  var roomType = hotel.roomTypes.find(function (r) { return r.id === q.roomTypeId; });
  if (!roomType) return res.status(400).json({ error: 'نوع اتاق نامعتبر است' });
  var checkIn = { jy: +q.inJy, jm: +q.inJm, jd: +q.inJd };
  var checkOut = { jy: +q.outJy, jm: +q.outJm, jd: +q.outJd };
  var result = nightlyBreakdown(hotel, 'room', roomType.id, checkIn, checkOut);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ nights: result.nights, roomTypeName: roomType.name });
});

router.get('/service-quote', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var q = req.query || {};
  var hotel = data.hotelInventory.find(function (h) { return h.id === q.hotelId; });
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  var service = hotel.services.find(function (s) { return s.id === q.serviceId; });
  if (!service) return res.status(400).json({ error: 'خدمت نامعتبر است' });
  var from = { jy: +q.fromJy, jm: +q.fromJm, jd: +q.fromJd };
  var to = { jy: +q.toJy, jm: +q.toJm, jd: +q.toJd };
  var result = nightlyBreakdown(hotel, 'service', service.id, from, to);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ nights: result.nights, serviceName: service.name });
});

// Shows how a seat request would be allocated across fare-class buckets
// WITHOUT reserving anything -- used by the wizard to preview the split
// ("5 seats from Economy, 2 from Business...") before the person confirms.
router.get('/flight-quote', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var flight = data.flightInventory.find(function (f) { return f.id === (req.query || {}).flightId; });
  if (!flight) return res.status(404).json({ error: 'پرواز یافت نشد' });
  var seats = parseInt((req.query || {}).seats, 10) || 0;
  if (seats <= 0) return res.status(400).json({ error: 'تعداد صندلی نامعتبر است' });
  var allocations = fareAlloc.allocateSeats(flight.fareClasses, seats);
  if (!allocations) return res.status(400).json({ error: 'ظرفیت خالی این پرواز کافی نیست' });
  res.json({ allocations: allocations, flight: flight });
});

/* ================= Rial conversion helpers (per-night / per-date accuracy) ================= */

function sumNightsToRial(nights, currencyRates, qty) {
  var byCurrency = {};
  var totalRial = 0;
  var allRatesFound = true;
  nights.forEach(function (n) {
    byCurrency[n.currency] = (byCurrency[n.currency] || 0) + n.price * qty;
    var rate = calc.getExchangeRate(currencyRates, n.currency, n.jy, n.jm, n.jd);
    if (rate == null) { allRatesFound = false; return; }
    totalRial += Math.round(n.price * qty * rate);
  });
  return { byCurrency: byCurrency, totalRial: totalRial, allRatesFound: allRatesFound };
}

function allocationsToRial(allocations, currencyRates, jy, jm, jd, field) {
  // field: 'priceEach' (selling) or 'costEach' (net/cost)
  var total = 0, allFound = true;
  allocations.forEach(function (a) {
    var unit = a[field];
    var currency = field === 'costEach' ? a.costCurrency : a.currency;
    if (unit == null) { allFound = false; return; }
    var rate = calc.getExchangeRate(currencyRates, currency, jy, jm, jd);
    if (rate == null) { allFound = false; return; }
    total += Math.round(unit * a.seats * rate);
  });
  return { totalRial: total, allFound: allFound };
}

/* ================= Row <-> API shape (SQL-backed tour_bookings) ================= */

function bookingToRow(b) {
  return {
    id: b.id, voucher_number: b.voucherNumber, created_at: b.createdAt, jy: b.jy, jm: b.jm, jd: b.jd,
    agency: b.agency, counter: b.counter, procurement_expert: b.procurementExpert || '',
    created_by_user_id: b.createdByUserId, created_by_full_name: b.createdByFullName,
    status: b.status, needs_correction: !!b.needsCorrection,
    hotel_json: JSON.stringify(b.hotel || null), services_json: JSON.stringify(b.services || []),
    flight_out_json: JSON.stringify(b.flightOut || null), flight_in_json: JSON.stringify(b.flightIn || null),
    passengers_json: JSON.stringify(b.passengers || []), history_json: JSON.stringify(b.history || []),
    pricing_total_cost_rial: b.pricing.totalCostRial, pricing_suggested_selling_rial: b.pricing.suggestedSellingRial,
    pricing_selling_total_rial: b.pricing.sellingTotalRial, pricing_profit_rial: b.pricing.profitRial,
    pricing_cost_fully_known: !!b.pricing.costFullyKnown
  };
}

function rowToBooking(row) {
  return {
    id: row.id, voucherNumber: row.voucher_number, createdAt: row.created_at, jy: row.jy, jm: row.jm, jd: row.jd,
    agency: row.agency, counter: row.counter, procurementExpert: row.procurement_expert || '',
    createdByUserId: row.created_by_user_id, createdByFullName: row.created_by_full_name,
    status: row.status, needsCorrection: !!row.needs_correction,
    hotel: row.hotel_json ? JSON.parse(row.hotel_json) : null,
    services: row.services_json ? JSON.parse(row.services_json) : [],
    flightOut: row.flight_out_json ? JSON.parse(row.flight_out_json) : null,
    flightIn: row.flight_in_json ? JSON.parse(row.flight_in_json) : null,
    passengers: row.passengers_json ? JSON.parse(row.passengers_json) : [],
    history: row.history_json ? JSON.parse(row.history_json) : [],
    pricing: {
      totalCostRial: row.pricing_total_cost_rial, suggestedSellingRial: row.pricing_suggested_selling_rial,
      sellingTotalRial: row.pricing_selling_total_rial, profitRial: row.pricing_profit_rial,
      costFullyKnown: !!row.pricing_cost_fully_known
    }
  };
}

/* ================= List / detail (filtered, paginated) ================= */

router.get('/', authMw.attachUser, viewGuard, function (req, res) {
  var q = req.query || {};
  var page = Math.max(1, parseInt(q.page, 10) || 1);
  // ?all=1 bypasses pagination -- same convention as /api/records, for any
  // future export/report feature that needs the complete filtered set.
  var noPagination = q.all === '1' || q.all === 'true';
  var pageSize = noPagination ? null : Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.pageSize, 10) || DEFAULT_PAGE_SIZE));

  var query = knex('tour_bookings');
  if (q.agency) query = query.where('agency', q.agency);
  if (q.status) query = query.where('status', q.status);
  if (q.date) {
    var m = /^(\d+)\/(\d+)\/(\d+)$/.exec(String(q.date));
    if (m) query = query.where({ jy: +m[1], jm: +m[2], jd: +m[3] });
  }
  if (q.search) {
    var s = '%' + String(q.search).trim() + '%';
    query = query.where(function (qb) {
      qb.where('voucher_number', 'like', s).orWhere('agency', 'like', s).orWhere('counter', 'like', s);
    });
  }

  query.clone().count({ c: 'id' }).first()
    .then(function (countRow) {
      var total = countRow ? countRow.c : 0;
      var listQuery = query.clone().orderBy('created_at', 'desc');
      if (pageSize) listQuery = listQuery.limit(pageSize).offset((page - 1) * pageSize);
      return listQuery.then(function (rows) {
        res.json({ bookings: rows.map(rowToBooking), total: total, page: page, pageSize: pageSize || total });
      });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت رزروها' }); });
});

router.get('/:id', authMw.attachUser, viewGuard, function (req, res) {
  knex('tour_bookings').where('id', req.params.id).first()
    .then(function (row) {
      if (!row) return res.status(404).json({ error: 'رزرو یافت نشد' });
      res.json({ booking: rowToBooking(row) });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در دریافت رزرو' }); });
});

/* ================= Booking creation (the actual reservation transaction) ================= */

router.post('/', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var data = dbMod.db();

  if (!body.agency || !body.counter) return res.status(400).json({ error: 'آژانس و کانتر الزامی است' });
  var passengers = Array.isArray(body.passengers) ? body.passengers : [];
  if (!passengers.length) return res.status(400).json({ error: 'حداقل یک مسافر باید ثبت شود' });
  for (var pi = 0; pi < passengers.length; pi++) {
    var p = passengers[pi];
    if (!p.lastNameFa || !p.passportNumber) {
      return res.status(400).json({ error: 'مسافر ' + (pi + 1) + ': نام‌خانوادگی و شماره پاسپورت الزامی است' });
    }
    if (p.birthDate && !validate.isValidOptionalJalaliDate(p.birthDate.jy, p.birthDate.jm, p.birthDate.jd)) {
      return res.status(400).json({ error: 'مسافر ' + (pi + 1) + ' -- تاریخ تولد معتبر نیست' });
    }
    if (p.passportExpiry && !validate.isValidOptionalJalaliDate(p.passportExpiry.jy, p.passportExpiry.jm, p.passportExpiry.jd)) {
      return res.status(400).json({ error: 'مسافر ' + (pi + 1) + ' -- تاریخ انقضای پاسپورت معتبر نیست' });
    }
  }

  var t = jalali.todayJalali();

  /* ---- Hotel leg (optional) ---- */
  var hotelResult = null;
  if (body.hotelSelection) {
    var hs = body.hotelSelection;
    var hotel = data.hotelInventory.find(function (h) { return h.id === hs.hotelId; });
    if (!hotel) return res.status(400).json({ error: 'هتل انتخاب‌شده معتبر نیست' });
    var roomType = hotel.roomTypes.find(function (r) { return r.id === hs.roomTypeId; });
    if (!roomType) return res.status(400).json({ error: 'نوع اتاق انتخاب‌شده معتبر نیست' });
    var qty = parseInt(hs.qty, 10) || 1;
    var roomNightsRes = nightlyBreakdown(hotel, 'room', roomType.id, hs.checkIn, hs.checkOut);
    if (roomNightsRes.error) return res.status(400).json({ error: roomNightsRes.error });
    var roomRial = sumNightsToRial(roomNightsRes.nights, data.currencyRates, qty);
    hotelResult = {
      hotelId: hotel.id, hotelName: hotel.name, roomTypeId: roomType.id, roomTypeName: roomType.name,
      checkIn: hs.checkIn, checkOut: hs.checkOut, nights: roomNightsRes.nights, qty: qty,
      costByCurrency: roomRial.byCurrency, costRial: roomRial.totalRial, rialFullyKnown: roomRial.allRatesFound
    };
  }

  /* ---- Hotel services (optional, each with its own date range) ---- */
  var serviceResults = [];
  if (Array.isArray(body.serviceSelections)) {
    for (var si = 0; si < body.serviceSelections.length; si++) {
      var ss = body.serviceSelections[si];
      var svcHotel = data.hotelInventory.find(function (h) { return h.id === ss.hotelId; });
      if (!svcHotel) return res.status(400).json({ error: 'هتل خدمت شماره ' + (si + 1) + ' معتبر نیست' });
      var service = svcHotel.services.find(function (s) { return s.id === ss.serviceId; });
      if (!service) return res.status(400).json({ error: 'خدمت شماره ' + (si + 1) + ' معتبر نیست' });
      var svcQty = parseInt(ss.qty, 10) || 1;
      var svcNightsRes = nightlyBreakdown(svcHotel, 'service', service.id, ss.from, ss.to);
      if (svcNightsRes.error) return res.status(400).json({ error: 'خدمت «' + service.name + '»: ' + svcNightsRes.error });
      var svcRial = sumNightsToRial(svcNightsRes.nights, data.currencyRates, svcQty);
      serviceResults.push({
        serviceId: service.id, serviceName: service.name, from: ss.from, to: ss.to, qty: svcQty,
        nights: svcNightsRes.nights, costByCurrency: svcRial.byCurrency, costRial: svcRial.totalRial, rialFullyKnown: svcRial.allRatesFound
      });
    }
  }

  /* ---- Flights (outbound and optional return) ---- */
  function resolveFlightLeg(legBody) {
    if (!legBody) return { leg: null };
    var flight = data.flightInventory.find(function (f) { return f.id === legBody.flightId; });
    if (!flight) return { error: 'پرواز انتخاب‌شده معتبر نیست' };
    var seats = parseInt(legBody.seats, 10) || passengers.length;
    var allocations = fareAlloc.allocateSeats(flight.fareClasses, seats);
    if (!allocations) return { error: 'ظرفیت خالی پرواز ' + flight.origin + ' ◀ ' + flight.destination + ' کافی نیست' };
    var sellRial = allocationsToRial(allocations, data.currencyRates, flight.departJy, flight.departJm, flight.departJd, 'priceEach');
    var costRial = allocationsToRial(allocations, data.currencyRates, flight.departJy, flight.departJm, flight.departJd, 'costEach');
    return {
      leg: {
        flightId: flight.id, origin: flight.origin, destination: flight.destination,
        airline: flight.airline, flightNumber: flight.flightNumber,
        departJy: flight.departJy, departJm: flight.departJm, departJd: flight.departJd, departTime: flight.departTime,
        arriveJy: flight.arriveJy, arriveJm: flight.arriveJm, arriveJd: flight.arriveJd, arriveTime: flight.arriveTime,
        allocations: allocations, seats: seats,
        sellRial: sellRial.totalRial, sellFullyKnown: sellRial.allFound,
        costRial: costRial.totalRial, costFullyKnown: costRial.allFound
      },
      flightObj: flight
    };
  }

  var outResolved = resolveFlightLeg(body.flightOut);
  if (outResolved.error) return res.status(400).json({ error: outResolved.error });
  var inResolved = resolveFlightLeg(body.flightIn);
  if (inResolved.error) return res.status(400).json({ error: inResolved.error });

  var totalCostRial = (hotelResult ? hotelResult.costRial : 0) +
    serviceResults.reduce(function (s, x) { return s + x.costRial; }, 0) +
    (outResolved.leg ? outResolved.leg.costRial : 0) +
    (inResolved.leg ? inResolved.leg.costRial : 0);

  var suggestedSellingRial = (hotelResult ? hotelResult.costRial : 0) +
    serviceResults.reduce(function (s, x) { return s + x.costRial; }, 0) +
    (outResolved.leg ? outResolved.leg.sellRial : 0) +
    (inResolved.leg ? inResolved.leg.sellRial : 0);

  var sellingTotalRial = (body.sellingTotalOverrideRial != null && body.sellingTotalOverrideRial !== '')
    ? parseFloat(body.sellingTotalOverrideRial) : suggestedSellingRial;

  // True only if EVERY leg that contributed to totalCostRial had a fully
  // resolvable FX rate -- otherwise totalCostRial (and therefore profitRial)
  // is an underestimate and the UI must say so instead of presenting it as fact.
  var costFullyKnown = (!hotelResult || hotelResult.rialFullyKnown) &&
    serviceResults.every(function (x) { return x.rialFullyKnown; }) &&
    (!outResolved.leg || outResolved.leg.costFullyKnown) &&
    (!inResolved.leg || inResolved.leg.costFullyKnown);

  var voucherNumber = 'TB-' + String(data.meta.nextBookingNumber).padStart(6, '0');
  var nowIso = new Date().toISOString();
  var booking = {
    id: uid('tour'), voucherNumber: voucherNumber, createdAt: nowIso,
    jy: t.jy, jm: t.jm, jd: t.jd,
    agency: body.agency, counter: body.counter, procurementExpert: body.procurementExpert || '',
    createdByUserId: req.currentUser.id, createdByFullName: req.currentUser.fullName,
    hotel: hotelResult, services: serviceResults, flightOut: outResolved.leg, flightIn: inResolved.leg,
    passengers: passengers.map(function (p) {
      return {
        firstNameFa: p.firstNameFa || '', lastNameFa: p.lastNameFa || '',
        firstNameEn: p.firstNameEn || '', lastNameEn: p.lastNameEn || '',
        passportNumber: p.passportNumber, birthDate: p.birthDate || null, passportExpiry: p.passportExpiry || null
      };
    }),
    pricing: { totalCostRial: totalCostRial, suggestedSellingRial: suggestedSellingRial, sellingTotalRial: sellingTotalRial, profitRial: sellingTotalRial - totalCostRial, costFullyKnown: costFullyKnown },
    status: 'confirmed', needsCorrection: false,
    history: [{
      at: nowIso, event: 'created', by: req.currentUser.fullName, byUserId: req.currentUser.id,
      details: {
        passengerCount: passengers.length,
        hasHotel: !!hotelResult, hasFlightOut: !!outResolved.leg, hasFlightIn: !!inResolved.leg,
        sellingTotalRial: sellingTotalRial
      }
    }]
  };

  // Mutate seat inventory and the voucher-number counter SYNCHRONOUSLY,
  // right here, with no await/.then() in between the capacity check
  // (resolveFlightLeg, above) and this mutation -- that's the exact
  // invariant utils/fareAllocation.js's comment requires to stay safe from
  // a check-then-act race between concurrent bookings. Do NOT move this
  // mutation into the .then() below: that reintroduces a real async gap
  // (the knex insert goes through a connection pool) between the check and
  // the mutation, and two nearly-simultaneous bookings could then both
  // pass the capacity check before either decrements seatsSold --
  // overbooking -- and both read the same nextBookingNumber before either
  // increments it -- duplicate voucher numbers. If the insert below fails,
  // the catch block compensates by reversing exactly what was done here.
  if (outResolved.leg) fareAlloc.applyAllocation(outResolved.flightObj, outResolved.leg.allocations, 1);
  if (inResolved.leg) fareAlloc.applyAllocation(inResolved.flightObj, inResolved.leg.allocations, 1);
  data.meta.nextBookingNumber += 1;
  // Flush the mutation to darvishi.db immediately, in this same
  // synchronous tick -- not after the SQL insert below succeeds. This
  // means memory and disk agree on seat inventory at every instant from
  // here on, regardless of exactly when a crash might happen relative to
  // the (async) insert. The only remaining edge case is a crash landing in
  // the tiny window between this line and the insert actually committing:
  // that would under-count available seats (a lost hold with nothing
  // booked against it) rather than over-count them -- a safe failure
  // direction for a travel agency, unlike the alternative.
  dbMod.saveSync();

  knex('tour_bookings').insert(bookingToRow(booking))
    .then(function () {
      res.json({ booking: booking });
    })
    .catch(function (e) {
      // The insert failed after we already applied and persisted the
      // seat/counter mutation above -- compensate by reversing it exactly
      // and flushing that reversal too, so a failed booking never leaves a
      // phantom hold on real inventory in either store.
      if (outResolved.leg) fareAlloc.applyAllocation(outResolved.flightObj, outResolved.leg.allocations, -1);
      if (inResolved.leg) fareAlloc.applyAllocation(inResolved.flightObj, inResolved.leg.allocations, -1);
      data.meta.nextBookingNumber -= 1;
      dbMod.saveSync();
      console.error(e);
      res.status(500).json({ error: 'خطا در ثبت رزرو' });
    });
});

router.patch('/:id/selling-price', authMw.attachUser, editGuard, function (req, res) {
  var val = parseFloat((req.body || {}).sellingTotalRial);
  if (!(val >= 0)) return res.status(400).json({ error: 'مبلغ نامعتبر است' });

  knex('tour_bookings').where('id', req.params.id).first()
    .then(function (row) {
      if (!row) { res.status(404).json({ error: 'رزرو یافت نشد' }); return null; }
      if (row.status === 'cancelled') { res.status(400).json({ error: 'رزرو لغو شده قابل تغییر نیست' }); return null; }
      var booking = rowToBooking(row);
      var oldVal = booking.pricing.sellingTotalRial;
      booking.pricing.sellingTotalRial = val;
      booking.pricing.profitRial = val - booking.pricing.totalCostRial;
      booking.history.push({
        at: new Date().toISOString(), event: 'selling_price_changed', by: req.currentUser.fullName, byUserId: req.currentUser.id,
        details: { from: oldVal, to: val }
      });
      // Guard the UPDATE itself against a cancel that lands between our
      // read and this write (someone cancels the booking a moment after we
      // read it as non-cancelled) -- same spirit as the atomic claim in
      // /cancel, just simpler since nothing else needs compensating here.
      return knex('tour_bookings').where('id', req.params.id).where('status', '!=', 'cancelled').update({
        pricing_selling_total_rial: booking.pricing.sellingTotalRial,
        pricing_profit_rial: booking.pricing.profitRial,
        history_json: JSON.stringify(booking.history)
      }).then(function (rowsAffected) {
        if (!rowsAffected) return res.status(400).json({ error: 'رزرو لغو شده قابل تغییر نیست' });
        res.json({ booking: booking });
      });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در ثبت تغییر مبلغ' }); });
});

// Cancelling releases every seat this booking held, back onto the same
// fare classes they were taken from -- the mirror image of applyAllocation().
router.post('/:id/cancel', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  knex('tour_bookings').where('id', req.params.id).first()
    .then(function (row) {
      if (!row) { res.status(404).json({ error: 'رزرو یافت نشد' }); return null; }
      var booking = rowToBooking(row);
      if (booking.status === 'cancelled') { res.json({ booking: booking }); return null; }

      booking.status = 'cancelled';
      booking.history.push({ at: new Date().toISOString(), event: 'cancelled', by: req.currentUser.fullName, byUserId: req.currentUser.id, details: {} });

      // Atomically "claim" the cancellation: the WHERE clause only matches
      // if status is still not 'cancelled' at the moment SQLite executes
      // this UPDATE. If two cancel requests for the same booking race each
      // other (double-click, two open tabs), only ONE of them gets
      // rowsAffected > 0 -- the loser sees 0 and must NOT release seats a
      // second time, since the winner already did.
      return knex('tour_bookings').where('id', req.params.id).where('status', '!=', 'cancelled')
        .update({ status: 'cancelled', history_json: JSON.stringify(booking.history) })
        .then(function (rowsAffected) {
          if (!rowsAffected) {
            // Lost the race -- someone else's cancel request won. Return
            // the now-current (cancelled) booking instead of touching
            // inventory a second time.
            return knex('tour_bookings').where('id', req.params.id).first().then(function (freshRow) {
              res.json({ booking: rowToBooking(freshRow) });
            });
          }
          if (booking.flightOut) {
            var outFlight = data.flightInventory.find(function (f) { return f.id === booking.flightOut.flightId; });
            if (outFlight) fareAlloc.applyAllocation(outFlight, booking.flightOut.allocations, -1);
          }
          if (booking.flightIn) {
            var inFlight = data.flightInventory.find(function (f) { return f.id === booking.flightIn.flightId; });
            if (inFlight) fareAlloc.applyAllocation(inFlight, booking.flightIn.allocations, -1);
          }
          dbMod.saveSync();
          res.json({ booking: booking });
        });
    })
    .catch(function (e) { console.error(e); res.status(500).json({ error: 'خطا در لغو رزرو' }); });
});

module.exports = router;
