'use strict';
var jalali = require('./jalali');

function flightPriceToman(millionVal) { return Math.round((parseFloat(millionVal) || 0) * 1000000); }
// Flight price is entered as "million Toman" (natural for staff), but every
// place that displays/reports it shows Rial, matching hotel cost & sale
// amount elsewhere. 1 Toman = 10 Rial.
function flightPriceRial(millionVal) { return flightPriceToman(millionVal) * 10; }

function getExchangeRate(currencyRates, currency, jy, jm, jd) {
  if (!currency) return null;
  var target = jalali.dateKey(jy, jm, jd);
  var best = null;
  currencyRates.forEach(function (cr) {
    if (cr.currency !== currency) return;
    var k = jalali.dateKey(cr.jy, cr.jm, cr.jd);
    if (k > target) return; // only rates effective on/before the record's date count
    if (!best || k > jalali.dateKey(best.jy, best.jm, best.jd)) best = cr;
  });
  return best ? best.rate : null;
}

function voucherRialAmounts(v, record, currencyRates) {
  var rate = getExchangeRate(currencyRates, v.purchaseCurrency, record.jy, record.jm, record.jd);
  if (rate == null) return null;
  var purchaseRial = Math.round((v.purchaseAmount || 0) * rate);
  var serviceRial = Math.round((v.serviceAmount || 0) * rate);
  return { rate: rate, purchaseRial: purchaseRial, serviceRial: serviceRial, totalRial: purchaseRial + serviceRial };
}

function flightOutSumToman(record) {
  return record.vouchers.reduce(function (s, v) { return s + flightPriceToman(v.flightOutPriceMillion); }, 0);
}
function flightInSumToman(record) {
  return record.vouchers.reduce(function (s, v) { return s + flightPriceToman(v.flightInPriceMillion); }, 0);
}

// Returns { totalRial, incomplete }. incomplete=true means at least one
// voucher had a purchase/service amount that could NOT be converted to Rial
// (missing currency, or no FX rate on/before the record's date) — in that
// case totalRial is a PARTIAL sum and must never be treated as the real cost.
function hotelRialValue(record, currencyRates) {
  var total = 0, incomplete = false;
  record.vouchers.forEach(function (v) {
    var hasAmount = (v.purchaseAmount > 0) || (v.serviceAmount > 0);
    if (!hasAmount) return;
    if (!v.purchaseCurrency) { incomplete = true; return; }
    var amounts = voucherRialAmounts(v, record, currencyRates);
    if (!amounts) { incomplete = true; return; } // no FX rate found for this currency/date
    total += amounts.totalRial;
  });
  return { totalRial: total, incomplete: incomplete };
}

// Total cost of a record: outbound + return flight cost (Rial) + hotel/service
// cost converted to Rial using the FX rate effective on the record's date.
// Returns null when the cost genuinely can't be computed (e.g. a used
// currency has no FX rate defined yet) — callers MUST treat null as
// "unknown", never silently as zero, or profit reports become wrong.
function totalPurchaseCostRial(record, currencyRates) {
  var flightRial = (flightOutSumToman(record) + flightInSumToman(record)) * 10;
  var hotel = hotelRialValue(record, currencyRates);
  if (hotel.incomplete) return null;
  return flightRial + hotel.totalRial;
}

function depositSumOf(record) { return record.deposits.reduce(function (s, d) { return s + d.amount; }, 0); }
function isSettled(record) { return record.totalAmount > 0 && depositSumOf(record) >= record.totalAmount; }

// The profit figure the business owner explicitly asked for:
// سود = مبلغ کل فروش - مبلغ کل خرید (هتل + پرواز)
// Returns null (not a wrong number) when the cost side is unknown.
function profitOf(record, currencyRates) {
  var cost = totalPurchaseCostRial(record, currencyRates);
  if (cost == null) return null;
  return (record.totalAmount || 0) - cost;
}

module.exports = {
  flightPriceToman: flightPriceToman, flightPriceRial: flightPriceRial,
  getExchangeRate: getExchangeRate, voucherRialAmounts: voucherRialAmounts,
  flightOutSumToman: flightOutSumToman, flightInSumToman: flightInSumToman,
  hotelRialValue: hotelRialValue, totalPurchaseCostRial: totalPurchaseCostRial,
  depositSumOf: depositSumOf, isSettled: isSettled, profitOf: profitOf
};
