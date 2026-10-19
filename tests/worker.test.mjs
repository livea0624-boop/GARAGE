import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker from '../src/worker.js';

// The adapter executes the Worker's actual SQL against SQLite, with D1's
// asynchronous API and result envelope. No Cloudflare account or production DB.
class LocalD1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) {
    const statement = this.db.prepare(sql);
    let values = [];
    const api = {
      bind(...bindings) { values = bindings; return api; },
      async first() { return statement.get(...values) ?? null; },
      async all() { return { results: statement.all(...values) }; },
      async run() {
        if (/^\s*SELECT\b/i.test(sql)) return { results: statement.all(...values), meta: { changes: 0 } };
        const result = statement.run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      }
    };
    return api;
  }
}

const loginPassword = 'login-123456';
const actionPassword = 'action-654321';

async function fixture(t, { configure = true } = {}) {
  const db = new LocalD1();
  db.db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.db.close());
  const env = { GARAGE_DB: db, ASSETS: { fetch: async () => new Response('<html>GARAGE</html>', { headers: { 'content-type': 'text/html' } }) } };
  const call = async (path, { method = 'GET', body, login = loginPassword, action, headers = {} } = {}) => {
    const requestHeaders = { ...headers };
    if (login !== null) requestHeaders['x-garage-password'] = login;
    if (action !== undefined) requestHeaders['x-garage-action-password'] = action;
    if (body !== undefined) requestHeaders['content-type'] = 'application/json';
    const response = await worker.fetch(new Request(`https://garage.test${path}`, {
      method, headers: requestHeaders, ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    }), env);
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data, headers: response.headers };
  };
  if (configure) assert.equal((await call('/api/auth/setup', { method: 'POST', body: { loginPassword, actionPassword } })).status, 200);
  const get = () => call('/api/state');
  const put = (state, baseUpdatedAt, extra = {}) => call('/api/state', { method: 'PUT', body: { state, baseUpdatedAt, ...extra.body }, ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'body')) });
  const seed = async state => {
    const result = await put(state, null);
    assert.equal(result.status, 200);
    return result.data.updatedAt;
  };
  return { db, call, get, put, seed };
}

const snapshot = overrides => ({
  garageClients: JSON.stringify([{ id: 'c1', name: 'Клиент' }]),
  garageSellers: JSON.stringify(['Михаил', 'Владимир']),
  garageClientOrders: JSON.stringify([{ id: '1', total: 100 }]),
  garageCompletedOrders: '[]',
  garageOrderHistoryOverrides: '{}',
  garageWarehouseSales: JSON.stringify([{ id: 's1', total: 50 }]),
  garageReturns: JSON.stringify([{ id: 'r1', amount: 10 }]),
  garageClientCarts: JSON.stringify({ c1: [{ article: 'A' }] }),
  garageOrderSequence: '1',
  ...overrides
});

test('ordinary login cannot wipe shared data; an action password authorizes the same deletion', async t => {
  const { seed, put, get } = await fixture(t);
  const original = snapshot();
  const version = await seed(original);
  const refused = await put({}, version);
  assert.equal(refused.status, 403);
  assert.equal(refused.data.code, 'ACTION_PASSWORD_REQUIRED');
  assert.deepEqual((await get()).data.state, original);
  assert.equal((await put({}, version, { action: loginPassword })).status, 403);
  assert.equal((await put({}, version, { action: actionPassword, login: null })).status, 401);
  const accepted = await put({}, version, { action: actionPassword });
  assert.equal(accepted.status, 200);
  assert.deepEqual((await get()).data.state, {});
});

test('explicit replace always requires action authorization, including first initialization', async t => {
  const { put, get } = await fixture(t);
  assert.equal((await put(snapshot(), null, { body: { operation: 'replace' } })).status, 403);
  assert.deepEqual((await get()).data, { state: null, updatedAt: null });
  assert.equal((await put(snapshot(), null, { action: actionPassword, body: { operation: 'replace' } })).status, 200);
});

test('missing or invalid version cannot silently overwrite an existing snapshot', async t => {
  const { seed, call, put, get } = await fixture(t);
  const original = snapshot();
  const version = await seed(original);
  const missing = await call('/api/state', { method: 'PUT', body: { state: original } });
  assert.equal(missing.status, 428);
  assert.equal(missing.data.code, 'STATE_VERSION_REQUIRED');
  assert.equal((await put(original, 123)).status, 400);
  const stale = await put(original, 'old-version');
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data, { error: 'State changed on another device. Reload and merge before saving.', code: 'STATE_CONFLICT', state: original, updatedAt: version });
  assert.deepEqual((await get()).data.state, original);
});

test('two simultaneous writers cannot both overwrite the same existing version', async t => {
  const { seed, put, get } = await fixture(t);
  const base = snapshot();
  const version = await seed(base);
  const edits = [snapshot({ garageOrderSequence: '2' }), snapshot({ garageOrderSequence: '3' })];
  const results = await Promise.all(edits.map(state => put(state, version)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results.findIndex(result => result.status === 200);
  const latest = (await get()).data;
  assert.deepEqual(latest.state, edits[winner]);
  assert.equal(results[1 - winner].data.updatedAt, latest.updatedAt);
  assert.deepEqual(results[1 - winner].data.state, latest.state);
  assert.ok(Date.parse(latest.updatedAt) > Date.parse(version));
});

test('first initialization is atomic when two devices start with no state', async t => {
  const { put, get } = await fixture(t);
  const edits = [snapshot({ garageOrderSequence: '2' }), snapshot({ garageOrderSequence: '3' })];
  const results = await Promise.all(edits.map(state => put(state, null)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results.findIndex(result => result.status === 200);
  assert.deepEqual((await get()).data.state, edits[winner]);
});

test('same millisecond saves still receive different valid ISO version tokens', async t => {
  const { seed, put } = await fixture(t);
  const state = snapshot();
  const initial = await seed(state);
  let version = initial;
  for (let i = 0; i < 4; i++) {
    const result = await put(state, version);
    assert.equal(result.status, 200);
    assert.ok(Date.parse(result.data.updatedAt) > Date.parse(version));
    assert.equal(new Date(result.data.updatedAt).toISOString(), result.data.updatedAt);
    version = result.data.updatedAt;
  }
});

test('deletions are detected without trusting the operation field', async t => {
  const changes = [
    ['client', { garageClients: '[]' }],
    ['active order', { garageClientOrders: '[]' }],
    ['warehouse sale', { garageWarehouseSales: '[]' }],
    ['return', { garageReturns: '[]' }],
    ['seller', { garageSellers: '["Михаил"]' }],
    ['malformed client replacement', { garageClients: '{}' }]
  ];
  for (const [label, change] of changes) await t.test(label, async child => {
    const { seed, put } = await fixture(child);
    const version = await seed(snapshot());
    const result = await put(snapshot(change), version, { body: { operation: 'normal' } });
    assert.equal(result.status, 403);
    assert.equal(result.data.code, 'ACTION_PASSWORD_REQUIRED');
  });
});

test('removing a shared key is protected even if no known collection is removed', async t => {
  const { seed, put } = await fixture(t);
  const base = { garageExtraSetting: 'keep me' };
  const version = await seed(base);
  assert.equal((await put({}, version)).status, 403);
});

test('malformed JSON, wrong container types and changed ids cannot disguise list deletion', async t => {
  const cases = [
    ['garageClients', '{malformed'],
    ['garageClients', '{"fake":{"id":"c1"}}'],
    ['garageClients', '[{"id":"new-client"}]'],
    ['garageClientOrders', '{"fake":{"id":"1"}}'],
    ['garageClientOrders', '"not an array"'],
    ['garageWarehouseSales', '{"fake":{"id":"s1"}}'],
    ['garageReturns', 'null']
  ];
  for (const [key, value] of cases) await t.test(`${key}: ${value}`, async child => {
    const { seed, put, get } = await fixture(child);
    const original = snapshot();
    const version = await seed(original);
    assert.equal((await put({ ...original, [key]: value }, version)).status, 403);
    assert.deepEqual((await get()).data.state, original);
  });
  await t.test('history dictionary replaced with an array containing the same id', async child => {
    const { seed, put } = await fixture(child);
    const original = snapshot({ garageOrderHistoryOverrides: '{"legacy":{"id":"legacy"}}' });
    const version = await seed(original);
    assert.equal((await put({ ...original, garageOrderHistoryOverrides: '[{"id":"legacy"}]' }, version)).status, 403);
  });
});

test('archiving/restoring orders, removing redundant history and clearing a submitted cart need no extra password', async t => {
  const { seed, put } = await fixture(t);
  const base = snapshot({ garageOrderHistoryOverrides: '{"1":{"id":"1","total":100}}' });
  let version = await seed(base);
  const archived = snapshot({ garageClientOrders: '[]', garageCompletedOrders: '[{"id":"1","total":100}]' });
  delete archived.garageClientCarts;
  delete archived.garageOrderHistoryOverrides;
  const moved = await put(archived, version);
  assert.equal(moved.status, 200);
  version = moved.data.updatedAt;
  assert.equal((await put(snapshot(), version)).status, 200);
});

test('deleting archived or legacy orders is protected across the complete union', async t => {
  for (const key of ['garageCompletedOrders', 'garageOrderHistoryOverrides', 'garageArchivedOrders', 'garageOrderArchive', 'garageCompletedOrderOverrides']) {
    await t.test(key, async child => {
      const { seed, put } = await fixture(child);
      const value = key.includes('Overrides') ? '{"legacy":{"id":"legacy"}}' : '[{"id":"legacy"}]';
      const original = snapshot({ [key]: value });
      const version = await seed(original);
      const next = { ...original, [key]: key.includes('Overrides') ? '{}' : '[]' };
      assert.equal((await put(next, version)).status, 403);
    });
  }
});

test('ignored legacy containers cannot hide a live order; legacy dictionary data remains protected', async t => {
  for (const key of ['garageArchivedOrders', 'garageOrderArchive', 'garageCompletedOrderOverrides']) {
    await t.test(`live order moved to ${key}`, async child => {
      const { seed, put } = await fixture(child);
      const original = snapshot();
      const version = await seed(original);
      const value = key.includes('Overrides') ? '{"1":{"id":"1","total":100}}' : '[{"id":"1","total":100}]';
      assert.equal((await put({ ...original, garageClientOrders: '[]', [key]: value }, version)).status, 403);
    });
  }
  await t.test('legacy dictionary deletion', async child => {
    const { seed, put } = await fixture(child);
    const original = snapshot({ garageOrderArchive: '{"old":{"id":"old"}}' });
    const version = await seed(original);
    assert.equal((await put({ ...original, garageOrderArchive: '{}' }, version)).status, 403);
    assert.equal((await put({ ...original, garageOrderArchive: '{}', garageClientOrders: '[{"id":"1"},{"id":"old"}]' }, version)).status, 200);
  });
});

test('legacy D1 schema and timestamps work without migration; device preferences never enter shared state', async t => {
  const { db, get, put } = await fixture(t);
  const legacy = snapshot({ garageCurrentUser: 'Михаил', garageInterfaceMode: 'mobile',
    garageSitePassword: 'legacy-value', garageLoginPassword: 'legacy-value',
    garageActionPassword: 'legacy-value', GARAGE_API_PASSWORD: 'legacy-value' });
  const oldVersion = '2025-10-19T01:02:03.000Z';
  db.db.prepare('INSERT INTO app_state(id,state_json,updated_at) VALUES (1,?,?)').run(JSON.stringify(legacy), oldVersion);
  assert.deepEqual((await get()).data, { state: snapshot(), updatedAt: oldVersion });
  const result = await put({ ...snapshot(), garageCurrentUser: 'Владимир', garageInterfaceMode: 'desktop' }, oldVersion);
  assert.equal(result.status, 200);
  const stored = JSON.parse(db.db.prepare('SELECT state_json FROM app_state WHERE id=1').get().state_json);
  assert.deepEqual(stored, snapshot());
});

test('setup and either password change reject using the same login and action password', async t => {
  const { call } = await fixture(t, { configure: false });
  assert.equal((await call('/api/auth/setup', { method: 'POST', body: { loginPassword, actionPassword: loginPassword } })).status, 400);
  assert.deepEqual((await call('/api/auth/status')).data, { configured: false });
  assert.equal((await call('/api/auth/setup', { method: 'POST', body: { loginPassword, actionPassword } })).status, 200);
  assert.equal((await call('/api/auth/change', { method: 'POST', body: { currentPassword: loginPassword, password: actionPassword } })).status, 400);
  assert.equal((await call('/api/auth/change-action', { method: 'POST', body: { currentPassword: actionPassword, password: loginPassword } })).status, 400);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { password: loginPassword } })).status, 200);
});

test('static assets and API responses carry security headers without blocking inline scripts', async t => {
  const { call } = await fixture(t);
  for (const path of ['/', '/api/state']) {
    const result = await call(path);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(result.headers.get('x-frame-options'), 'DENY');
    assert.equal(result.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(result.headers.get('content-security-policy'), null);
  }
  const preflight = await call('/api/state', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-garage-action-password/);
});
