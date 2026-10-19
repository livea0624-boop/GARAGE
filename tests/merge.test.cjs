const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSnapshots } = require('../public/js/merge.js');

const pack = (key, value) => ({ [key]: JSON.stringify(value) });
const unpack = (result, key) => JSON.parse(result.state[key]);
const byId = records => Object.fromEntries(records.map(record => [String(record.id), record]));
const order = (id, extra = {}) => ({ id: String(id), client: 'Клиент', total: 100, ...extra });
const orders = (active, completed = [], history = {}) => ({
  ...pack('garageClientOrders', active),
  ...pack('garageCompletedOrders', completed),
  ...pack('garageOrderHistoryOverrides', history)
});

test('independent additions and edits preserve both employees’ client changes', () => {
  const a = { id: 'a', name: 'Первый' }, b = { id: 'b', name: 'Второй' };
  const base = pack('garageClients', [a, b]);
  const local = pack('garageClients', [{ ...a, phone: '123' }, b, { id: 'local', name: 'Локальный' }]);
  const remote = pack('garageClients', [a, { ...b, car: 'Автомобиль' }, { id: 'remote', name: 'Удалённый' }]);
  const result = mergeSnapshots(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(byId(unpack(result, 'garageClients')), {
    a: { ...a, phone: '123' }, b: { ...b, car: 'Автомобиль' },
    local: { id: 'local', name: 'Локальный' }, remote: { id: 'remote', name: 'Удалённый' }
  });
  assert.deepEqual(JSON.parse(base.garageClients), [a, b], 'inputs remain unchanged');
});

test('same entity edits report a conflict and select the requested complete version', () => {
  const base = pack('garageClients', [{ id: 'a', name: 'Было' }]);
  const local = pack('garageClients', [{ id: 'a', name: 'Здесь' }]);
  const remote = pack('garageClients', [{ id: 'a', name: 'На другом устройстве' }]);
  for (const preference of ['local', 'remote']) {
    const result = mergeSnapshots(base, local, remote, preference);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].key, 'garageClients');
    assert.equal(result.conflicts[0].id, 'a');
    assert.deepEqual(unpack(result, 'garageClients'), JSON.parse((preference === 'remote' ? remote : local).garageClients));
  }
});

test('a deletion and an independent edit merge; deletion versus editing the same entity requires a choice', () => {
  const a = { id: 'a', value: 1 }, b = { id: 'b', value: 2 };
  const base = pack('garageReturns', [a, b]);
  const local = pack('garageReturns', [b]);
  const independent = mergeSnapshots(base, local, pack('garageReturns', [a, { ...b, value: 3 }]));
  assert.equal(independent.conflicts.length, 0);
  assert.deepEqual(unpack(independent, 'garageReturns'), [{ ...b, value: 3 }]);
  const edited = pack('garageReturns', [{ ...a, value: 5 }, b]);
  const keepDelete = mergeSnapshots(base, local, edited, 'local');
  assert.equal(keepDelete.conflicts.length, 1);
  assert.equal(keepDelete.conflicts[0].local, null);
  assert.deepEqual(unpack(keepDelete, 'garageReturns'), [b]);
  assert.deepEqual(unpack(mergeSnapshots(base, local, edited, 'remote'), 'garageReturns'), [{ ...a, value: 5 }, b]);
});

test('new arrays with a missing base merge instead of dropping either first-device addition', () => {
  const local = pack('garageClients', [{ id: 'local' }]);
  const remote = pack('garageClients', [{ id: 'remote' }]);
  const result = mergeSnapshots({}, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(byId(unpack(result, 'garageClients')), { local: { id: 'local' }, remote: { id: 'remote' } });
  assert.deepEqual(unpack(mergeSnapshots({}, pack('garageClients', []), remote), 'garageClients'), [{ id: 'remote' }]);
  assert.deepEqual(unpack(mergeSnapshots({}, pack('garageClients', []), pack('garageClients', [])), 'garageClients'), []);
});

test('simultaneous additions with the same id are conflicts, while identical additions agree', () => {
  const local = pack('garageClients', [{ id: 'collision', name: 'Один' }]);
  const remote = pack('garageClients', [{ id: 'collision', name: 'Другой' }]);
  const conflict = mergeSnapshots({}, local, remote);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.conflicts[0].id, 'collision');
  assert.equal(mergeSnapshots({}, local, local).conflicts.length, 0);
});

test('serialized dictionaries and string lists preserve independent changes', () => {
  const base = { ...pack('garageClientCarts', { a: ['A'], b: ['B'] }), ...pack('garageSellers', ['Михаил']) };
  const local = { ...pack('garageClientCarts', { a: ['A', 'AA'], b: ['B'] }), ...pack('garageSellers', ['Михаил', 'Анна']) };
  const remote = { ...pack('garageClientCarts', { a: ['A'], b: ['BB'] }), ...pack('garageSellers', ['Михаил', 'Владимир']) };
  const result = mergeSnapshots(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(unpack(result, 'garageClientCarts'), { a: ['A', 'AA'], b: ['BB'] });
  assert.deepEqual(new Set(unpack(result, 'garageSellers')), new Set(['Михаил', 'Анна', 'Владимир']));
});

test('plain storage strings, JSON strings and scalar values remain serialized strings', () => {
  const base = { sellerColor: '#fff', garageSequence: '1', jsonString: '"old"' };
  const local = { ...base, garageSequence: '2', jsonString: '"new"' };
  const remote = { ...base, sellerColor: '#000' };
  const result = mergeSnapshots(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.state)), { sellerColor: '#000', garageSequence: '2', jsonString: '"new"' });
  for (const value of Object.values(result.state)) assert.equal(typeof value, 'string');
});

test('whole-key deletion versus editing is explicit, with no accidental null snapshot value', () => {
  const base = { sharedValue: 'before' };
  const result = mergeSnapshots(base, {}, { sharedValue: 'remote' });
  assert.equal(result.conflicts.length, 1);
  assert.equal(Object.hasOwn(result.state, 'sharedValue'), false);
  assert.equal(mergeSnapshots(base, {}, { sharedValue: 'remote' }, 'remote').state.sharedValue, 'remote');
});

test('prototype-looking keys and entity ids survive without modifying object prototypes', () => {
  const base = JSON.parse('{"__proto__":"old","constructor":"base"}');
  const local = JSON.parse('{"__proto__":"local","constructor":"base"}');
  const remote = JSON.parse('{"__proto__":"old","constructor":"remote"}');
  Object.assign(base, pack('garageClientCarts', JSON.parse('{"__proto__":["old"],"constructor":["old"]}')));
  Object.assign(local, pack('garageClientCarts', JSON.parse('{"__proto__":["local"],"constructor":["old"]}')));
  Object.assign(remote, pack('garageClientCarts', JSON.parse('{"__proto__":["old"],"constructor":["remote"]}')));
  const result = mergeSnapshots(base, local, remote);
  assert.equal(Object.getPrototypeOf(result.state), null);
  assert.equal(result.state.__proto__, 'local');
  assert.equal(result.state.constructor, 'remote');
  assert.deepEqual(unpack(result, 'garageClientCarts'), JSON.parse('{"__proto__":["local"],"constructor":["remote"]}'));
  const ids = mergeSnapshots({}, pack('garageClients', [{ id: '__proto__' }]), pack('garageClients', [{ id: 'constructor' }]));
  assert.deepEqual(new Set(unpack(ids, 'garageClients').map(entity => entity.id)), new Set(['__proto__', 'constructor']));
  assert.equal({}.polluted, undefined);
});

test('device seller selection and interface preference are excluded for either conflict selector', () => {
  const state = { garageCurrentUser: 'Михаил', garageInterfaceMode: 'mobile', shared: 'base' };
  for (const preference of ['local', 'remote']) {
    const result = mergeSnapshots(state, { ...state, shared: 'local' }, { ...state, garageCurrentUser: 'Владимир', shared: 'remote' }, preference);
    assert.equal(Object.hasOwn(result.state, 'garageCurrentUser'), false);
    assert.equal(Object.hasOwn(result.state, 'garageInterfaceMode'), false);
    assert.equal(result.state.shared, preference);
    assert.equal(result.conflicts.length, 1);
  }
});

test('duplicate entity ids and non-entity arrays use a conservative conflict instead of discarding data', () => {
  const duplicate = mergeSnapshots(pack('garageClients', []), pack('garageClients', [{ id: 'x', n: 1 }, { id: 'x', n: 2 }]), pack('garageClients', [{ id: 'y' }]));
  assert.equal(duplicate.conflicts.length, 1);
  assert.equal(unpack(duplicate, 'garageClients').length, 2);
  const positional = mergeSnapshots(pack('other', [1]), pack('other', [1, 2]), pack('other', [1, 3]));
  assert.equal(positional.conflicts.length, 1);
  assert.deepEqual(unpack(positional, 'other'), [1, 2]);
});

test('archiving versus editing the same order resolves its record and location together', () => {
  const original = order(1);
  const base = orders([original]);
  const local = orders([], [{ ...original, completedAt: '2026-10-19T10:00:00Z' }]);
  const remote = orders([{ ...original, total: 150 }]);
  for (const preference of ['local', 'remote']) {
    const result = mergeSnapshots(base, local, remote, preference);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].id, '1');
    assert.equal(result.conflicts[0].key, 'garageOrders');
    assert.deepEqual(unpack(result, 'garageClientOrders'), preference === 'remote' ? [{ ...original, total: 150 }] : []);
    assert.deepEqual(unpack(result, 'garageCompletedOrders'), preference === 'local' ? [{ ...original, completedAt: '2026-10-19T10:00:00Z' }] : []);
    assert.deepEqual(unpack(result, 'garageOrderHistoryOverrides'), {});
  }
});

test('archiving and editing different orders merge independently without duplicating either id', () => {
  const a = order(1), b = order(2);
  const result = mergeSnapshots(orders([a, b]), orders([b], [a]), orders([a, { ...b, total: 200 }]));
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(unpack(result, 'garageClientOrders'), [{ ...b, total: 200 }]);
  assert.deepEqual(unpack(result, 'garageCompletedOrders'), [a]);
});

test('moving an order between history and active conflicts with a concurrent deletion as one order', () => {
  const original = order(1);
  const base = orders([], [], { 1: original });
  const local = orders([original]);
  const remote = orders([]);
  const chooseDeletion = mergeSnapshots(base, local, remote, 'remote');
  assert.equal(chooseDeletion.conflicts.length, 1);
  assert.deepEqual(unpack(chooseDeletion, 'garageClientOrders'), []);
  assert.deepEqual(unpack(chooseDeletion, 'garageOrderHistoryOverrides'), {});
  assert.deepEqual(unpack(mergeSnapshots(base, local, remote, 'local'), 'garageClientOrders'), [original]);
});

test('legacy duplicate order copies retain archive precedence and cannot resurrect a stale active copy', () => {
  const original = order(1), completed = { ...original, total: 200 };
  const legacy = orders([original], [completed], { 1: original });
  const result = mergeSnapshots(legacy, legacy, legacy);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(unpack(result, 'garageCompletedOrders'), [completed]);
  assert.deepEqual(unpack(result, 'garageClientOrders'), []);
  assert.deepEqual(unpack(result, 'garageOrderHistoryOverrides'), {});
});

test('new empty order arrays work with absent base and do not introduce unrelated keys', () => {
  const result = mergeSnapshots({}, pack('garageClientOrders', []), pack('garageClientOrders', [order(1)]));
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(unpack(result, 'garageClientOrders'), [order(1)]);
  assert.deepEqual(Object.keys(result.state), ['garageClientOrders']);
  assert.deepEqual(Object.keys(mergeSnapshots({}, {}, {}).state), []);
});

test('legacy archive dictionaries do not disable safe current-order conflict resolution', () => {
  const original = order(1), legacy = order('old');
  const old = pack('garageOrderArchive', { old: legacy });
  const base = { ...orders([original]), ...old };
  const local = { ...orders([], [original]), ...old };
  const remote = { ...orders([{ ...original, total: 150 }]), ...old };
  const result = mergeSnapshots(base, local, remote, 'remote');
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(unpack(result, 'garageClientOrders'), [{ ...original, total: 150 }]);
  assert.deepEqual(unpack(result, 'garageCompletedOrders'), []);
  assert.deepEqual(unpack(result, 'garageOrderArchive'), { old: legacy });
});

test('malformed legacy order data falls back to a whole-group choice without duplicate resurrection', () => {
  const original = order(1);
  const malformed = { garageOrderArchive: '{invalid legacy JSON' };
  const base = { ...orders([original]), ...malformed };
  const local = { ...orders([], [original]), ...malformed };
  const remote = { ...orders([{ ...original, total: 150 }]), ...malformed };
  for (const preference of ['local', 'remote']) {
    const result = mergeSnapshots(base, local, remote, preference);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].key, 'garageOrders');
    assert.equal(result.state.garageOrderArchive, malformed.garageOrderArchive);
    assert.deepEqual(unpack(result, 'garageClientOrders'), preference === 'remote' ? [{ ...original, total: 150 }] : []);
    assert.deepEqual(unpack(result, 'garageCompletedOrders'), preference === 'local' ? [original] : []);
  }
});
