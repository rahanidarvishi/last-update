'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var calc = require('../utils/calc');

function voucher(overrides) {
  return Object.assign({
    purchaseAmount: 0, purchaseCurrency: '', serviceAmount: 0,
    flightOutPriceMillion: 0, flightInPriceMillion: 0
  }, overrides);
}
function record(overrides) {
  return Object.assign({ jy: 1403, jm: 1, jd: 1, totalAmount: 0, vouchers: [], deposits: [] }, overrides);
}

test('flightPriceToman/Rial: "million Toman" input converts correctly', function () {
  assert.equal(calc.flightPriceToman(1.5), 1500000);
  assert.equal(calc.flightPriceRial(1.5), 15000000); // 1 Toman = 10 Rial
  assert.equal(calc.flightPriceToman(undefined), 0);
  assert.equal(calc.flightPriceToman('not a number'), 0);
});

test('getExchangeRate: picks the latest rate on or before the record date, never a later one', function () {
  var rates = [
    { currency: 'USD', jy: 1402, jm: 1, jd: 1, rate: 50000 },
    { currency: 'USD', jy: 1403, jm: 1, jd: 1, rate: 60000 },
    { currency: 'USD', jy: 1403, jm: 6, jd: 1, rate: 70000 } // in the future relative to the record below
  ];
  var rate = calc.getExchangeRate(rates, 'USD', 1403, 3, 1);
  assert.equal(rate, 60000); // the 1403/01/01 rate, not the later 1403/06/01 one
});

test('getExchangeRate: returns null when no rate exists for the currency/date', function () {
  assert.equal(calc.getExchangeRate([], 'USD', 1403, 1, 1), null);
  assert.equal(calc.getExchangeRate([{ currency: 'EUR', jy: 1400, jm: 1, jd: 1, rate: 1 }], 'USD', 1403, 1, 1), null);
});

test('totalPurchaseCostRial: sums flight (both legs) + hotel/service cost in Rial', function () {
  var rates = [{ currency: 'USD', jy: 1400, jm: 1, jd: 1, rate: 60000 }];
  var r = record({
    vouchers: [voucher({
      purchaseAmount: 100, purchaseCurrency: 'USD', serviceAmount: 10,
      flightOutPriceMillion: 2, flightInPriceMillion: 1.5 // 2,000,000 + 1,500,000 Toman
    })]
  });
  // flight: (2,000,000 + 1,500,000) Toman * 10 = 35,000,000 Rial
  // hotel: (100 + 10) USD * 60,000 = 6,600,000 Rial
  var cost = calc.totalPurchaseCostRial(r, rates);
  assert.equal(cost, 35000000 + 6600000);
});

test('totalPurchaseCostRial: returns null (not zero!) when a used currency has no FX rate', function () {
  var r = record({ vouchers: [voucher({ purchaseAmount: 100, purchaseCurrency: 'USD' })] });
  assert.equal(calc.totalPurchaseCostRial(r, []), null);
});

test('totalPurchaseCostRial: returns null when an amount was entered with no currency selected', function () {
  var r = record({ vouchers: [voucher({ purchaseAmount: 100, purchaseCurrency: '' })] });
  assert.equal(calc.totalPurchaseCostRial(r, []), null);
});

test('profitOf: propagates the "unknown cost" null instead of ever guessing zero', function () {
  var r = record({ totalAmount: 1000000, vouchers: [voucher({ purchaseAmount: 5, purchaseCurrency: 'USD' })] });
  assert.equal(calc.profitOf(r, []), null);
});

test('profitOf: sale minus cost when the cost side is fully known', function () {
  var rates = [{ currency: 'USD', jy: 1400, jm: 1, jd: 1, rate: 60000 }];
  var r = record({ totalAmount: 50000000, vouchers: [voucher({ purchaseAmount: 100, purchaseCurrency: 'USD' })] });
  assert.equal(calc.profitOf(r, rates), 50000000 - 6000000);
});

test('depositSumOf / isSettled', function () {
  var r = record({ totalAmount: 1000, deposits: [{ amount: 400 }, { amount: 600 }] });
  assert.equal(calc.depositSumOf(r), 1000);
  assert.equal(calc.isSettled(r), true);

  var partial = record({ totalAmount: 1000, deposits: [{ amount: 400 }] });
  assert.equal(calc.isSettled(partial), false);
});

test('isSettled: a record with no sale amount is never "settled"', function () {
  var r = record({ totalAmount: 0, deposits: [] });
  assert.equal(calc.isSettled(r), false);
});
