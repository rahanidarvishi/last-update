'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var validate = require('../utils/validate');

test('isValidJalaliDate accepts a real date', function () {
  assert.equal(validate.isValidJalaliDate(1403, 1, 1), true);
  assert.equal(validate.isValidJalaliDate(1403, 12, 30), true); // 1403 is leap
});

test('isValidJalaliDate rejects out-of-range month/day', function () {
  assert.equal(validate.isValidJalaliDate(1403, 13, 1), false); // no month 13
  assert.equal(validate.isValidJalaliDate(1403, 0, 1), false); // no month 0
  assert.equal(validate.isValidJalaliDate(1404, 12, 30), false); // 1404 Esfand only has 29 days
  assert.equal(validate.isValidJalaliDate(1403, 1, 32), false); // no day 32
});

test('isValidJalaliDate rejects out-of-supported-range years', function () {
  assert.equal(validate.isValidJalaliDate(1299, 1, 1), false);
  assert.equal(validate.isValidJalaliDate(1501, 1, 1), false);
});

test('isValidOptionalJalaliDate allows a fully-empty date', function () {
  assert.equal(validate.isValidOptionalJalaliDate(null, null, null), true);
  assert.equal(validate.isValidOptionalJalaliDate('', '', ''), true);
  assert.equal(validate.isValidOptionalJalaliDate(undefined, undefined, undefined), true);
});

test('isValidOptionalJalaliDate rejects a half-entered date', function () {
  assert.equal(validate.isValidOptionalJalaliDate(1403, null, null), false);
  assert.equal(validate.isValidOptionalJalaliDate(1403, 1, null), false);
});

test('isValidTimeStr accepts HH:MM within range, rejects everything else', function () {
  assert.equal(validate.isValidTimeStr('00:00'), true);
  assert.equal(validate.isValidTimeStr('23:59'), true);
  assert.equal(validate.isValidTimeStr('24:00'), false);
  assert.equal(validate.isValidTimeStr('9:30'), false); // must be zero-padded
  assert.equal(validate.isValidTimeStr('not-a-time'), false);
});

test('passwordPolicyError: rejects passwords under 12 characters', function () {
  assert.match(validate.passwordPolicyError('Ab1!Ab1!Ab1'), /۱۲ کاراکتر/); // 11 chars
  assert.equal(validate.passwordPolicyError('Ab1!Ab1!Ab1!'), null); // 12 chars, 4 classes
});

test('passwordPolicyError: requires at least 3 of the 4 character classes', function () {
  // 12+ chars but only lowercase+digits (2 classes) -> rejected
  assert.match(validate.passwordPolicyError('abcdefgh1234'), /سه نوع/);
  // lowercase+uppercase+digits (3 classes) -> accepted
  assert.equal(validate.passwordPolicyError('Abcdefgh1234'), null);
});

test('isPositiveNumber / isNonNegativeNumber edge cases', function () {
  assert.equal(validate.isPositiveNumber(0), false);
  assert.equal(validate.isPositiveNumber(-1), false);
  assert.equal(validate.isPositiveNumber(0.01), true);
  assert.equal(validate.isNonNegativeNumber(0), true);
  assert.equal(validate.isNonNegativeNumber(-0.01), false);
  assert.equal(validate.isPositiveNumber(NaN), false);
  assert.equal(validate.isPositiveNumber(Infinity), false);
});

test('isNonEmptyString rejects whitespace-only strings', function () {
  assert.equal(validate.isNonEmptyString('   '), false);
  assert.equal(validate.isNonEmptyString(''), false);
  assert.equal(validate.isNonEmptyString('a'), true);
});
