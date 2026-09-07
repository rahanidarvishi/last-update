'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var validate = require('../utils/validate');

var router = express.Router();
var viewGuard = authMw.requirePermission('inventory', 'view');
var editGuard = authMw.requirePermission('inventory', 'edit');

/* ================= Hotels: room types, services, nightly rate calendar ================= */

function findHotel(data, hotelId) { return data.hotelInventory.find(function (h) { return h.id === hotelId; }); }

router.get('/hotels', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  var cityMap = {};
  data.cities.forEach(function (c) { cityMap[c.id] = c.name; });
  var hotels = data.hotelInventory.map(function (h) {
    return Object.assign({}, h, { cityName: cityMap[h.cityId] || '—' });
  });
  res.json({ hotels: hotels });
});

router.post('/hotels', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var name = String(body.name || '').trim();
  var cityId = body.cityId;
  if (!name || !cityId) return res.status(400).json({ error: 'شهر و نام هتل الزامی است' });
  var data = dbMod.db();
  if (!data.cities.some(function (c) { return c.id === cityId; })) {
    return res.status(400).json({ error: 'شهر انتخاب‌شده معتبر نیست' });
  }
  var hotel = { id: uid('htl'), cityId: cityId, name: name, roomTypes: [], services: [], rates: [] };
  data.hotelInventory.push(hotel);
  dbMod.saveSync();
  res.json({ hotel: hotel });
});

router.delete('/hotels/:id', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  data.hotelInventory = data.hotelInventory.filter(function (h) { return h.id !== req.params.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

router.post('/hotels/:id/room-types', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var hotel = findHotel(data, req.params.id);
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  var name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام نوع اتاق را وارد کنید' });
  var roomType = { id: uid('room'), name: name };
  hotel.roomTypes.push(roomType);
  dbMod.saveSync();
  res.json({ hotel: hotel });
});

router.delete('/hotels/:id/room-types/:roomTypeId', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var hotel = findHotel(data, req.params.id);
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  hotel.roomTypes = hotel.roomTypes.filter(function (r) { return r.id !== req.params.roomTypeId; });
  hotel.rates = hotel.rates.filter(function (r) { return !(r.itemType === 'room' && r.itemId === req.params.roomTypeId); });
  dbMod.saveSync();
  res.json({ hotel: hotel });
});

router.post('/hotels/:id/services', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var hotel = findHotel(data, req.params.id);
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  var name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام خدمت را وارد کنید' });
  var service = { id: uid('svc'), name: name };
  hotel.services.push(service);
  dbMod.saveSync();
  res.json({ hotel: hotel });
});

router.delete('/hotels/:id/services/:serviceId', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var hotel = findHotel(data, req.params.id);
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  hotel.services = hotel.services.filter(function (s) { return s.id !== req.params.serviceId; });
  hotel.rates = hotel.rates.filter(function (r) { return !(r.itemType === 'service' && r.itemId === req.params.serviceId); });
  dbMod.saveSync();
  res.json({ hotel: hotel });
});

// Nightly rate calendar entry — one price for one room-type/service on one date.
// Posting again for the same item+date updates the existing price (upsert),
// matching the same pattern already used for daily FX rates.
router.post('/hotels/:id/rates', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var hotel = findHotel(data, req.params.id);
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  var body = req.body || {};
  var itemType = body.itemType === 'service' ? 'service' : 'room';
  var itemId = body.itemId;
  var jy = parseInt(body.jy, 10), jm = parseInt(body.jm, 10), jd = parseInt(body.jd, 10);
  var price = parseFloat(body.price);
  var currency = String(body.currency || '').trim();
  if (!itemId || !validate.isValidJalaliDate(jy, jm, jd) || !validate.isPositiveNumber(price) || !currency) {
    return res.status(400).json({ error: 'مورد، تاریخ، نرخ و ارز را کامل و معتبر وارد کنید' });
  }
  var pool = itemType === 'service' ? hotel.services : hotel.roomTypes;
  if (!pool.some(function (x) { return x.id === itemId; })) {
    return res.status(400).json({ error: 'مورد انتخاب‌شده در این هتل تعریف نشده' });
  }
  var key = jy * 10000 + jm * 100 + jd;
  var existing = hotel.rates.find(function (r) {
    return r.itemType === itemType && r.itemId === itemId && (r.jy * 10000 + r.jm * 100 + r.jd) === key;
  });
  if (existing) {
    existing.price = price; existing.currency = currency;
    dbMod.saveSync();
    return res.json({ rate: existing, updated: true });
  }
  var rate = { id: uid('rate'), itemType: itemType, itemId: itemId, jy: jy, jm: jm, jd: jd, price: price, currency: currency };
  hotel.rates.push(rate);
  dbMod.saveSync();
  res.json({ rate: rate, updated: false });
});

router.delete('/hotels/:id/rates/:rateId', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var hotel = findHotel(data, req.params.id);
  if (!hotel) return res.status(404).json({ error: 'هتل یافت نشد' });
  hotel.rates = hotel.rates.filter(function (r) { return r.id !== req.params.rateId; });
  dbMod.saveSync();
  res.json({ hotel: hotel });
});

/* ================= Flights: schedule + fare classes with seat capacity ================= */

function findFlight(data, flightId) { return data.flightInventory.find(function (f) { return f.id === flightId; }); }

// Plain listing (kept for callers like the tour-booking screen that just need
// every defined flight to build a <select> from) — no filtering here.
router.get('/flights', authMw.attachUser, viewGuard, function (req, res) {
  var data = dbMod.db();
  res.json({ flights: data.flightInventory });
});

// Search by route + date range — built for the case where hundreds/thousands of
// flights are defined and scrolling a flat list stops being usable. Given an
// origin+destination and a date window, returns BOTH the outbound leg
// (origin -> destination) and the return leg (destination -> origin) whose
// departure date falls inside the window, each tagged with its direction.
router.get('/flights/search', authMw.attachUser, viewGuard, function (req, res) {
  var q = req.query || {};
  var origin = String(q.origin || '').trim();
  var destination = String(q.destination || '').trim();
  if (!origin || !destination) return res.status(400).json({ error: 'مبدا و مقصد را انتخاب کنید' });

  var fromKey = null, toKey = null;
  if (q.fromJy && q.fromJm && q.fromJd) {
    fromKey = parseInt(q.fromJy, 10) * 10000 + parseInt(q.fromJm, 10) * 100 + parseInt(q.fromJd, 10);
  }
  if (q.toJy && q.toJm && q.toJd) {
    toKey = parseInt(q.toJy, 10) * 10000 + parseInt(q.toJm, 10) * 100 + parseInt(q.toJd, 10);
  }

  var data = dbMod.db();
  var results = data.flightInventory.filter(function (f) {
    var isOutbound = f.origin === origin && f.destination === destination;
    var isReturn = f.origin === destination && f.destination === origin;
    if (!isOutbound && !isReturn) return false;
    var depKey = f.departJy * 10000 + f.departJm * 100 + f.departJd;
    if (fromKey != null && depKey < fromKey) return false;
    if (toKey != null && depKey > toKey) return false;
    return true;
  }).map(function (f) {
    return Object.assign({}, f, { direction: (f.origin === origin ? 'outbound' : 'return') });
  }).sort(function (a, b) {
    return (a.departJy * 10000 + a.departJm * 100 + a.departJd) - (b.departJy * 10000 + b.departJm * 100 + b.departJd);
  });

  res.json({ flights: results });
});

router.post('/flights', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var departJy = parseInt(body.departJy, 10), departJm = parseInt(body.departJm, 10), departJd = parseInt(body.departJd, 10);
  var arriveJy = body.arriveJy != null ? parseInt(body.arriveJy, 10) : departJy;
  var arriveJm = body.arriveJm != null ? parseInt(body.arriveJm, 10) : departJm;
  var arriveJd = body.arriveJd != null ? parseInt(body.arriveJd, 10) : departJd;
  if (!validate.isNonEmptyString(body.origin) || !validate.isNonEmptyString(body.destination) || !validate.isValidJalaliDate(departJy, departJm, departJd)) {
    return res.status(400).json({ error: 'مبدا، مقصد و تاریخ رفت را کامل و معتبر وارد کنید' });
  }
  if (!validate.isValidJalaliDate(arriveJy, arriveJm, arriveJd)) {
    return res.status(400).json({ error: 'تاریخ رسیدن معتبر نیست' });
  }
  if (body.departTime && !validate.isValidTimeStr(body.departTime)) return res.status(400).json({ error: 'ساعت پرواز رفت باید به‌صورت HH:MM باشد' });
  if (body.arriveTime && !validate.isValidTimeStr(body.arriveTime)) return res.status(400).json({ error: 'ساعت رسیدن باید به‌صورت HH:MM باشد' });
  var flight = {
    id: uid('flt'), origin: String(body.origin).trim(), destination: String(body.destination).trim(),
    airline: String(body.airline || '').trim(), flightNumber: String(body.flightNumber || '').trim(),
    departJy: departJy, departJm: departJm, departJd: departJd, departTime: String(body.departTime || '').trim(),
    arriveJy: arriveJy, arriveJm: arriveJm, arriveJd: arriveJd,
    arriveTime: String(body.arriveTime || '').trim(),
    fareClasses: []
  };
  var data = dbMod.db();
  data.flightInventory.push(flight);
  dbMod.saveSync();
  res.json({ flight: flight });
});

router.patch('/flights/:id', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var flight = findFlight(data, req.params.id);
  if (!flight) return res.status(404).json({ error: 'پرواز یافت نشد' });
  var body = req.body || {};

  // Validate date/time fields against the MERGED result (existing value
  // unless this call is changing it), so a partial PATCH can't leave the
  // flight with a mix of an updated year and a stale, now-mismatched month.
  var merged = {
    departJy: body.departJy != null ? parseInt(body.departJy, 10) : flight.departJy,
    departJm: body.departJm != null ? parseInt(body.departJm, 10) : flight.departJm,
    departJd: body.departJd != null ? parseInt(body.departJd, 10) : flight.departJd,
    arriveJy: body.arriveJy != null ? parseInt(body.arriveJy, 10) : flight.arriveJy,
    arriveJm: body.arriveJm != null ? parseInt(body.arriveJm, 10) : flight.arriveJm,
    arriveJd: body.arriveJd != null ? parseInt(body.arriveJd, 10) : flight.arriveJd
  };
  if (!validate.isValidJalaliDate(merged.departJy, merged.departJm, merged.departJd)) {
    return res.status(400).json({ error: 'تاریخ رفت معتبر نیست' });
  }
  if (!validate.isValidJalaliDate(merged.arriveJy, merged.arriveJm, merged.arriveJd)) {
    return res.status(400).json({ error: 'تاریخ رسیدن معتبر نیست' });
  }
  if (body.departTime != null && body.departTime !== '' && !validate.isValidTimeStr(body.departTime)) {
    return res.status(400).json({ error: 'ساعت پرواز رفت باید به‌صورت HH:MM باشد' });
  }
  if (body.arriveTime != null && body.arriveTime !== '' && !validate.isValidTimeStr(body.arriveTime)) {
    return res.status(400).json({ error: 'ساعت رسیدن باید به‌صورت HH:MM باشد' });
  }
  if (body.origin != null && !validate.isNonEmptyString(body.origin)) return res.status(400).json({ error: 'مبدا نمی‌تواند خالی باشد' });
  if (body.destination != null && !validate.isNonEmptyString(body.destination)) return res.status(400).json({ error: 'مقصد نمی‌تواند خالی باشد' });

  Object.assign(flight, merged);
  ['origin','destination','airline','flightNumber','departTime','arriveTime'].forEach(function (k) {
    if (body[k] != null) flight[k] = String(body[k]).trim();
  });
  dbMod.saveSync();
  res.json({ flight: flight });
});

router.delete('/flights/:id', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  data.flightInventory = data.flightInventory.filter(function (f) { return f.id !== req.params.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

router.post('/flights/:id/fare-classes', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var flight = findFlight(data, req.params.id);
  if (!flight) return res.status(404).json({ error: 'پرواز یافت نشد' });
  var body = req.body || {};
  var name = String(body.name || '').trim();
  var capacity = parseInt(body.capacity, 10);
  var price = parseFloat(body.price);
  var currency = String(body.currency || '').trim();
  var costPrice = body.costPrice != null && body.costPrice !== '' ? parseFloat(body.costPrice) : null;
  var costCurrency = body.costCurrency ? String(body.costCurrency).trim() : currency;
  if (!validate.isNonEmptyString(name) || !validate.isPositiveNumber(capacity) || !Number.isInteger(capacity) || !validate.isPositiveNumber(price) || !currency) {
    return res.status(400).json({ error: 'نام کلاس، ظرفیت، نرخ فروش و ارز را کامل و معتبر وارد کنید' });
  }
  if (costPrice != null && !validate.isNonNegativeNumber(costPrice)) {
    return res.status(400).json({ error: 'نرخ خرید معتبر نیست' });
  }
  // New fare classes are appended to the end of the array, which IS the
  // fallthrough order — the booking engine always fills from index 0
  // onward, moving to the next class only once the current one sells out.
  var fareClass = {
    id: uid('fc'), name: name, capacity: capacity, seatsSold: 0, price: price, currency: currency,
    costPrice: costPrice, costCurrency: costCurrency
  };
  flight.fareClasses.push(fareClass);
  dbMod.saveSync();
  res.json({ flight: flight });
});

router.patch('/flights/:id/fare-classes/:classId', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var flight = findFlight(data, req.params.id);
  if (!flight) return res.status(404).json({ error: 'پرواز یافت نشد' });
  var fc = flight.fareClasses.find(function (c) { return c.id === req.params.classId; });
  if (!fc) return res.status(404).json({ error: 'کلاس نرخی یافت نشد' });
  var body = req.body || {};
  if (body.name != null) {
    if (!validate.isNonEmptyString(body.name)) return res.status(400).json({ error: 'نام کلاس نمی‌تواند خالی باشد' });
    fc.name = String(body.name).trim();
  }
  if (body.capacity != null) {
    var newCap = parseInt(body.capacity, 10);
    if (!validate.isPositiveNumber(newCap) || !Number.isInteger(newCap)) return res.status(400).json({ error: 'ظرفیت معتبر نیست' });
    if (newCap < fc.seatsSold) return res.status(400).json({ error: 'ظرفیت جدید نمی‌تواند کمتر از تعداد صندلی‌های فروخته‌شده ('+fc.seatsSold+') باشد' });
    fc.capacity = newCap;
  }
  if (body.price != null) {
    var newPrice = parseFloat(body.price);
    if (!validate.isPositiveNumber(newPrice)) return res.status(400).json({ error: 'نرخ فروش معتبر نیست' });
    fc.price = newPrice;
  }
  if (body.currency != null) {
    if (!validate.isNonEmptyString(body.currency)) return res.status(400).json({ error: 'ارز نمی‌تواند خالی باشد' });
    fc.currency = String(body.currency).trim();
  }
  if (body.costPrice != null) {
    if (body.costPrice === '') {
      fc.costPrice = null;
    } else {
      var newCostPrice = parseFloat(body.costPrice);
      if (!validate.isNonNegativeNumber(newCostPrice)) return res.status(400).json({ error: 'نرخ خرید معتبر نیست' });
      fc.costPrice = newCostPrice;
    }
  }
  if (body.costCurrency != null) fc.costCurrency = String(body.costCurrency).trim();
  dbMod.saveSync();
  res.json({ flight: flight });
});

// Move a fare class up/down in the array — this ordering IS the fallthrough
// priority the booking engine uses ("sell class 1 first, then class 2...").
router.post('/flights/:id/fare-classes/:classId/reorder', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var flight = findFlight(data, req.params.id);
  if (!flight) return res.status(404).json({ error: 'پرواز یافت نشد' });
  var idx = flight.fareClasses.findIndex(function (c) { return c.id === req.params.classId; });
  if (idx === -1) return res.status(404).json({ error: 'کلاس نرخی یافت نشد' });
  var direction = (req.body || {}).direction;
  var swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= flight.fareClasses.length) return res.status(400).json({ error: 'امکان جابه‌جایی در این جهت نیست' });
  var tmp = flight.fareClasses[idx];
  flight.fareClasses[idx] = flight.fareClasses[swapWith];
  flight.fareClasses[swapWith] = tmp;
  dbMod.saveSync();
  res.json({ flight: flight });
});

router.delete('/flights/:id/fare-classes/:classId', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var flight = findFlight(data, req.params.id);
  if (!flight) return res.status(404).json({ error: 'پرواز یافت نشد' });
  var fc = flight.fareClasses.find(function (c) { return c.id === req.params.classId; });
  if (fc && fc.seatsSold > 0) return res.status(400).json({ error: 'این کلاس نرخی صندلی فروخته‌شده دارد و قابل حذف نیست' });
  flight.fareClasses = flight.fareClasses.filter(function (c) { return c.id !== req.params.classId; });
  dbMod.saveSync();
  res.json({ flight: flight });
});

module.exports = router;
