const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/backup.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const applyStart = appSource.indexOf('async function applyGarageBackup(');
const applyEnd = appSource.indexOf("\ndocument.getElementById('exportGarageBackup')", applyStart);
const clone = value => JSON.parse(JSON.stringify(value));
const pack = data => ({ format: 'garage-local-backup-v2', data });
const sampleState = () => ({
  garageClients: JSON.stringify([{ id: 'c_test-1', name: 'Клиент', phone: '123', cars: [], tags: [] }]),
  garageSellers: JSON.stringify(['Продавец']),
  garageSellerColor_1: '#5b8def',
  garageClientCarts: JSON.stringify({ 'c_test-1': { items: [{ name: 'Деталь', price: 100, qty: 1, discount: '', arrivalDate: '' }], discount: 'manual', manualDiscount: '5', saleMethod: 'cash', final: 95 } }),
  garageClientOrders: JSON.stringify([{ id: 1, client: 'Клиент', items: [{ name: 'Деталь', qty: 1, price: 100 }], payments: [{ id: 'p_2026-10-19T00:00:00.000Z_x', amount: 25, paymentMethod: 'card' }], events: [{ date: '19.10.2026', text: 'Оплата', amount: '25 ₽' }] }])
});

function storage(initial = {}) {
  const data = { ...initial };
  return {
    get length() { return Object.keys(data).length; },
    key(i) { return Object.keys(data)[i] ?? null; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    all() { return { ...data }; }
  };
}
function browser() {
  const data = sampleState(), garageStorage = storage(data), localStorage = storage();
  const calls = [], notices = [];
  const context = {
    garageStorage, localStorage,
    location: { reload() { calls.push('reload'); } },
    confirm() { return false; },
    toast(...args) { notices.push(args); },
    garageRequestActionPassword: async () => { calls.push('password'); return 'action-test-password'; },
    garageCloudSync: {
      save: async () => { calls.push('save'); },
      replace: async (next, options) => {
        calls.push('replace'); assert.equal(options.actionPassword, 'action-test-password');
        for (const key of Object.keys(garageStorage.all())) garageStorage.removeItem(key);
        for (const [key, value] of Object.entries(next)) garageStorage.setItem(key, value);
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'backup.js' });
  vm.runInContext(appSource.slice(applyStart, applyEnd), context, { filename: 'app-backup.js' });
  return { context, api: context.GarageBackup, garageStorage, localStorage, calls, notices, before: data };
}

test('valid nested backup round-trips with manual cart discount and timestamp payment ID', () => {
  const { api } = browser();
  const data = sampleState();
  assert.deepEqual(clone(api.validate(pack(data))), data);
  assert.deepEqual(clone(api.validate({ format: 'garage-local-backup-v1', data })), data);
});

test('financial backup round-trips signed cent reconciliation and immutable refund corrections', () => {
  const { api } = browser(), data = sampleState();
  const orders = JSON.parse(data.garageClientOrders);
  orders[0].roundingAllocationVersion = 1;
  orders[0].items[0].legacyLineRounding = -0.01;
  orders[0].items[0].refundLedger = [
    { id: 'legacy_refund', amount: 100, createdAt: '2026-10-19T00:00:00Z', seller: 'Продавец', paymentMethod: 'cash' },
    { id: 'r_123_abc', amount: -60, date: '19.10.2026', time: '10:30', createdAt: '2026-10-19T10:30:00Z', seller: 'Продавец', reason: 'Исправление возврата', paymentMethod: 'cash' }
  ];
  data.garageClientOrders = JSON.stringify(orders);
  assert.deepEqual(clone(api.validate(pack(data))), data);
  orders[0].items[0].legacyLineRounding = 0.01;
  data.garageClientOrders = JSON.stringify(orders);
  assert.deepEqual(clone(api.validate(pack(data))), data);
});

test('reject malformed refund ledger entries without banning negative corrections', () => {
  const { api } = browser();
  for (const ledger of [{}, [null], [{ id: 'r_1', amount: {} }], [{ id: 'r_1', amount: -0.001 }], [{ id: 'r_1', amount: -10, seller: {} }], [{ id: '<bad>', amount: 10 }], [{ id: 'r_1', amount: -10 }, { id: 'r_1', amount: 10 }]]) {
    const data = sampleState(), orders = JSON.parse(data.garageClientOrders);
    orders[0].items[0].refundLedger = ledger;
    data.garageClientOrders = JSON.stringify(orders);
    assert.throws(() => api.validate(pack(data)), /Некорректные данные/);
  }
});

test('reject malformed financial allocation versions and signed rounding values', () => {
  const { api } = browser();
  for (const change of [{ roundingAllocationVersion: {} }, { roundingAllocationVersion: 2 }, { roundingAllocationVersion: '1' }, { legacyLineRounding: {} }, { legacyLineRounding: '' }, { legacyLineRounding: -0.001 }]) {
    const data = sampleState(), orders = JSON.parse(data.garageClientOrders);
    if ('roundingAllocationVersion' in change) orders[0].roundingAllocationVersion = change.roundingAllocationVersion;
    else orders[0].items[0].legacyLineRounding = change.legacyLineRounding;
    data.garageClientOrders = JSON.stringify(orders);
    assert.throws(() => api.validate(pack(data)), /Некорректные данные/);
  }
});

test('export and rollback exclude passwords, browser preferences, and internal drafts', () => {
  const { api, garageStorage, localStorage } = browser();
  for (const key of ['garageSitePassword', 'garageLoginPassword', 'garageActionPassword', 'GARAGE_API_PASSWORD']) garageStorage.setItem(key, 'secret-do-not-export');
  garageStorage.setItem('garageCurrentUser', 'Other seller');
  garageStorage.setItem('garageInterfaceMode', 'mobile');
  garageStorage.setItem('garageDraft:v1:test', 'internal draft');
  const backup = api.createRollback(garageStorage);
  assert.deepEqual(clone(backup.data), sampleState());
  const serialized = localStorage.getItem(api.rollbackKey);
  assert.ok(serialized);
  assert.equal(serialized.includes('secret-do-not-export'), false);
  assert.equal(serialized.includes('garageCurrentUser'), false);
  assert.deepEqual(JSON.parse(serialized).data, sampleState());
});

test('import strips legacy credentials and device preferences', () => {
  const { api } = browser();
  const data = { ...sampleState(), garageCurrentUser: 'Other seller', garageInterfaceMode: 'mobile', garageSitePassword: 'old-secret', garageLoginPassword: 'old-login', GARAGE_API_PASSWORD: 'old-token' };
  assert.deepEqual(clone(api.validate(pack(data))), sampleState());
});

test('previous-copy download is available only for a readable copy and strips legacy secrets', () => {
  const { api, localStorage } = browser();
  assert.equal(api.previous(), null);
  localStorage.setItem(api.rollbackKey, 'broken-json');
  assert.equal(api.previous(), null);
  localStorage.setItem(api.rollbackKey, JSON.stringify(pack([])));
  assert.equal(api.previous(), null);
  const data = { ...sampleState(), garageSitePassword: 'secret', garageCurrentUser: 'Other seller', garageInterfaceMode: 'mobile', garageAnything: 'secret' };
  localStorage.setItem(api.rollbackKey, JSON.stringify({ ...pack(data), createdAt: '2026-10-19T00:00:00Z' }));
  const previous = clone(api.previous());
  assert.deepEqual(previous.data, sampleState());
  assert.equal(previous.createdAt, '2026-10-19T00:00:00Z');
  assert.equal(JSON.stringify(previous).includes('secret'), false);
});

test('reject malformed state containers, unknown keys, and non-string stored values', () => {
  const { api } = browser();
  for (const payload of [null, [], pack([]), pack({ garageClients: [] }), pack({ garageAnything: '[]' }), pack({ garageClients: '{}' }), pack({ garageClients: '[null]' }), pack({ garageClients: '[1]' })]) {
    assert.throws(() => api.validate(payload), /копии|копию/);
  }
});

test('reject malformed clients, items, payments, events, carts, colors and identifiers', () => {
  const { api } = browser();
  const badChanges = [
    { garageClients: JSON.stringify([{ id: 'x', name: 'A', tags: {} }]) },
    { garageClients: JSON.stringify([{ id: 'x', name: 'A', cars: [null] }]) },
    { garageClients: JSON.stringify([{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }]) },
    { garageClients: JSON.stringify([{ id: '\"><img src=x>', name: 'A' }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: {} }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [null] }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [], payments: [null] }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [], payments: [{ amount: -1 }] }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [], payments: [{ amount: '' }] }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [], payments: [{ amount: {} }] }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [], events: [{ date: {} }] }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [], events: [{ amount: {} }] }]) },
    { garageClientOrders: JSON.stringify([{ id: 1, items: [], notificationAttempts: [{ seller: {} }] }]) },
    { garageClientCarts: '[]' },
    { garageClientCarts: JSON.stringify({ x: { items: [false] } }) },
    { garageClientCarts: JSON.stringify({ x: { items: [], discount: {} } }) },
    { garageSellerColor_1: '#123456;display:none' },
    { garageSellers: '["A",null]' },
    { garageOrderSequence: '1.2' }
  ];
  for (const change of badChanges) assert.throws(() => api.validate(pack({ ...sampleState(), ...change })), /Некорректные данные/);
});

test('reject dangerous prototype keys even when nested inside encoded JSON', () => {
  const { api } = browser();
  assert.throws(() => api.validate(pack({ ...sampleState(), garageClients: '[{"id":"x","name":"A","__proto__":{"polluted":true}}]' })), /__proto__/);
  assert.throws(() => api.validate(JSON.parse('{"format":"garage-local-backup-v2","data":{"__proto__":"x"}}')), /__proto__/);
});

test('empty and settings-only copies require separate explicit approval', () => {
  const { api } = browser();
  for (const data of [{}, { garageClients: '[]' }, { garageSellers: '["A"]', garageClientCarts: '{}' }]) {
    assert.throws(() => api.validate(pack(data)), error => error.code === 'EMPTY_BACKUP');
    assert.deepEqual(clone(api.validate(pack(data), { allowEmpty: true })), data);
  }
});

test('invalid import never saves, requests a password or changes storage', async () => {
  const b = browser();
  assert.equal(await b.context.applyGarageBackup(pack({ garageClients: '{}' })), false);
  assert.deepEqual(b.garageStorage.all(), b.before);
  assert.deepEqual(b.calls, []);
  assert.equal(b.notices.length, 1);
});

test('failed pending save prevents replacement and keeps the current state', async () => {
  const b = browser();
  b.context.garageCloudSync.save = async () => { throw new Error('Offline'); };
  assert.equal(await b.context.applyGarageBackup(pack(sampleState())), false);
  assert.deepEqual(b.garageStorage.all(), b.before);
  assert.deepEqual(b.calls, []);
  assert.equal(b.localStorage.getItem(b.api.rollbackKey), null);
});

test('server conflict preserves current state, durable rollback and the current screen', async () => {
  const b = browser();
  b.context.garageCloudSync.replace = async () => { b.calls.push('replace'); throw new Error('STATE_CONFLICT'); };
  const payload = pack({ garageClients: '[{"id":"import","name":"Новый"}]' });
  assert.equal(await b.context.applyGarageBackup(payload), false);
  assert.deepEqual(b.garageStorage.all(), b.before);
  assert.deepEqual(b.calls, ['save', 'password', 'replace']);
  assert.deepEqual(JSON.parse(b.localStorage.getItem(b.api.rollbackKey)).data, b.before);
});

test('quota failure aborts before cloud replacement', async () => {
  const b = browser();
  b.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(await b.context.applyGarageBackup(pack(sampleState())), false);
  assert.deepEqual(b.garageStorage.all(), b.before);
  assert.deepEqual(b.calls, ['save', 'password']);
});

test('successful import saves a rollback before replacing and reloads only after confirmation', async () => {
  const b = browser();
  const next = { garageClients: '[{"id":"import","name":"Новый"}]' };
  const replace = b.context.garageCloudSync.replace;
  b.context.garageCloudSync.replace = async (...args) => {
    assert.deepEqual(JSON.parse(b.localStorage.getItem(b.api.rollbackKey)).data, b.before);
    await replace(...args);
  };
  assert.equal(await b.context.applyGarageBackup(pack(next)), true);
  assert.deepEqual(b.garageStorage.all(), next);
  assert.deepEqual(b.calls, ['save', 'password', 'replace', 'reload']);
});

test('canceling the action password or empty-copy warning leaves current data intact', async () => {
  const b = browser();
  b.context.garageRequestActionPassword = async () => false;
  assert.equal(await b.context.applyGarageBackup(pack(sampleState())), false);
  assert.deepEqual(b.garageStorage.all(), b.before);
  assert.equal(b.localStorage.getItem(b.api.rollbackKey), null);
  b.calls.length = 0;
  assert.equal(await b.context.applyGarageBackup(pack({})), false);
  assert.deepEqual(b.calls, []);
  assert.deepEqual(b.garageStorage.all(), b.before);
});

test('clear authorization cannot be bypassed by a forged dataset flag or rapid clicks', async () => {
  let handler, finishPassword, prompts = 0, actions = 0, authorization;
  const waiting = new Promise(resolve => { finishPassword = resolve; });
  const context = {
    document: { addEventListener(name, fn) { assert.equal(name, 'click'); handler = fn; } },
    garageRequestActionPassword: async () => { prompts++; return waiting; },
    garageCloudSync: { authorizeAction(password) { authorization = password; } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/action-guard.js'), 'utf8'), context);
  const button = { id: 'confirmClearOrdersSales', dataset: { actionVerified: '1' } };
  const event = () => ({ target: { closest: () => button }, blocked: false, preventDefault() { this.blocked = true; }, stopImmediatePropagation() {} });
  button.click = () => { const e = event(); handler(e); if (!e.blocked) actions++; };
  const first = handler(event());
  await handler(event());
  assert.equal(prompts, 1);
  assert.equal(actions, 0);
  finishPassword('volatile-action-password');
  await first;
  assert.equal(actions, 1);
  assert.equal(authorization, 'volatile-action-password');
  assert.deepEqual(button.dataset, { actionVerified: '1' });
});
