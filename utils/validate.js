'use strict';
var jalali = require('./jalali');

// True only for a real, in-range Jalali calendar date (rejects month=13,
// day=32, Feb-30-equivalent, etc.) — not just "these three fields are truthy".
function isValidJalaliDate(jy, jm, jd) {
  jy = parseInt(jy, 10); jm = parseInt(jm, 10); jd = parseInt(jd, 10);
  if (!Number.isInteger(jy) || jy < 1300 || jy > 1500) return false;
  if (!Number.isInteger(jm) || jm < 1 || jm > 12) return false;
  if (!Number.isInteger(jd) || jd < 1 || jd > jalali.jalaaliMonthLength(jy, jm)) return false;
  return true;
}

// Same as isValidJalaliDate but the date is allowed to be entirely absent
// (all three fields null/empty/undefined) — for optional fields like a
// passenger's passport expiry, where "not entered yet" is fine but a
// half-entered or nonsensical date is not.
function isValidOptionalJalaliDate(jy, jm, jd) {
  if ((jy === undefined || jy === null || jy === '') &&
      (jm === undefined || jm === null || jm === '') &&
      (jd === undefined || jd === null || jd === '')) return true;
  return isValidJalaliDate(jy, jm, jd);
}

var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function isValidTimeStr(s) { return typeof s === 'string' && TIME_RE.test(s); }

function isPositiveNumber(n) { return typeof n === 'number' && isFinite(n) && n > 0; }
function isNonNegativeNumber(n) { return typeof n === 'number' && isFinite(n) && n >= 0; }
function isNonEmptyString(s) { return typeof s === 'string' && s.trim().length > 0; }

// Password policy: at least 12 characters, and at least 3 of the 4 character
// classes (uppercase, lowercase, digit, special) — strict enough to block
// weak/guessable passwords without being so strict it locks people out of
// picking something they can remember. Returns a Persian error string
// describing exactly what's missing, or null when the password is fine.
function passwordPolicyError(pw) {
  pw = String(pw || '');
  if (pw.length < 12) return 'رمز عبور باید حداقل ۱۲ کاراکتر باشد';
  var classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  if (classes < 3) return 'رمز عبور باید حداقل سه نوع از این چهار مورد را داشته باشد: حرف بزرگ، حرف کوچک، عدد، کاراکتر خاص';
  return null;
}

module.exports = {
  isValidJalaliDate: isValidJalaliDate,
  isValidOptionalJalaliDate: isValidOptionalJalaliDate,
  isValidTimeStr: isValidTimeStr,
  isPositiveNumber: isPositiveNumber,
  isNonNegativeNumber: isNonNegativeNumber,
  isNonEmptyString: isNonEmptyString,
  passwordPolicyError: passwordPolicyError
};
