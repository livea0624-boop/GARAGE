const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const sources = ['storage.js', 'merge.js', 'sync.js'].map(file => ({
  file, source: fs.readFileSync(path.join(__dirname, '..', 'public', 'js', file), 'utf8')
}));
const clone = value => JSON.parse(JSON.stringify(value));
const pack = clients => ({ garageClients: JSON.stringify(clients) });
const records = state => Object.fromEntries(JSON.parse(state.garageClients).map(record => [record.id, record]));
const baseClients = () => [{ id: 'a', name: 'Первый' }, { id: 'b', name: 'Второй' }];

function fakeStorage() {
  const storage = {};
  Object.defineProperties(storage, {
    length: { get() { return Object.keys(this).length; } },
    key: { value(index) { return Object.keys(this)[index] ?? null; } },
    getItem: { value(key) { return Object.prototype.hasOwnProperty.call(this, String(key)) ? this[String(key)] : null; } },
    setItem: { value(key, value) {
      Object.defineProperty(this, String(key), { value: String(value), writable: true, enumerable: true, configurable: true });
    } },
    removeItem: { value(key) { delete this[String(key)]; } },
    clear: { value() { for (const key of Object.keys(this)) delete this[key]; } }
  });
  return storage;
}

function element(tagName) {
  return {
    tagName, children: [], style: {}, dataset: {}, parentNode: null,
    setAttribute(name, value) { this[name] = String(value); },
    append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } },
    prepend(node) { node.parentNode = this; this.children.unshift(node); },
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fakeServer(initialState = pack(baseClients())) {
  let state = clone(initialState), sequence = 1, updatedAt = initialState === null ? null : 'version-1';
  const controls = [], requests = [];
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => clone(body) });
  return {
    requests,
    get state() { return clone(state); },
    setState(next) { state = clone(next); updatedAt = 'version-' + (++sequence); },
    holdNext(method) {
      const gate = deferred(); controls.push({ method, gate }); return gate;
    },
    holdNextPutResponse() {
      const committed = deferred(), reply = deferred();
      controls.push({ method: 'PUT', committed, reply });
      return { committed: committed.promise, reply };
    },
    failNext(method, failure = new TypeError('Network unavailable')) { controls.push({ method, failure }); },
    async fetch(url, options) {
      assert.equal(new URL(url).origin, 'https://garage.test.invalid');
      assert.equal(new URL(url).pathname, '/api/state');
      const request = { method: options.method, headers: clone(options.headers), body: options.body ? JSON.parse(options.body) : null };
      requests.push(request);
      // Capture a GET response before the artificial network delay, reproducing
      // an old snapshot arriving after the user makes a new local edit.
      const observed = { state: clone(state), updatedAt };
      const index = controls.findIndex(control => control.method === options.method);
      let control;
      if (index !== -1) {
        [control] = controls.splice(index, 1);
        if (control.failure) throw control.failure;
        if (control.gate) await control.gate.promise;
      }
      if (options.method === 'GET') { request.status = 200; return response(200, observed); }
      assert.equal(options.method, 'PUT');
      if (request.body.baseUpdatedAt !== updatedAt) {
        request.status = 409;
        return response(409, { code: 'STATE_CONFLICT', error: 'State changed', state, updatedAt });
      }
      state = clone(request.body.state); updatedAt = 'version-' + (++sequence);
      request.status = 200;
      if (control?.reply) {
        control.committed.resolve();
        await control.reply.promise;
      }
      return response(200, { ok: true, updatedAt });
    }
  };
}

function browser(server, { localStorage = fakeStorage(), sessionStorage = fakeStorage() } = {}) {
  const body = element('body'), main = element('main'); body.append(main);
  const listeners = new Map(), documentListeners = new Map(), timers = new Map();
  let timerId = 0;
  const listen = (map, name, callback) => { if (!map.has(name)) map.set(name, []); map.get(name).push(callback); };
  const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean);
  const document = {
    body, visibilityState: 'visible', createElement: element,
    getElementById: id => find(body, id) || null,
    querySelector: selector => selector === 'main' ? main : null,
    addEventListener: (name, callback) => listen(documentListeners, name, callback)
  };
  const context = {
    localStorage, sessionStorage, document, crypto: webcrypto, Event,
    location: { origin: 'https://garage.test.invalid' },
    console: { warn() {}, error() {} },
    fetch: server.fetch.bind(server),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return 0; }, clearInterval() {},
    addEventListener: (name, callback) => listen(listeners, name, callback),
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); return true; }
  };
  context.window = context;
  vm.createContext(context);
  for (const { file, source } of sources) vm.runInContext(source, context, { filename: file });
  return {
    context, document, localStorage, sessionStorage, timers,
    sync: context.garageCloudSync, storage: context.garageStorage,
    async start() { await context.garageCloudSync.start('test-login-only'); },
    editClients(clients) { context.garageStorage.setItem('garageClients', JSON.stringify(clients)); },
    get clients() { return records({ garageClients: context.garageStorage.getItem('garageClients') }); },
    drafts() { return Object.keys(localStorage).filter(key => key.startsWith('garageDraft:v1:')).map(key => JSON.parse(localStorage.getItem(key))); }
  };
}

test('an edit made during PUT drains to a second PUT, including concurrent save callers', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  app.editClients([{ id: 'a', name: 'Первая правка' }, baseClients()[1]]);
  const hold = server.holdNext('PUT');
  const firstSave = app.sync.save();
  assert.equal(server.requests.filter(request => request.method === 'PUT').length, 1);
  app.editClients([{ id: 'a', name: 'Первая правка' }, { id: 'b', name: 'Правка во время запроса' }]);
  const secondSave = app.sync.save();
  hold.resolve(); await Promise.all([firstSave, secondSave]);
  assert.equal(server.requests.filter(request => request.method === 'PUT').length, 2);
  assert.deepEqual(records(server.state), app.clients);
  assert.equal(records(server.state).b.name, 'Правка во время запроса');
  assert.equal(app.sync.getStatus().dirty, false);
  assert.equal(app.drafts().length, 0);
});

test('reverting while a PUT response is pending survives unloading and reloading after the old value commits', async () => {
  const server = fakeServer(), oldTab = browser(server); await oldTab.start();
  oldTab.editClients([{ id: 'a', name: 'Промежуточная правка' }, baseClients()[1]]);
  const held = server.holdNextPutResponse();
  // This old page never receives its reply, like a page destroyed during reload.
  // No real timers or requests remain; only an intentionally unresolved promise.
  void oldTab.sync.save();
  await held.committed;
  oldTab.editClients(baseClients());
  assert.equal(records(server.state).a.name, 'Промежуточная правка');
  assert.equal(oldTab.clients.a.name, 'Первый');
  assert.equal(oldTab.sync.getStatus().dirty, true, 'a revert still needs saving while a different PUT is outstanding');
  assert.equal(oldTab.drafts().length, 1);
  const reloaded = browser(server, { localStorage: oldTab.localStorage, sessionStorage: oldTab.sessionStorage });
  await reloaded.start();
  assert.equal(reloaded.clients.a.name, 'Первый', 'the committed intermediate value must not erase the user’s revert');
  assert.equal(reloaded.sync.getStatus().conflict, false);
  assert.equal(reloaded.sync.getStatus().dirty, true);
  await reloaded.sync.save();
  assert.deepEqual(records(server.state), records(pack(baseClients())));
  assert.equal(reloaded.sync.getStatus().dirty, false);
  assert.equal(reloaded.drafts().length, 0);
});

test('an ambiguous successful PUT followed by a lost reply reconciles before retry and preserves a revert', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  app.editClients([{ id: 'a', name: 'Запрос успел сохраниться' }, baseClients()[1]]);
  const held = server.holdNextPutResponse();
  const saving = app.sync.save();
  const rejected = assert.rejects(saving, /Response lost after commit/);
  await held.committed;
  app.editClients(baseClients());
  held.reply.reject(new TypeError('Response lost after commit'));
  await rejected;
  assert.equal(records(server.state).a.name, 'Запрос успел сохраниться');
  assert.equal(app.clients.a.name, 'Первый');
  assert.equal(app.sync.getStatus().dirty, true);
  const requestsBeforeRetry = server.requests.length;
  await app.sync.save();
  assert.equal(server.requests[requestsBeforeRetry].method, 'GET', 'read the possibly committed state before retrying');
  assert.deepEqual(records(server.state), records(pack(baseClients())));
  assert.equal(app.sync.getStatus().conflict, false);
  assert.equal(app.sync.getStatus().dirty, false);
  assert.equal(app.drafts().length, 0);
});

test('a new tab can recover a revert when the closed tab’s preceding PUT already committed', async () => {
  const server = fakeServer(), closedTab = browser(server); await closedTab.start();
  closedTab.editClients([{ id: 'a', name: 'Уже записанная промежуточная версия' }, baseClients()[1]]);
  const held = server.holdNextPutResponse();
  void closedTab.sync.save();
  await held.committed;
  closedTab.editClients(baseClients());
  const newTab = browser(server, { localStorage: closedTab.localStorage }); await newTab.start();
  assert.equal(newTab.clients.a.name, 'Уже записанная промежуточная версия');
  const recovery = newTab.document.getElementById('garageDraftRecovery');
  assert.ok(recovery);
  await recovery.children.find(child => child.tagName === 'button').onclick();
  assert.equal(newTab.clients.a.name, 'Первый');
  assert.equal(records(server.state).a.name, 'Первый');
  assert.equal(newTab.sync.getStatus().conflict, false);
  assert.equal(newTab.sync.getStatus().dirty, false);
  assert.equal(newTab.drafts().length, 0);
});

test('a delayed poll cannot overwrite an edit; saving then merges independent remote changes', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  server.setState(pack([baseClients()[0], { id: 'b', name: 'Другое устройство' }]));
  const hold = server.holdNext('GET');
  const polling = app.sync.poll();
  app.editClients([{ id: 'a', name: 'Правка после начала GET' }, baseClients()[1]]);
  hold.resolve(); await polling;
  assert.equal(app.clients.a.name, 'Правка после начала GET');
  assert.equal(app.sync.getStatus().dirty, true);
  await app.sync.save();
  assert.equal(records(server.state).a.name, 'Правка после начала GET');
  assert.equal(records(server.state).b.name, 'Другое устройство');
  assert.deepEqual(records(server.state), app.clients);
});

test('network failures reject save and a durable draft survives reload and saves after reconnect', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  app.editClients([{ id: 'a', name: 'Не потерять при перезагрузке' }, baseClients()[1]]);
  server.failNext('PUT');
  await assert.rejects(app.sync.save(), /Network unavailable/);
  assert.equal(records(server.state).a.name, 'Первый');
  assert.equal(app.sync.getStatus().dirty, true);
  assert.equal(app.sync.getStatus().durable, true);
  assert.equal(JSON.parse(app.drafts()[0].state.garageClients)[0].name, 'Не потерять при перезагрузке');
  const reloaded = browser(server, { localStorage: app.localStorage, sessionStorage: app.sessionStorage });
  await reloaded.start();
  assert.equal(reloaded.clients.a.name, 'Не потерять при перезагрузке');
  assert.equal(reloaded.sync.getStatus().dirty, true);
  await reloaded.sync.save();
  assert.deepEqual(records(server.state), reloaded.clients);
  assert.equal(reloaded.drafts().length, 0);
});

test('two employees editing different records merge on 409 and retain both changes', async () => {
  const server = fakeServer(), first = browser(server), second = browser(server);
  await first.start(); await second.start();
  first.editClients([{ id: 'a', name: 'Первый сотрудник' }, baseClients()[1]]);
  second.editClients([baseClients()[0], { id: 'b', name: 'Второй сотрудник' }]);
  await first.sync.save(); await second.sync.save();
  assert.equal(server.requests.filter(request => request.status === 409).length, 1);
  assert.equal(records(server.state).a.name, 'Первый сотрудник');
  assert.equal(records(server.state).b.name, 'Второй сотрудник');
  assert.equal(second.sync.getStatus().conflict, false);
  assert.equal(second.sync.getStatus().dirty, false);
});

test('concurrent edits of the same record require a choice and retain the unsent local draft', async () => {
  const server = fakeServer(), first = browser(server), second = browser(server);
  await first.start(); await second.start();
  first.editClients([{ id: 'a', name: 'Облачная версия' }, baseClients()[1]]);
  second.editClients([{ id: 'a', name: 'Несохранённая версия' }, baseClients()[1]]);
  await first.sync.save();
  await assert.rejects(second.sync.save(), error => error.code === 'STATE_CONFLICT');
  assert.equal(records(server.state).a.name, 'Облачная версия');
  assert.equal(second.clients.a.name, 'Несохранённая версия');
  assert.equal(second.sync.getStatus().conflict, true);
  assert.equal(second.sync.getStatus().dirty, true);
  assert.equal(JSON.parse(second.drafts()[0].state.garageClients)[0].name, 'Несохранённая версия');
  const putCount = server.requests.filter(request => request.method === 'PUT').length;
  await assert.rejects(second.sync.save(), error => error.code === 'STATE_CONFLICT');
  await second.sync.poll();
  assert.equal(server.requests.filter(request => request.method === 'PUT').length, putCount);
});

test('reverting an edit during an outstanding conflict keeps the recovery draft and conflict controls available', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  app.editClients([{ id: 'a', name: 'Локальное изменение' }, baseClients()[1]]);
  server.setState(pack([{ id: 'a', name: 'Облачное изменение' }, baseClients()[1]]));
  await assert.rejects(app.sync.save(), error => error.code === 'STATE_CONFLICT');
  app.editClients(baseClients());
  assert.equal(app.sync.getStatus().conflict, true);
  assert.equal(app.sync.getStatus().dirty, true);
  assert.equal(app.drafts().length, 1);
  const status = app.document.getElementById('garageSyncStatus');
  assert.ok(status.children.some(child => child.tagName === 'button' && child.textContent === 'Разобрать изменения'));
  await app.sync.resolveConflicts('remote');
  assert.equal(app.clients.a.name, 'Облачное изменение');
  assert.equal(app.sync.getStatus().conflict, false);
  assert.equal(app.sync.getStatus().dirty, false);
  assert.equal(app.drafts().length, 0);
});

for (const choice of ['local', 'remote']) {
  test(`${choice} conflict choice preserves independent local and remote additions and creates a recovery copy`, async () => {
    const server = fakeServer(), app = browser(server); await app.start();
    app.editClients([{ id: 'a', name: 'Локальная спорная версия' }, baseClients()[1], { id: 'local-addition', name: 'Локальное добавление' }]);
    server.setState(pack([{ id: 'a', name: 'Облачная спорная версия' }, baseClients()[1], { id: 'remote-addition', name: 'Облачное добавление' }]));
    await assert.rejects(app.sync.save(), error => error.code === 'STATE_CONFLICT');
    await app.sync.resolveConflicts(choice);
    const saved = records(server.state);
    assert.equal(saved.a.name, choice === 'local' ? 'Локальная спорная версия' : 'Облачная спорная версия');
    assert.equal(saved['local-addition'].name, 'Локальное добавление');
    assert.equal(saved['remote-addition'].name, 'Облачное добавление');
    assert.deepEqual(saved, app.clients);
    assert.equal(app.sync.getStatus().conflict, false);
    assert.equal(app.sync.getStatus().dirty, false);
    const recoveryKeys = Object.keys(app.localStorage).filter(key => key.startsWith('garageRecovery:'));
    assert.equal(recoveryKeys.length, 1);
    const recovery = JSON.parse(app.localStorage.getItem(recoveryKeys[0]));
    assert.equal(records(recovery.data).a.name, 'Локальная спорная версия');
    assert.equal(records(recovery.data)['local-addition'].name, 'Локальное добавление');
    assert.equal(app.drafts().length, 0);
  });

  test(`${choice} resolution of a recovered draft uses its original baseline`, async () => {
    const server = fakeServer(), app = browser(server); await app.start();
    app.editClients([{ id: 'a', name: 'До перезагрузки' }, baseClients()[1], { id: 'local-addition', name: 'Локальная запись' }]);
    server.failNext('PUT');
    await assert.rejects(app.sync.save(), /Network unavailable/);
    server.setState(pack([{ id: 'a', name: 'После изменения в облаке' }, baseClients()[1], { id: 'remote-addition', name: 'Облачная запись' }]));
    const reloaded = browser(server, { localStorage: app.localStorage, sessionStorage: app.sessionStorage });
    await reloaded.start();
    assert.equal(reloaded.sync.getStatus().conflict, true);
    await reloaded.sync.resolveConflicts(choice);
    const saved = records(server.state);
    assert.equal(saved.a.name, choice === 'local' ? 'До перезагрузки' : 'После изменения в облаке');
    assert.equal(saved['local-addition'].name, 'Локальная запись');
    assert.equal(saved['remote-addition'].name, 'Облачная запись');
    assert.deepEqual(saved, reloaded.clients);
    assert.equal(reloaded.sync.getStatus().conflict, false);
    assert.equal(reloaded.sync.getStatus().dirty, false);
  });
}

test('a draft recovered from another tab preserves both devices’ independent edits when choosing the cloud conflict', async () => {
  const server = fakeServer(), closedTab = browser(server); await closedTab.start();
  closedTab.editClients([{ id: 'a', name: 'Спорная запись из закрытой вкладки' }, baseClients()[1], { id: 'local-addition', name: 'Добавлено в закрытой вкладке' }]);
  server.failNext('PUT');
  await assert.rejects(closedTab.sync.save(), /Network unavailable/);
  server.setState(pack([{ id: 'a', name: 'Версия другого сотрудника' }, baseClients()[1], { id: 'remote-addition', name: 'Добавлено в облаке' }]));
  const newTab = browser(server, { localStorage: closedTab.localStorage }); await newTab.start();
  const offered = newTab.document.getElementById('garageDraftRecovery');
  assert.ok(offered, 'a separate tab offers recovery instead of overwriting the existing draft');
  const restore = offered.children.find(child => child.tagName === 'button');
  await restore.onclick();
  assert.equal(newTab.sync.getStatus().conflict, true);
  assert.equal(newTab.clients.a.name, 'Спорная запись из закрытой вкладки');
  await newTab.sync.resolveConflicts('remote');
  const saved = records(server.state);
  assert.equal(saved.a.name, 'Версия другого сотрудника');
  assert.equal(saved['local-addition'].name, 'Добавлено в закрытой вкладке');
  assert.equal(saved['remote-addition'].name, 'Добавлено в облаке');
  assert.equal(newTab.drafts().length, 0, 'the recovered copy is removed only after saving');
});

test('a failed backup replacement rejects and leaves current UI data and cloud unchanged', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  const before = clone(app.clients);
  server.failNext('PUT', new TypeError('Import connection lost'));
  await assert.rejects(app.sync.replace(pack([{ id: 'imported', name: 'Из копии' }]), {
    actionPassword: 'test-action-only'
  }), /Import connection lost/);
  assert.deepEqual(app.clients, before);
  assert.deepEqual(records(server.state), before);
  assert.equal(app.sync.getStatus().dirty, false);
  app.editClients([{ id: 'a', name: 'Можно продолжать работу' }, baseClients()[1]]);
  await app.sync.save();
  assert.equal(records(server.state).a.name, 'Можно продолжать работу');
});

test('backup replacement persists defaults added by rendering before reporting success', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  app.context.renderSellers = () => {
    if (!app.storage.getItem('garageSellers')) app.storage.setItem('garageSellers', JSON.stringify(['Михаил', 'Владимир']));
  };
  await app.sync.replace(pack([{ id: 'imported', name: 'Из старой копии без списка продавцов' }]), {
    actionPassword: 'test-import-action-only'
  });
  const writes = server.requests.filter(request => request.method === 'PUT');
  assert.equal(writes.length, 2, 'the successful replacement is followed by one normalized-state save');
  assert.equal(writes[0].body.operation, 'replace');
  assert.equal(Object.hasOwn(writes[0].body.state, 'garageSellers'), false);
  assert.deepEqual(JSON.parse(writes[1].body.state.garageSellers), ['Михаил', 'Владимир']);
  assert.deepEqual(JSON.parse(server.state.garageSellers), ['Михаил', 'Владимир']);
  assert.equal(records(server.state).imported.name, 'Из старой копии без списка продавцов');
  assert.equal(app.sync.getStatus().dirty, false);
  assert.equal(app.sync.getStatus().conflict, false);
  assert.equal(app.drafts().length, 0);
});

test('selected employee and interface mode remain device-local across saving, polling and reload', async () => {
  const server = fakeServer(), app = browser(server);
  app.storage.setItem('garageCurrentUser', 'Михаил');
  app.storage.setItem('garageInterfaceMode', 'mobile');
  await app.start();
  app.editClients([{ id: 'a', name: 'Общая запись' }, baseClients()[1]]);
  await app.sync.save();
  const sent = server.requests.find(request => request.method === 'PUT').body.state;
  assert.equal(Object.hasOwn(sent, 'garageCurrentUser'), false);
  assert.equal(Object.hasOwn(sent, 'garageInterfaceMode'), false);
  server.setState({ ...server.state, garageCurrentUser: 'Другой сотрудник', garageInterfaceMode: 'desktop' });
  await app.sync.poll();
  assert.equal(app.storage.getItem('garageCurrentUser'), 'Михаил');
  assert.equal(app.storage.getItem('garageInterfaceMode'), 'mobile');
  const reloaded = browser(server, { localStorage: app.localStorage, sessionStorage: app.sessionStorage });
  await reloaded.start();
  assert.equal(reloaded.storage.getItem('garageCurrentUser'), 'Михаил');
  assert.equal(reloaded.storage.getItem('garageInterfaceMode'), 'mobile');
});

test('drafts and device storage never persist login or action credentials', async () => {
  const server = fakeServer(), app = browser(server); await app.start();
  app.editClients([{ id: 'a', name: 'Черновик' }, baseClients()[1]]);
  app.sync.authorizeAction('test-action-not-for-storage');
  server.failNext('PUT');
  await assert.rejects(app.sync.save(), /Network unavailable/);
  assert.equal(server.requests.find(request => request.method === 'PUT').headers['x-garage-action-password'], 'test-action-not-for-storage');
  const persisted = JSON.stringify({ local: app.localStorage, session: app.sessionStorage });
  assert.equal(persisted.includes('test-login-only'), false);
  assert.equal(persisted.includes('test-action-not-for-storage'), false);
  const draft = app.drafts()[0];
  assert.deepEqual(Object.keys(draft).sort(), ['baseState', 'editedAt', 'inFlightState', 'state', 'updatedAt']);
  assert.deepEqual(Object.keys(draft.state), ['garageClients']);
});

test('legacy credential keys loaded from the cloud are excluded from storage, uploads and failed-save journals', async () => {
  const legacy = {
    garageSitePassword: 'legacy-site-test-only', garageLoginPassword: 'legacy-login-test-only',
    garageActionPassword: 'legacy-action-test-only', GARAGE_API_PASSWORD: 'legacy-api-test-only'
  };
  const server = fakeServer({ ...pack(baseClients()), ...legacy }), app = browser(server); await app.start();
  for (const key of Object.keys(legacy)) assert.equal(app.storage.getItem(key), null);
  app.editClients([{ id: 'a', name: 'Новый черновик' }, baseClients()[1]]);
  server.failNext('PUT');
  await assert.rejects(app.sync.save(), /Network unavailable/);
  const sent = server.requests.find(request => request.method === 'PUT').body.state;
  const persisted = JSON.stringify({ local: app.localStorage, session: app.sessionStorage });
  for (const [key, value] of Object.entries(legacy)) {
    assert.equal(Object.hasOwn(sent, key), false);
    assert.equal(persisted.includes(key), false);
    assert.equal(persisted.includes(value), false);
  }
  const draft = app.drafts()[0];
  for (const part of ['baseState', 'state', 'inFlightState']) assert.deepEqual(Object.keys(draft[part]), ['garageClients']);
  assert.equal(app.sync.getStatus().dirty, true);
  assert.equal(app.sync.getStatus().durable, true);
});
