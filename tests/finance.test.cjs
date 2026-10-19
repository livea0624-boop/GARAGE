const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the application's real functions without starting the DOM application.
// Top-level function declarations end at an unindented closing brace (or on
// their opening line), so no copy of the accounting implementation lives here.
const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
function functionSource(name) {
  const match = new RegExp(`^function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `Missing application function ${name}`);
  const body = source.slice(match.index);
  const firstLine = body.slice(0, body.indexOf('\n'));
  return firstLine.endsWith('}') ? firstLine : body.slice(0, body.indexOf('\n}') + 2);
}
const functions = [
  'moneyCents', 'moneyAmount', 'money', 'money0', 'moneyValue',
  'normalizePaymentMethod', 'paymentTypeFromTotals', 'makePaymentRecord',
  'buildLegacyPayments', 'normalizeClientOrder', 'allocateOrderPayment',
  'getPaymentRoundingDiscount', 'applyPaymentRoundingDiscount', 'addOrderPayment',
  'getItemRawTotal', 'orderItemFinalTotal', 'migrateLegacyLineRounding', 'ensureOrderItemPayments', 'getItemPaid',
  'getItemRemaining', 'getItemQty', 'getItemReceivedQty', 'getItemIssuedQty',
  'getOrderItemsSubtotal', 'ensureOrderRoundingAllocation', 'getItemEffectiveTotal',
  'getOrderPaymentLedgerTotal', 'getOrderRefundTotal', 'getItemRefundTotal',
  'recordItemRefundChange', 'getMaxItemRefund', 'recalcOrderFinancials',
  'applyOrderDiscountToItems', 'isOrderReadyToComplete',
  'getSaleDiscountPercent', 'getItemDiscountPercent', 'getCartTotals',
  'recalcProductSale', 'confirmRemoveItem', 'confirmReturn',
];

function environment() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} },
      querySelectorAll: () => [],
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    console, getClients: () => [], getCurrentSeller: () => 'Тестовый продавец',
    document: { getElementById: element, activeElement: null },
    cartList: { querySelectorAll: () => [] }, cartItems: [], saleMethod: 'cash',
    saleDiscount: element('saleDiscount'), saleFinalInput: element('saleFinalInput'),
    saleManualDiscount: element('saleManualDiscount'), saleRoundingAdjustment: 0,
    toast() {}, renderOrders() {}, renderSalesJournal() {}, renderHomeDashboard() {},
    openOrderHistory() {}, closeOrderHistory() {}, closeRemoveItemModal() {},
    closeReturnModal() {}, saveOrderHistory() {},
    showActionConfirm: (_type, action) => action(),
  });
  vm.runInContext(functions.map(functionSource).join('\n'), context, { filename: 'app-finance.js' });
  context.element = element;
  return context;
}
const plain = value => JSON.parse(JSON.stringify(value));
const cents = value => Math.round(value * 100);

function order(prices = [100, 100]) {
  return {
    id: '1', clientId: 'c1', createdAt: '2026-10-19T10:00:00.000Z', seller: 'Тестовый продавец',
    items: prices.map((price, i) => ({
      name: `Позиция ${i}`, qty: 1, price, discountPct: 0, discountAmount: 0,
      receivedQty: 1, issuedQty: 1, status: 'taken', paidAmount: 0,
    })), payments: [], events: [], roundingAdjustment: 0,
  };
}
function pay(api, value, amount, selected) {
  return api.addOrderPayment(value, amount, 'cash', 'Тестовый продавец', '19.10.2026', '13:00', '2026-10-19T10:00:00.000Z', selected);
}
function invariant(api, value) {
  const active = value.items.filter(item => !item.removed);
  const totals = active.reduce((sum, item) => sum + cents(api.getItemEffectiveTotal(item)), 0);
  const paid = active.reduce((sum, item) => sum + cents(api.getItemPaid(item)), 0);
  const debt = active.reduce((sum, item) => sum + cents(api.getItemRemaining(item)), 0);
  assert.equal(totals, cents(value.total));
  assert.equal(paid + cents(value.overpayment), cents(value.paid));
  assert.equal(debt, cents(value.debt));
  assert.equal(cents(value.paid), Math.max(0, cents(api.getOrderPaymentLedgerTotal(value)) - cents(api.getOrderRefundTotal(value))));
  for (const item of active) assert.ok(api.getItemPaid(item) <= api.getItemEffectiveTotal(item));
}

test('last payment discounts only the selected unpaid position and permits completion', () => {
  const api = environment(), value = order();
  pay(api, value, 100, [0]);
  const receipt = plain(value.payments[0]);
  assert.equal(api.getPaymentRoundingDiscount(value, 90, [1]), 10);
  assert.equal(api.applyPaymentRoundingDiscount(value, 10, [1]), 10);
  pay(api, value, 90, [1]);
  assert.deepEqual([value.total, value.paid, value.debt, value.overpayment], [190, 190, 0, 0]);
  assert.deepEqual(value.items.map(item => item.roundingAllocation), [0, 10]);
  assert.deepEqual(value.items.map(item => api.getItemRemaining(item)), [0, 0]);
  assert.deepEqual(plain(value.payments[0]), receipt);
  assert.equal(api.isOrderReadyToComplete(value), true);
  invariant(api, value);
});

test('overpaying a selection settles the other positions before recording order credit', () => {
  const api = environment(), value = order();
  pay(api, value, 200, [0]);
  assert.deepEqual(value.items.map(item => item.paidAmount), [100, 100]);
  assert.deepEqual([value.debt, value.overpayment], [0, 0]);
  pay(api, value, 25, [0]);
  assert.deepEqual([value.paid, value.overpayment], [225, 25]);
  assert.equal(api.isOrderReadyToComplete(value), true);
  invariant(api, value);
});

test('selection priority is preserved before any spillover', () => {
  const api = environment(), value = order([100, 100, 100]);
  pay(api, value, 150, [2]);
  assert.deepEqual(value.items.map(item => item.paidAmount), [50, 0, 100]);
  assert.equal(api.getPaymentRoundingDiscount(value, 90, [1]), 0);
  invariant(api, value);
});

test('duplicate selected indices cannot create an oversized rounding discount', () => {
  const api = environment(), value = order();
  pay(api, value, 100, [0]);
  assert.equal(api.getPaymentRoundingDiscount(value, 90, [0, 1, 1]), 10);
  assert.equal(api.applyPaymentRoundingDiscount(value, 10, [0, 1, 1]), 10);
  pay(api, value, 90, [0, 1, 1]);
  assert.deepEqual(value.items.map(item => item.roundingAllocation), [0, 10]);
  invariant(api, value);
});

test('rounding only closes a final balance and respects the 50 ruble limit', () => {
  const api = environment(), value = order();
  api.recalcOrderFinancials(value);
  assert.equal(api.getPaymentRoundingDiscount(value, 90, [0]), 0);
  assert.equal(api.getPaymentRoundingDiscount(value, 149.99, [0, 1]), 0);
  assert.equal(api.getPaymentRoundingDiscount(value, 150, [0, 1]), 50);
  assert.equal(api.getPaymentRoundingDiscount(value, 199.99, [0, 1]), 0.01);
  assert.equal(api.getPaymentRoundingDiscount(value, 200, [0, 1]), 0);
});

test('legacy conflicting per-item allocations are reconciled without changing receipts', () => {
  const api = environment(), value = order();
  pay(api, value, 100, [0]);
  pay(api, value, 90, [1]);
  delete value.roundingAllocationVersion;
  value.roundingAdjustment = 10;
  value.items[0].roundingAllocation = 5;
  value.items[1].roundingAllocation = 5;
  value.items[0].paidAmount = 100;
  value.items[1].paidAmount = 90;
  value.payments[0].receiptMetadata = { terminal: 'A-3', trace: 'original' };
  const receipts = plain(value.payments);
  const first = api.normalizeClientOrder(value);
  assert.equal(api.isOrderReadyToComplete(first.order), true);
  assert.deepEqual(plain(first.order.payments), receipts);
  invariant(api, first.order);
  const second = api.normalizeClientOrder(first.order);
  assert.deepEqual(plain(second.order), plain(first.order));
  assert.equal(second.changed, false);
});

test('legacy allocations cannot exceed the authoritative payment ledger', () => {
  const api = environment(), value = order();
  pay(api, value, 50, [0]);
  value.items.forEach(item => { item.paidAmount = 1000; });
  api.recalcOrderFinancials(value);
  assert.deepEqual(value.items.map(item => item.paidAmount), [50, 0]);
  assert.equal(value.debt, 150);
  invariant(api, value);
});

test('legacy aggregate rounding preserves a fully paid total when line cents round upwards', () => {
  const api = environment(), value = order([100.1, 100.1]);
  value.items.forEach(item => {
    item.discountPct = 5; item.discountAmount = 5.005;
    item.roundingAllocation = 0.095; item.paidAmount = 95;
  });
  value.total = 190; value.paid = 190; value.debt = 0; value.roundingAdjustment = 0.19;
  value.payments = [api.makePaymentRecord({ id: 'old-receipt', amount: 190, seller: 'Продавец' })];
  const normalized = api.normalizeClientOrder(value);
  assert.deepEqual([normalized.order.total, normalized.order.paid, normalized.order.debt], [190, 190, 0]);
  assert.equal(api.isOrderReadyToComplete(normalized.order), true);
  invariant(api, normalized.order);
  const second = api.normalizeClientOrder(normalized.order);
  assert.equal(second.changed, false);
  assert.deepEqual(plain(second.order), plain(normalized.order));
});

test('legacy aggregate rounding preserves the subtotal when line cents round downwards', () => {
  const api = environment(), value = order([1, 1]);
  value.items.forEach(item => { item.discountPct = 99.6; item.discountAmount = 0.996; });
  value.total = 0.01; value.paid = 0.01; value.roundingAdjustment = 0;
  value.payments = [api.makePaymentRecord({ id: 'old-small-receipt', amount: 0.01, seller: 'Продавец' })];
  const normalized = api.normalizeClientOrder(value);
  assert.deepEqual([normalized.order.total, normalized.order.paid, normalized.order.debt], [0.01, 0.01, 0]);
  assert.equal(api.isOrderReadyToComplete(normalized.order), true);
  invariant(api, normalized.order);
  assert.equal(api.normalizeClientOrder(normalized.order).changed, false);
});

test('legacy half-kopeck adjustment retains its stored paid total', () => {
  const api = environment(), value = order([100.1]);
  value.items[0].discountPct = 5; value.items[0].discountAmount = 5.005;
  value.items[0].paidAmount = 95; value.items[0].roundingAllocation = 0.09499999999999886;
  value.total = 95; value.paid = 95; value.roundingAdjustment = (100.1 - 5.005) - 95;
  value.payments = [api.makePaymentRecord({ id: 'half-cent-legacy', amount: 95 })];
  const migrated = api.normalizeClientOrder(value);
  assert.deepEqual([migrated.order.total, migrated.order.paid, migrated.order.debt, migrated.order.roundingAdjustment], [95, 95, 0, 0.1]);
  assert.equal(api.isOrderReadyToComplete(migrated.order), true);
  invariant(api, migrated.order);
  assert.equal(api.normalizeClientOrder(migrated.order).changed, false);
});

test('exact cent normalization does not queue writes for floating point sum residue', () => {
  const api = environment(), value = order([9.53, 14.84]);
  value.roundingAdjustment = 24.37;
  const first = api.normalizeClientOrder(value);
  for (let count = 0; count < 3; count++) {
    const next = api.normalizeClientOrder(first.order);
    assert.equal(next.changed, false);
    assert.deepEqual(plain(next.order), plain(first.order));
  }
});

test('legacy excess payment on a discounted position funds the remaining position', () => {
  const api = environment(), value = order();
  pay(api, value, 100, [0]);
  const receipt = plain(value.payments);
  value.items[0].discountPct = 20;
  value.items[0].discountAmount = 20;
  api.recalcOrderFinancials(value);
  assert.deepEqual(value.items.map(item => item.paidAmount), [80, 20]);
  assert.deepEqual([value.total, value.paid, value.debt], [180, 100, 80]);
  assert.deepEqual(plain(value.payments), receipt);
  invariant(api, value);
});

test('cancelling a discount reopens debt without changing the paid ledger', () => {
  const api = environment(), value = order();
  value.items[0].discountPct = 10;
  value.items[0].discountAmount = 10;
  pay(api, value, 90, [0]);
  const receipt = plain(value.payments);
  api.applyOrderDiscountToItems(value, [0], 0);
  assert.deepEqual([value.total, value.paid, value.debt], [200, 90, 110]);
  assert.deepEqual(plain(value.payments), receipt);
  invariant(api, value);
});

test('removing a paid position refunds only paid money and reconciles released credit', () => {
  const api = environment(), value = order();
  pay(api, value, 100, [0]);
  const receipt = plain(value.payments);
  api.getOrderHistory = () => value;
  api.removeItemContext = { orderId: value.id, index: 0 };
  api.element('removeItemReason').value = 'Не подошла';
  api.element('removeItemRefund').value = '50';
  api.confirmRemoveItem();
  assert.deepEqual([value.total, value.paid, value.debt, value.overpayment], [100, 50, 50, 0]);
  assert.equal(value.items[1].paidAmount, 50);
  assert.equal(value.items[0].refundAmount, 50);
  assert.deepEqual(plain(value.payments), receipt);
  invariant(api, value);
});

test('removing a discounted position does not give its rounding discount to other goods', () => {
  const api = environment(), value = order([100, 100, 100]);
  value.roundingAdjustment = 30;
  api.recalcOrderFinancials(value);
  assert.deepEqual(value.items.map(item => item.roundingAllocation), [10, 10, 10]);
  pay(api, value, 270);
  api.getOrderHistory = () => value;
  api.removeItemContext = { orderId: value.id, index: 0 };
  api.element('removeItemReason').value = 'Возврат';
  api.element('removeItemRefund').value = '10000';
  api.confirmRemoveItem();
  assert.deepEqual([value.items[0].refundAmount, value.roundingAdjustment, value.total, value.paid], [90, 20, 180, 180]);
  invariant(api, value);
});

test('refund edits append an adjustment and leave the original cash event intact', () => {
  const api = environment(), value = order();
  pay(api, value, 200);
  api.getOrderHistory = () => value;
  api.removeItemContext = { orderId: value.id, index: 0 };
  api.element('removeItemReason').value = 'Первый возврат';
  api.element('removeItemRefund').value = '100';
  api.confirmRemoveItem();
  const originalRefund = plain(value.items[0].refundLedger[0]);
  const originalEvent = plain(value.events.find(event => event.text === 'Возврат из кассы'));
  api.returnEditContext = { type: 'order', id: value.id, index: 0 };
  api.element('returnProductNumber').value = 'Позиция 0';
  api.element('returnReason').value = 'Исправление';
  api.element('returnAmount').value = '40';
  api.confirmReturn();
  assert.deepEqual(plain(value.items[0].refundLedger[0]), originalRefund);
  assert.deepEqual(plain(value.events.find(event => event.text === 'Возврат из кассы')), originalEvent);
  assert.deepEqual(plain(value.items[0].refundLedger.map(entry => entry.amount)), [100, -60]);
  assert.equal(value.items[0].refundAmount, 40);
  assert.deepEqual([value.paid, value.debt, value.overpayment], [160, 0, 60]);
  invariant(api, value);
});

test('refund caps respect real receipts even when legacy refundableAmount is excessive', () => {
  const api = environment(), value = order();
  pay(api, value, 100);
  value.items[0].removed = true;
  value.items[0].refundableAmount = 1000;
  value.items[1].refundAmount = 40;
  api.recalcOrderFinancials(value);
  assert.equal(api.getMaxItemRefund(value, value.items[0]), 60);
  invariant(api, value);
});

test('negative refund edits do not silently erase the existing refund', () => {
  const api = environment(), value = order();
  pay(api, value, 100);
  value.items[0].removed = true;
  value.items[0].refundableAmount = 100;
  value.items[0].refundAmount = 50;
  api.getOrderHistory = () => value;
  api.returnEditContext = { type: 'order', id: value.id, index: 0 };
  api.element('returnProductNumber').value = 'Позиция 0';
  api.element('returnReason').value = 'Опечатка';
  api.element('returnAmount').value = '-10';
  api.confirmReturn();
  assert.equal(value.items[0].refundAmount, 50);
  assert.equal(value.items[0].refundLedger, undefined);
});

test('legacy net-paid migration subtracts a refund only once and remains idempotent', () => {
  const api = environment(), value = order();
  delete value.payments;
  value.paid = 80;
  value.items[0].removed = true;
  value.items[0].refundAmount = 20;
  const first = api.normalizeClientOrder(value);
  assert.deepEqual([api.getOrderPaymentLedgerTotal(first.order), first.order.paid], [100, 80]);
  const second = api.normalizeClientOrder(first.order);
  assert.deepEqual(plain(second.order), plain(first.order));
  assert.equal(second.changed, false);
  invariant(api, second.order);
});

test('kopeck payments close debt exactly without floating point residue', () => {
  const api = environment(), value = order([0.1, 0.2]);
  pay(api, value, 0.1, [0]);
  pay(api, value, 0.2, [1]);
  assert.deepEqual([value.total, value.paid, value.debt, value.overpayment], [0.3, 0.3, 0, 0]);
  invariant(api, value);
});

test('card sale keeps a 100.50 ruble price and read-only total valid', () => {
  const api = environment();
  api.saleMethod = 'card';
  api.cartItems = [{ name: 'Деталь', price: 100.5, qty: 1, discount: 10 }];
  api.recalcProductSale(true);
  assert.equal(Number(api.saleFinalInput.value), 100.5);
  assert.equal(api.saleFinalInput.readOnly, true);
  assert.equal(api.saleRoundingAdjustment, 0);
  assert.equal(api.getCartTotals().afterDiscount, 100.5);
});

test('cash sale and percentage discounts round to kopecks without automatic whole-ruble rounding', () => {
  const api = environment();
  api.saleMethod = 'cash';
  api.saleDiscount.value = '5';
  api.cartItems = [{ name: 'Деталь', price: 100.5, qty: 1, discount: '' }];
  api.recalcProductSale(true);
  assert.equal(Number(api.saleFinalInput.value), 95.48);
  assert.equal(api.saleRoundingAdjustment, 0);
  assert.deepEqual(plain(api.getCartTotals()), { base: 100.5, discountSum: 5.02, afterDiscount: 95.48 });
});

test('unpaid and completed zero-price orders normalize without perpetual storage writes', () => {
  const api = environment();
  for (const value of [order(), order([0])]) {
    const first = api.normalizeClientOrder(value);
    const second = api.normalizeClientOrder(first.order);
    assert.equal(second.changed, false);
    assert.deepEqual(plain(second.order), plain(first.order));
    invariant(api, second.order);
  }
});

test('financial invariants survive mixed payments, discounts, refunds and repeated normalization', () => {
  const api = environment();
  let seed = 47219;
  const random = upper => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % upper; };
  for (let n = 0; n < 80; n++) {
    let value = order(Array.from({ length: 2 + random(4) }, () => (1 + random(30000)) / 100));
    value.roundingAdjustment = random(500) / 100;
    api.recalcOrderFinancials(value);
    for (let step = 0; step < 15; step++) {
      const index = random(value.items.length), item = value.items[index];
      if (step % 4 === 0 && !item.removed) {
        const rounding = api.getPaymentRoundingDiscount(value, 1, [index]);
        api.applyPaymentRoundingDiscount(value, rounding, [index]);
        pay(api, value, (1 + random(20000)) / 100, [index]);
      } else if (step % 4 === 1 && !item.removed && !item.discountLocked) {
        api.applyOrderDiscountToItems(value, [index], random(40));
      } else if (step % 4 === 2 && !item.removed) {
        const paid = api.getItemPaid(item);
        value.roundingAdjustment = (cents(value.roundingAdjustment) - cents(item.roundingAllocation)) / 100;
        item.removed = true;
        item.refundableAmount = paid;
        api.recordItemRefundChange(item, random(cents(paid) + 1) / 100);
        item.paidAmount = 0;
      }
      api.recalcOrderFinancials(value);
      invariant(api, value);
      const first = api.normalizeClientOrder(value), second = api.normalizeClientOrder(first.order);
      assert.deepEqual(plain(first.order), plain(second.order));
      assert.equal(second.changed, false);
      value = first.order;
    }
  }
});
