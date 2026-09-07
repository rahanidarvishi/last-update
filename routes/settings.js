'use strict';
var express = require('express');
var dbMod = require('../db');
var authMw = require('../middleware/auth');
var uid = require('../utils/id').uid;
var validate = require('../utils/validate');

var router = express.Router();
var viewGuard = authMw.requirePermission('settings', 'view');
var editGuard = authMw.requirePermission('settings', 'edit');

// counters/procurementExperts used to be manually-typed free-text lists here.
// Per later request, they are now DERIVED from whichever active users have a
// role tagged with the matching roleCategory (set in "سطح دسترسی") — so they
// no longer appear in SIMPLE_LISTS and can't be edited through this route.
var SIMPLE_LISTS = ['agencies', 'currencies'];

function usersForRoleCategory(data, category) {
  return data.users.filter(function (u) {
    if (!u.active) return false;
    var role = data.roles.find(function (r) { return r.id === u.roleId; });
    return !!(role && role.roleCategory === category);
  }).map(function (u) { return u.fullName; });
}

router.get('/', authMw.attachUser, authMw.requireAuth, function (req, res) {
  var data = dbMod.db();
  res.json({
    agencies: data.agencies,
    counters: usersForRoleCategory(data, 'counter'),
    procurementExperts: usersForRoleCategory(data, 'procurementExpert'),
    currencies: data.currencies,
    cities: data.cities, currencyRates: data.currencyRates,
    companySettings: data.companySettings
  });
});

// Only a genuine base64 image data URL is accepted — otherwise arbitrary
// HTML/JS could be stored here and rendered unescaped inside <img src="...">
// on every generated voucher/ticket PDF (see pdf-documents.js pdfHeaderHtml).
var IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// Agency logo (data URL) used on generated voucher/ticket PDFs — small enough
// (a logo image) that storing it as a data URL in the JSON store is fine.
router.post('/logo', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var dataUrl = String(body.logoDataUrl || '');
  if (dataUrl && dataUrl.length > 1500000) {
    return res.status(400).json({ error: 'حجم لوگو زیاد است — لطفاً تصویر کوچک‌تری انتخاب کنید' });
  }
  if (dataUrl && !IMAGE_DATA_URL_RE.test(dataUrl)) {
    return res.status(400).json({ error: 'فرمت لوگو نامعتبر است' });
  }
  var data = dbMod.db();
  data.companySettings.logoDataUrl = dataUrl;
  if (body.agencyNameEn != null) data.companySettings.agencyNameEn = String(body.agencyNameEn).trim();
  dbMod.saveSync();
  res.json({ companySettings: data.companySettings });
});

router.post('/list/:listName', authMw.attachUser, editGuard, function (req, res) {
  var listName = req.params.listName;
  if (SIMPLE_LISTS.indexOf(listName) === -1) return res.status(400).json({ error: 'فهرست نامعتبر است' });
  var value = String((req.body || {}).value || '').trim();
  if (!value) return res.status(400).json({ error: 'مقدار را وارد کنید' });
  var data = dbMod.db();
  if (data[listName].indexOf(value) === -1) data[listName].push(value);
  dbMod.saveSync();
  res.json({ list: data[listName] });
});

router.delete('/list/:listName/:value', authMw.attachUser, editGuard, function (req, res) {
  var listName = req.params.listName;
  if (SIMPLE_LISTS.indexOf(listName) === -1) return res.status(400).json({ error: 'فهرست نامعتبر است' });
  var data = dbMod.db();
  var value = decodeURIComponent(req.params.value);
  data[listName] = data[listName].filter(function (v) { return v !== value; });
  dbMod.saveSync();
  res.json({ list: data[listName] });
});

router.post('/cities', authMw.attachUser, editGuard, function (req, res) {
  var name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام شهر را وارد کنید' });
  var data = dbMod.db();
  if (data.cities.some(function (c) { return c.name === name; })) {
    return res.status(400).json({ error: 'این شهر قبلاً اضافه شده' });
  }
  var city = { id: uid('city'), name: name, hotels: [], agents: [] };
  data.cities.push(city);
  dbMod.saveSync();
  res.json({ city: city });
});

router.delete('/cities/:cityId', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  data.cities = data.cities.filter(function (c) { return c.id !== req.params.cityId; });
  dbMod.saveSync();
  res.json({ ok: true });
});

function findCity(data, cityId) { return data.cities.find(function (c) { return c.id === cityId; }); }

router.post('/cities/:cityId/hotels', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var city = findCity(data, req.params.cityId);
  if (!city) return res.status(404).json({ error: 'شهر یافت نشد' });
  var name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام هتل را وارد کنید' });
  if (city.hotels.indexOf(name) === -1) city.hotels.push(name);
  dbMod.saveSync();
  res.json({ city: city });
});

router.delete('/cities/:cityId/hotels/:hotelName', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var city = findCity(data, req.params.cityId);
  if (!city) return res.status(404).json({ error: 'شهر یافت نشد' });
  var hotelName = decodeURIComponent(req.params.hotelName);
  city.hotels = city.hotels.filter(function (h) { return h !== hotelName; });
  dbMod.saveSync();
  res.json({ city: city });
});

router.post('/cities/:cityId/agents', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var city = findCity(data, req.params.cityId);
  if (!city) return res.status(404).json({ error: 'شهر یافت نشد' });
  var name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام کارگذار را وارد کنید' });
  if (city.agents.indexOf(name) === -1) city.agents.push(name);
  dbMod.saveSync();
  res.json({ city: city });
});

router.delete('/cities/:cityId/agents/:agentName', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  var city = findCity(data, req.params.cityId);
  if (!city) return res.status(404).json({ error: 'شهر یافت نشد' });
  var agentName = decodeURIComponent(req.params.agentName);
  city.agents = city.agents.filter(function (a) { return a !== agentName; });
  dbMod.saveSync();
  res.json({ city: city });
});

/* ---- Daily FX rates: one rate per currency per day, used everywhere a
   foreign-currency hotel/service cost needs a Rial equivalent. ---- */
router.post('/currency-rates', authMw.attachUser, editGuard, function (req, res) {
  var body = req.body || {};
  var currency = String(body.currency || '').trim();
  var jy = parseInt(body.jy, 10), jm = parseInt(body.jm, 10), jd = parseInt(body.jd, 10);
  var rate = parseFloat(body.rate);
  if (!currency || !validate.isValidJalaliDate(jy, jm, jd) || !validate.isPositiveNumber(rate)) {
    return res.status(400).json({ error: 'ارز، تاریخ و نرخ معتبر را وارد کنید' });
  }
  var data = dbMod.db();
  var key = jy * 10000 + jm * 100 + jd;
  var existing = data.currencyRates.find(function (cr) {
    return cr.currency === currency && (cr.jy * 10000 + cr.jm * 100 + cr.jd) === key;
  });
  if (existing) {
    existing.rate = rate; existing.createdAt = new Date().toISOString();
    dbMod.saveSync();
    return res.json({ currencyRate: existing, updated: true });
  }
  var cr = { id: uid('fx'), currency: currency, jy: jy, jm: jm, jd: jd, rate: rate, createdAt: new Date().toISOString() };
  data.currencyRates.push(cr);
  dbMod.saveSync();
  res.json({ currencyRate: cr, updated: false });
});

router.delete('/currency-rates/:id', authMw.attachUser, editGuard, function (req, res) {
  var data = dbMod.db();
  data.currencyRates = data.currencyRates.filter(function (cr) { return cr.id !== req.params.id; });
  dbMod.saveSync();
  res.json({ ok: true });
});

module.exports = router;
