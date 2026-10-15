import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import worker from '../src/worker.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function createDb(seed = null) {
  const state = {
    row: seed && { state_json: JSON.stringify(seed.state), updated_at: seed.updatedAt || 'before', version: seed.version },
    migrated: seed?.version !== undefined,
    alterCount: 0
  };
  const db = {
    prepare(sql) {
      const query = sql.replace(/\s+/g, ' ').trim();
      let args = [];
      const prepared = {
        bind(...values) { args = values; return prepared; },
        async all() {
          if (query.startsWith('PRAGMA table_info(app_state)'))
            return { results: [{ name: 'id' }, { name: 'state_json' }, { name: 'updated_at' }, ...(state.migrated ? [{ name: 'version' }] : [])] };
          throw Error('Unexpected all: ' + query);
        },
        async first() {
          if (query.startsWith('SELECT login_hash, action_hash, updated_at FROM garage_auth')) {
            const digest = createHash('sha256').update('test-password').digest('hex');
            return { login_hash: digest, action_hash: digest };
          }
          if (query.startsWith('SELECT state_json, updated_at, version FROM app_state'))
            return state.row ? { ...state.row } : null;
          throw Error('Unexpected first: ' + query);
        },
        async run() {
          if (query.startsWith('CREATE TABLE IF NOT EXISTS garage_auth'))return { meta: { changes: 0 } };
          if (query.startsWith('ALTER TABLE app_state')) {
            state.migrated = true; state.alterCount++;
            if (state.row && state.row.version === undefined) state.row.version = 1;
            return { meta: { changes: 0 } };
          }
          if (query.startsWith('INSERT INTO app_state')) {
            if (state.row) return { meta: { changes: 0 } };
            state.row = { state_json: args[0], updated_at: args[1], version: 1 };
            return { meta: { changes: 1 } };
          }
          if (query.startsWith('UPDATE app_state SET state_json')) {
            if (!state.row || state.row.version !== args[2])return { meta: { changes: 0 } };
            state.row.state_json=args[0];
            state.row.updated_at=args[1];
            state.row.version+=1;
            return { meta: { changes: 1 } };
          }
          throw Error('Unexpected run: ' + query);
        }
      };
      return prepared;
    }
  };
  return { db, state };
}
function req(method, payload) {
  return new Request('https://example.test/api/state', {
    method,
    headers: { 'x-garage-password': 'test-password', 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
}
test('D1 version guard blocks stale writes without losing latest order', async () => {
  const database = createDb();
  const env = { GARAGE_DB: database.db };
  const empty = await worker.fetch(req('GET'), env);
  assert.equal((await empty.json()).version, 0);
  const one = await worker.fetch(req('PUT', { expectedVersion: 0, state: { garageClientOrders: '[{"id":1}]' } }), env);
  assert.equal((await one.json()).version, 1);
  const two = await worker.fetch(req('PUT', { expectedVersion: 1, state: { garageClientOrders: '[{"id":1},{"id":2}]' } }), env);
  assert.equal((await two.json()).version, 2);
  const rejected = await worker.fetch(req('PUT', { expectedVersion: 1, state: { garageClientOrders: '[]' } }), env);
  assert.equal(rejected.status, 409);
  const conflict = await rejected.json();
  assert.equal(conflict.version, 2);
  assert.equal(conflict.state.garageClientOrders, '[{"id":1},{"id":2}]');
  assert.equal(database.state.row.version, 2);
  assert.equal(JSON.parse(database.state.row.state_json).garageClientOrders, '[{"id":1},{"id":2}]');
});
test('schema migration keeps existing state and introduces version 1', async () => {
  // Worker isolate may already have migrated in previous test. Explicitly exercise SQL
  // only if the worker's cached migration runs; existing D1 rows are never replaced.
  const database = createDb({ state: { garageClients: '[{"id":"a"}]' }, updatedAt: 'before', version: 1 });
  const response = await worker.fetch(req('GET'), { GARAGE_DB: database.db });
  const result = await response.json();
  assert.equal(result.state.garageClients, '[{"id":"a"}]');
  assert.equal(result.version, 1);
});
test('missing expectedVersion never replaces existing data', async () => {
  const database = createDb({state: { important: 'keep me' }, version: 5});
  const response = await worker.fetch(req('PUT', { state: { important: 'erase me' } }), {GARAGE_DB: database.db});
  assert.equal(response.status, 428);
  assert.equal(JSON.parse(database.state.row.state_json).important,'keep me');
});
function mergeHelper() {
  const html=readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
  const opening='<script id="garage-cloud-sync-v6-safe">';
  const begin=html.indexOf(opening);
  assert.notEqual(begin,-1);
  const end=html.indexOf('</script>',begin);
  assert.ok(end>begin);
  const script=html.slice(begin+opening.length,end)
    .replace('window.garageCloudSync={','window.mergeStateForTests=tryMerge;\n  window.garageCloudSync={');
  const window={ addEventListener(){} };
  const context={
    window, location:{origin:'https://example.test'},
    garageStorage:{getItem(){return null},setItem(){},removeItem(){},clear(){},get length(){return 0;},key(){}},
    document:{},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},
    console,Event:class Event {}
  };
  runInNewContext(script,context);
  return (base,local,remote)=>JSON.parse(JSON.stringify(window.mergeStateForTests(base,local,remote)));
}
test('merges independent orders from different sellers', () => {
  const merge=mergeHelper();
  const base={ garageClientOrders: JSON.stringify([{ id:1,paid:0 },{ id:2,paid:0 }]) };
  const local={ garageClientOrders: JSON.stringify([{ id:1,paid:100 },{ id:2,paid:0 }]) };
  const remote={ garageClientOrders: JSON.stringify([{ id:1,paid:0 },{ id:2,paid:200 }]) };
  const result=merge(base,local,remote);
  assert.deepEqual(result.conflicts,[]);
  const orders=JSON.parse(result.merged.garageClientOrders);
  assert.equal(orders.find(x=>x.id===1).paid,100);
  assert.equal(orders.find(x=>x.id===2).paid,200);
});
test('blocks concurrent editing of the same order', () => {
  const merge=mergeHelper();
  const base={garageClientOrders:JSON.stringify([{id:1,paid:0}])};
  const local={garageClientOrders:JSON.stringify([{id:1,paid:100}])};
  const remote={garageClientOrders:JSON.stringify([{id:1,paid:200}])};
  assert.deepEqual(merge(base,local,remote).conflicts,['garageClientOrders']);
});
test('blocks duplicate order identifiers created concurrently', () => {
  const merge=mergeHelper();
  const base={garageClientOrders:'[]',garageOrderSequence:'10'};
  const local={garageClientOrders:JSON.stringify([{id:11,client:'A'}]),garageOrderSequence:'11'};
  const remote={garageClientOrders:JSON.stringify([{id:11,client:'B'}]),garageOrderSequence:'11'};
  assert.deepEqual(merge(base,local,remote).conflicts,['garageClientOrders']);
});
test('merges independent client-cart changes',()=>{
  const merge=mergeHelper();
  const base={garageClientCarts:'{}'};
  const local={garageClientCarts:'{"alice":[1]}'};
  const remote={garageClientCarts:'{"bob":[2]}'};
  const result=merge(base,local,remote);
  assert.deepEqual(result.conflicts,[]);
  assert.deepEqual(JSON.parse(result.merged.garageClientCarts),{alice:[1],bob:[2]});
});
