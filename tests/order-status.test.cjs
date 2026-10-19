const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

function loadFunction(name, dependencies = {}) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing ' + name);
  const end = source.indexOf('\nfunction ', start + 1);
  assert.notEqual(end, -1, 'Missing function boundary after ' + name);
  return vm.runInNewContext(source.slice(start, end) + '\n' + name, dependencies);
}
const status = item => item.status;
const qty = item => item.qty;
const received = item => Math.max(0, Math.min(item.qty, Number(item.receivedQty) || 0));
const issued = item => Math.max(0, Math.min(received(item), Number(item.issuedQty) || 0));
const onStock = item => received(item) - issued(item);
const expected = item => item.qty - received(item);
const item = (status, qty = 1, receivedQty = 0, issuedQty = 0) => ({status, qty, receivedQty, issuedQty});

const reconcileOrderItemCounts = loadFunction('reconcileOrderItemCounts');
const getOrderAggregateStatus = loadFunction('getOrderAggregateStatus', {
  getItemQty: qty,
  getItemExpectedQty: expected,
  getItemOnStockQty: onStock,
  getItemIssuedQty: issued,
  getOrderItemStatus: status,
  normalizeOrderStatuses: () => {}
});

test('manual return from stock to transit resets stale fully received counts', () => {
  const returned = item('transit', 3, 3);
  assert.equal(reconcileOrderItemCounts(returned), true);
  assert.equal(returned.receivedQty, 0);
  assert.equal(returned.issuedQty, 0);
  assert.equal(getOrderAggregateStatus({items: [returned]}).value, 'transit');
});

test('partial arrivals while in transit remain counted', () => {
  const partial = item('transit', 3, 1);
  assert.equal(reconcileOrderItemCounts(partial), false);
  assert.equal(partial.receivedQty, 1);
  assert.equal(getOrderAggregateStatus({items: [partial]}).value, 'transit');
});

test('stock, notified, taken statuses repair stale counters without altering selection', () => {
  for (const [selection, countReceived, countIssued] of [
    ['stock', 3, 0], ['notified', 3, 0], ['taken', 3, 3]
  ]) {
    const part = item(selection, 3, 0, 0);
    reconcileOrderItemCounts(part);
    assert.deepEqual([part.status,part.receivedQty,part.issuedQty], [selection,countReceived,countIssued]);
  }
});

test('mixed stocked and in-transit items never report whole order as stocked', () => {
  const order = {items: [item('stock', 1, 1), item('transit', 1)]};
  assert.equal(getOrderAggregateStatus(order).value, 'transit');
});

test('all received items retain their existing aggregate statuses', () => {
  assert.equal(getOrderAggregateStatus({items:[item('stock',2,2),item('stock',1,1)]}).value, 'stock');
  assert.equal(getOrderAggregateStatus({items:[item('notified',1,1),item('notified',1,1)]}).value, 'notified');
  assert.equal(getOrderAggregateStatus({items:[item('taken',1,1,1)]}).value, 'taken');
});

test('removed items do not block a ready order', () => {
  assert.equal(getOrderAggregateStatus({items:[item('stock',1,1),{...item('transit',1),removed:true}]}).value, 'stock');
});

test('home notifications require every nonremoved item fully on stock', () => {
  let orders = [];
  const getOrdersNeedingNotification = loadFunction('getOrdersNeedingNotification', {
    getArchivedOrderIds: () => new Set(),
    getActiveClientOrders: () => orders,
    getOrderItemStatus: status,
    getItemExpectedQty: expected,
    getItemIssuedQty: issued
  });
  orders = [{id:'1',items:[item('stock',1,1),item('transit',1)]}];
  assert.equal(getOrdersNeedingNotification().length,0);
  orders = [{id:'2',items:[item('stock',2,1)]}];
  assert.equal(getOrdersNeedingNotification().length,0);
  orders = [{id:'3',items:[item('stock',2,2),item('stock',1,1)]}];
  assert.equal(getOrdersNeedingNotification().length,1);
  orders = [{id:'4',items:[item('stock',1,1),{...item('transit'),removed:true}]}];
  assert.equal(getOrdersNeedingNotification().length,1);
});
