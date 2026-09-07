'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var jalali = require('../utils/jalali');

test('toJalaali / toGregorian round-trip a known date', function () {
  // 2024-03-20 is Nowruz eve -> 1403/01/01 in the Jalali calendar.
  var j = jalali.toJalaali(2024, 3, 20);
  assert.equal(j.jy, 1403);
  assert.equal(j.jm, 1);
  assert.equal(j.jd, 1);

  var g = jalali.toGregorian(j.jy, j.jm, j.jd);
  assert.equal(g.gy, 2024);
  assert.equal(g.gm, 3);
  assert.equal(g.gd, 20);
});

test('jalaaliMonthLength: first 6 months are always 31 days', function () {
  for (var m = 1; m <= 6; m++) assert.equal(jalali.jalaaliMonthLength(1403, m), 31);
});

test('jalaaliMonthLength: months 7-11 are always 30 days', function () {
  for (var m = 7; m <= 11; m++) assert.equal(jalali.jalaaliMonthLength(1403, m), 30);
});

test('jalaaliMonthLength: month 12 (Esfand) is 29 or 30 depending on leap year', function () {
  // 1403 is a known leap year (30-day Esfand); 1404 is not (29-day Esfand).
  assert.equal(jalali.jalaaliMonthLength(1403, 12), 30);
  assert.equal(jalali.jalaaliMonthLength(1404, 12), 29);
});

test('dateKey produces a strictly increasing, comparable integer', function () {
  var a = jalali.dateKey(1403, 1, 1);
  var b = jalali.dateKey(1403, 1, 2);
  var c = jalali.dateKey(1403, 2, 1);
  var d = jalali.dateKey(1404, 1, 1);
  assert.ok(a < b);
  assert.ok(b < c);
  assert.ok(c < d);
});

test('jalaliStrOf pads single-digit month/day with a leading zero', function () {
  assert.equal(jalali.jalaliStrOf(1403, 1, 5), '1403/01/05');
  assert.equal(jalali.jalaliStrOf(1403, 12, 30), '1403/12/30');
});
