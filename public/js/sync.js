(function () {
  'use strict';
  const DEVICE_KEYS = window.garageDeviceKeys || new Set(['garageInterfaceMode', 'garageCurrentUser']);
  const CREDENTIAL_KEYS = window.garageCredentialKeys || new Set(['garageSitePassword', 'garageLoginPassword', 'garageActionPassword', 'GARAGE_API_PASSWORD']);
  const DRAFT_PREFIX = 'garageDraft:v1:';
  let tabId;
  try {
    tabId = sessionStorage.getItem('garageTabId') || crypto.randomUUID();
    sessionStorage.setItem('garageTabId', tabId);
  } catch { tabId = crypto.randomUUID(); }
  const draftKey = DRAFT_PREFIX + tabId;
  let ready = false, applying = false, dirty = false, revision = 0;
  let baseState = {}, version = null, inFlight = null, pollFlight = null, replacing = false;
  let timer = null, retryDelay = 1000, paused = false, conflict = null;
  let actionCredential = null, actionRequired = false, actionApprovalFlight = null, persistenceFailed = false;
  let sentState = null, uncertainState = null;
  const recoveredDrafts = new Map();

  const same = (a, b) => {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    return [...keys].every(k => a?.[k] === b?.[k]);
  };
  const shared = value => Object.fromEntries(Object.entries(value || {}).filter(([k, v]) =>
    k.startsWith('garage') && !DEVICE_KEYS.has(k) && !CREDENTIAL_KEYS.has(k) && typeof v === 'string'));
  function snapshot() {
    const state = Object.create(null);
    for (let i = 0; i < garageStorage.length; i++) {
      const key = garageStorage.key(i);
      if (key && !DEVICE_KEYS.has(key)) state[key] = garageStorage.getItem(key);
    }
    return shared(state);
  }
  function error(message, code) { return Object.assign(new Error(message), { code }); }
  async function api(path, method = 'GET', body = null, password = '', extraHeaders = {}) {
    const headers = { 'content-type': 'application/json', ...extraHeaders };
    if (password) headers['x-garage-password'] = password;
    const response = await fetch(location.origin + path, {
      method, headers, cache: 'no-store', body: body === null ? undefined : JSON.stringify(body)
    });
    let result = null;
    try { result = await response.json(); } catch { /* handled by status check */ }
    if (!response.ok) throw Object.assign(new Error(result?.error || ('HTTP ' + response.status)), {
      status: response.status, code: result?.code, response: result
    });
    return result;
  }

  function status(message, kind = 'pending') {
    let box = document.getElementById('garageSyncStatus');
    // Successful cloud sync is the normal state; do not keep a banner above the app.
    if (kind === 'saved') {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'garageSyncStatus'; box.role = 'status'; box.setAttribute('aria-live', 'polite');
      box.style.cssText = 'position:relative;z-index:6;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 16px;font-size:12px;background:#eef6ff;color:#234f7d;border-bottom:1px solid #d6e4f3';
      (document.querySelector('main') || document.body).prepend(box);
    }
    box.dataset.syncState = kind;
    box.replaceChildren();
    const text = document.createElement('span');
    text.textContent = message; box.append(text);
    if (dirty && kind !== 'saving') {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn'; button.style.padding = '4px 8px';
      button.textContent = conflict ? 'Разобрать изменения' : actionRequired ? 'Подтвердить сохранение' : 'Повторить сохранение';
      button.onclick = () => conflict ? showConflicts() : (actionRequired ? confirmSave() : save()).catch(report);
      box.append(button);
    }
  }
  function persistDraft() {
    try {
      if (dirty) localStorage.setItem(draftKey, JSON.stringify({
        baseState, state: snapshot(), updatedAt: version, editedAt: new Date().toISOString(),
        inFlightState: sentState || uncertainState
      }));
      else {
        localStorage.removeItem(draftKey);
        for (const [key, original] of recoveredDrafts) {
          if (localStorage.getItem(key) === original) localStorage.removeItem(key);
        }
        recoveredDrafts.clear();
      }
      persistenceFailed = false;
    } catch {
      persistenceFailed = true;
      status('Изменения пока только в этой вкладке: память устройства заполнена или недоступна. Не закрывайте страницу.', 'error');
    }
  }
  function readDraft(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft.state !== 'object' || !draft.baseState || Array.isArray(draft.state)) return null;
      return { ...draft, state: shared(draft.state), baseState: shared(draft.baseState), raw };
    } catch { return null; }
  }
  function backupRecovery(label, state) {
    try {
      localStorage.setItem('garageRecovery:' + Date.now() + ':' + tabId, JSON.stringify({
        label, createdAt: new Date().toISOString(), format: 'garage-local-backup-v2', data: state
      }));
    } catch {
      throw error('Не удалось создать копию перед разрешением конфликта. Освободите память устройства.', 'RECOVERY_UNAVAILABLE');
    }
  }
  function schedule(delay = 450) {
    clearTimeout(timer);
    if (paused || actionRequired || conflict || !ready || replacing) return;
    timer = setTimeout(() => { timer = null; return save().catch(report); }, delay);
  }
  function changed() {
    if (!ready || applying) return;
    revision++;
    // A revert still has to be sent if the earlier PUT may commit a different value.
    dirty = !!conflict || !!sentState || !!uncertainState || !same(snapshot(), baseState);
    persistDraft();
    if (dirty) {
      if (!persistenceFailed) status(conflict
        ? 'Одни и те же записи изменены на другом устройстве. Выберите версии.'
        : actionRequired ? 'Для сохранения этих изменений нужен пароль действий. Подтвердите сохранение.'
          : 'Изменения сохранены на устройстве, ожидается запись в облако.', conflict ? 'conflict' : actionRequired ? 'approval' : 'pending');
      schedule();
    } else {
      if (actionRequired) paused = false;
      actionRequired = false;
      status('Все изменения сохранены', 'saved');
    }
  }
  function refreshViews(eventName) {
    for (const render of [
      () => typeof renderHomeDashboard === 'function' && renderHomeDashboard(),
      () => typeof renderClients === 'function' && renderClients(document.getElementById('clientsSearch')?.value || ''),
      () => typeof renderOrders === 'function' && renderOrders(),
      () => typeof renderDeliveries === 'function' && renderDeliveries(),
      () => typeof renderSalesJournal === 'function' && renderSalesJournal(),
      () => typeof renderCompletedOrders === 'function' && renderCompletedOrders(),
      () => typeof renderSellers === 'function' && renderSellers()
    ]) {
      try { render(); } catch (e) { console.warn('GARAGE view refresh:', e); }
    }
    if (eventName) window.dispatchEvent(new Event(eventName));
  }
  function applyState(state, eventName) {
    const previous = applying; applying = true;
    try {
      garageStorage.clear();
      for (const [key, value] of Object.entries(shared(state))) garageStorage.setItem(key, value);
      refreshViews(eventName);
    } finally { applying = previous; }
  }
  function reconcile(remote, preference = 'local', allowConflicts = false, mergeBase = baseState) {
    const latest = shared(remote.state);
    const result = GarageMerge.mergeSnapshots(mergeBase, snapshot(), latest, preference);
    if (result.conflicts.length && !allowConflicts) {
      conflict = { baseState: mergeBase, remote: { state: latest, updatedAt: remote.updatedAt ?? null }, items: result.conflicts };
      dirty = true; persistDraft();
      status('Одни и те же записи изменены на другом устройстве. Ваши правки сохранены отдельно.', 'conflict');
      return false;
    }
    baseState = latest; version = remote.updatedAt ?? null;
    applyState(result.state, 'garage-cloud-updated');
    revision++; conflict = null; dirty = !same(snapshot(), baseState);
    if (!dirty && actionRequired) { actionRequired = false; paused = false; }
    persistDraft();
    return true;
  }
  function showConflicts() {
    if (!conflict) return;
    document.getElementById('garageSyncConflict')?.remove();
    const overlay = document.createElement('div'); overlay.className = 'overlay'; overlay.id = 'garageSyncConflict';
    const panel = document.createElement('div'); panel.className = 'modal';
    const head = document.createElement('div'); head.className = 'modal-head';
    const title = document.createElement('h2'); title.textContent = 'Изменения требуют выбора';
    const close = document.createElement('button'); close.className = 'close'; close.textContent = '×';
    close.setAttribute('aria-label', 'Закрыть'); close.onclick = () => overlay.remove();
    head.append(title, close);
    const body = document.createElement('div'); body.className = 'modal-body';
    const explanation = document.createElement('p');
    explanation.textContent = 'Эти записи изменились одновременно. Выберите версию спорных записей; независимые правки с обоих устройств сохранятся. Перед выбором будет сохранена локальная резервная копия.';
    body.append(explanation);
    for (const item of conflict.items.slice(0, 10)) {
      const details = document.createElement('details'); const summary = document.createElement('summary');
      summary.textContent = item.key + (item.id ? ' · ' + item.id : '');
      const pre = document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
      pre.textContent = 'Мои:\n' + JSON.stringify(item.local, null, 2) + '\nВ облаке:\n' + JSON.stringify(item.remote, null, 2);
      details.append(summary, pre); body.append(details);
    }
    const foot = document.createElement('div'); foot.className = 'modal-foot'; foot.style.flexWrap = 'wrap';
    for (const [choice, label] of [['local', 'Использовать мои спорные записи'], ['remote', 'Использовать облачные спорные записи']]) {
      const button = document.createElement('button'); button.className = 'btn'; button.textContent = label;
      button.onclick = async () => {
        button.disabled = true;
        try {
          await resolveConflicts(choice);
          overlay.remove();
        } catch (e) { report(e); button.disabled = false; }
      };
      foot.append(button);
    }
    panel.append(head, body, foot); overlay.append(panel); document.body.append(overlay);
  }
  async function resolveConflicts(choice) {
    if (!['local', 'remote'].includes(choice)) throw error('Неизвестный выбор версии', 'INVALID_CHOICE');
    if (!conflict) return save();
    backupRecovery('До разрешения конфликта', snapshot());
    reconcile(conflict.remote, choice, true, conflict.baseState || baseState);
    return save();
  }
  function authorizeAction(password) {
    actionCredential = password ? { password, expires: Date.now() + 30000 } : null;
    if (password) { actionRequired = false; paused = false; }
  }
  async function confirmSave() {
    if (actionApprovalFlight) return actionApprovalFlight;
    if (!actionRequired || !dirty) return save();
    // Authentication is only opened from the explicit status-button click.
    // Startup normalization, background saves and expired approvals must never
    // unexpectedly interrupt the user with an action-password dialog.
    actionApprovalFlight = (async () => {
      const password = await window.garageRequestActionPassword?.();
      if (!password) throw error('Пароль действий не введён', 'ACTION_CANCELLED');
      authorizeAction(password);
      return save();
    })();
    try { return await actionApprovalFlight; }
    finally { actionApprovalFlight = null; }
  }
  async function write(state, operation, actionPassword) {
    const credential = actionPassword || (actionCredential?.expires > Date.now() ? actionCredential.password : '');
    return api('/api/state', 'PUT', { state, baseUpdatedAt: version, ...(operation ? { operation } : {}) },
      window.garageLoginPassword, credential ? { 'x-garage-action-password': credential } : {});
  }
  function report(e) {
    if (e?.code === 'STATE_CONFLICT') return;
    if (e?.code === 'ACTION_PASSWORD_REQUIRED' || e?.code === 'ACTION_CANCELLED') {
      status('Для сохранения этих изменений нужен пароль действий. Правки сохранены на устройстве.', 'approval');
      return;
    }
    if (e?.status === 401) {
      paused = true;
      window.dispatchEvent(new Event('garage-auth-required'));
      status('Войдите снова, чтобы отправить сохранённые на устройстве изменения.', 'error');
      return;
    }
    status((e?.message || 'Нет связи с облаком') + '. Несохранённые правки остаются на устройстве.', 'error');
  }
  async function save(options = {}) {
    clearTimeout(timer); timer = null;
    if (options.actionPassword) authorizeAction(options.actionPassword);
    if (!ready) throw error('Сначала войдите в GARAGE', 'NOT_READY');
    if (replacing) throw error('Дождитесь завершения импорта', 'REPLACING');
    if (conflict) throw error('Разберите одновременные изменения', 'STATE_CONFLICT');
    if (actionRequired && actionCredential?.expires > Date.now()) actionRequired = false;
    if (actionRequired) throw error('Подтвердите сохранение паролем действий', 'ACTION_PASSWORD_REQUIRED');
    paused = false;
    if (inFlight) {
      await inFlight;
      return dirty ? save(options) : { updatedAt: version };
    }
    if (!dirty) return { updatedAt: version };
    inFlight = (async () => {
      let attempts = 0;
      if (uncertainState) {
        const remote = await api('/api/state', 'GET', null, window.garageLoginPassword);
        const mergeBase = same(shared(remote.state), uncertainState) ? uncertainState : baseState;
        uncertainState = null;
        if (!reconcile(remote, 'local', false, mergeBase)) throw error('Нужно выбрать версию спорных записей', 'STATE_CONFLICT');
      }
      while (dirty) {
        if (++attempts > 8) throw error('Слишком много одновременных изменений. Повторите сохранение.', 'BUSY');
        status('Сохранение в облако…', 'saving');
        const sent = snapshot(), sentRevision = revision;
        sentState = sent;
        persistDraft();
        let result;
        try { result = await write(sent); }
        catch (e) {
          sentState = null;
          if (e.status === 409 && e.response) {
            if (!reconcile(e.response)) throw error('Нужно выбрать версию спорных записей', 'STATE_CONFLICT');
            continue;
          }
          if (e.code === 'ACTION_PASSWORD_REQUIRED') {
            actionCredential = null; actionRequired = true; paused = true;
            throw e;
          }
          // A lost response is not proof that the server rejected the write.
          if (!e.status || e.status >= 500) uncertainState = sent;
          throw e;
        }
        baseState = sent; version = result.updatedAt; actionCredential = null; actionRequired = false; sentState = null;
        dirty = sentRevision !== revision && !same(snapshot(), baseState);
        persistDraft(); retryDelay = 1000;
      }
      status('Все изменения сохранены', 'saved');
      return { updatedAt: version };
    })();
    try { return await inFlight; }
    catch (e) {
      persistDraft();
      if (e.code !== 'STATE_CONFLICT' && e.code !== 'ACTION_CANCELLED' && e.code !== 'ACTION_PASSWORD_REQUIRED' && e.status !== 401) {
        retryDelay = Math.min(retryDelay * 2, 30000); schedule(retryDelay);
      }
      throw e;
    } finally { inFlight = null; }
  }
  async function poll() {
    if (!ready || dirty || inFlight || pollFlight || replacing || document.visibilityState === 'hidden') return;
    const startedRevision = revision;
    pollFlight = api('/api/state', 'GET', null, window.garageLoginPassword);
    try {
      const remote = await pollFlight;
      // A response that started before an edit must never replace that edit.
      if (revision !== startedRevision || dirty || inFlight || replacing) return;
      if ((remote.updatedAt ?? null) !== version) {
        baseState = shared(remote.state); version = remote.updatedAt ?? null;
        applyState(baseState, 'garage-cloud-updated');
        if (!same(snapshot(), baseState)) changed();
      }
    } catch (e) {
      if (e.status === 401) report(e);
      else status('Нет связи с облаком. Последние загруженные данные доступны.', 'offline');
    } finally { pollFlight = null; }
  }
  function offerRecovery() {
    let drafts = [];
    try {
      drafts = Object.keys(localStorage).filter(k => k.startsWith(DRAFT_PREFIX) && k !== draftKey)
        .map(key => ({ key, draft: readDraft(key) })).filter(v => v.draft);
    } catch { return; }
    if (!drafts.length || document.getElementById('garageDraftRecovery')) return;
    const box = document.createElement('div'); box.id = 'garageDraftRecovery'; box.className = 'card';
    box.style.cssText = 'margin:8px 16px;padding:10px;font-size:12px';
    const text = document.createElement('p');
    text.textContent = 'На этом устройстве есть несохранённые правки из другой вкладки. Если она закрыта, можно восстановить её копию.';
    box.append(text);
    for (const { key, draft } of drafts) {
      const button = document.createElement('button'); button.className = 'btn';
      button.textContent = 'Восстановить копию от ' + String(draft.editedAt || 'неизвестной даты');
      button.onclick = async () => {
        try {
          await save();
          const current = readDraft(key);
          if (!current) { box.remove(); return; }
          backupRecovery('Перед восстановлением черновика', snapshot());
          const recoveryBase = current.inFlightState && same(shared(current.inFlightState), baseState)
            ? shared(current.inFlightState) : current.baseState;
          const result = GarageMerge.mergeSnapshots(recoveryBase, current.state, baseState);
          applyState(result.state, 'garage-cloud-updated');
          revision++; dirty = !same(snapshot(), baseState);
          recoveredDrafts.set(key, current.raw);
          if (result.conflicts.length) conflict = { baseState: recoveryBase, remote: { state: baseState, updatedAt: version }, items: result.conflicts };
          persistDraft(); box.remove();
          if (conflict) { status('Восстановленная копия содержит спорные записи.', 'conflict'); showConflicts(); }
          else await save();
        } catch (e) { report(e); }
      };
      box.append(button);
    }
    (document.querySelector('main') || document.body).prepend(box);
  }
  async function start(password) {
    if (inFlight) await inFlight;
    window.garageLoginPassword = password; paused = false; conflict = null;
    actionCredential = null; actionRequired = false;
    const draft = readDraft(draftKey);
    sentState = null; uncertainState = null;
    const remote = await api('/api/state', 'GET', null, password);
    baseState = shared(remote.state); version = remote.updatedAt ?? null;
    applyState(baseState, 'garage-cloud-loaded');
    ready = true;
    if (draft) {
      const recoveryBase = draft.inFlightState && same(shared(draft.inFlightState), baseState)
        ? shared(draft.inFlightState) : draft.baseState;
      const result = GarageMerge.mergeSnapshots(recoveryBase, draft.state, baseState);
      applyState(result.state, 'garage-cloud-loaded');
      if (result.conflicts.length) conflict = { baseState: recoveryBase, remote: { state: baseState, updatedAt: version }, items: result.conflicts };
    }
    dirty = !same(snapshot(), baseState);
    persistDraft();
    if (conflict) status('Найдены несохранённые правки и одновременные изменения. Выберите версии.', 'conflict');
    else if (dirty) schedule(0);
    else status('Все изменения сохранены', 'saved');
    offerRecovery();
    return remote.state !== null;
  }
  async function replace(state, options = {}) {
    if (!ready) throw error('Сначала войдите в GARAGE', 'NOT_READY');
    await save({ actionPassword: options.actionPassword });
    const next = shared(state);
    const before = snapshot(), beforeRevision = revision;
    replacing = true; status('Восстановление резервной копии…', 'saving');
    try {
      const result = await write(next, 'replace', options.actionPassword);
      baseState = next; version = result.updatedAt; actionCredential = null;
      if (revision === beforeRevision) applyState(next, 'garage-cloud-loaded');
      else {
        const merged = GarageMerge.mergeSnapshots(before, snapshot(), next);
        applyState(merged.state, 'garage-cloud-updated');
        if (merged.conflicts.length) conflict = { baseState: before, remote: { state: next, updatedAt: version }, items: merged.conflicts };
      }
      revision++; dirty = !same(snapshot(), baseState); persistDraft();
      if (conflict) throw error('Копия сохранена, но во время импорта появились спорные правки. Выберите версии перед перезагрузкой.', 'IMPORT_PENDING_EDITS');
      // Rendering upgrades old records and fills defaults. Persist that normalization
      // before reporting success rather than mistaking it for a failed import.
      replacing = false;
      if (dirty) await save({ actionPassword: options.actionPassword });
      status('Резервная копия сохранена в облаке', 'saved');
      return { updatedAt: version };
    } finally { replacing = false; }
  }

  const original = {
    set: garageStorage.setItem.bind(garageStorage),
    remove: garageStorage.removeItem.bind(garageStorage),
    clear: garageStorage.clear.bind(garageStorage)
  };
  garageStorage.setItem = (key, value) => {
    const before = garageStorage.getItem(key); original.set(key, value);
    if (!DEVICE_KEYS.has(String(key)) && before !== String(value)) changed();
  };
  garageStorage.removeItem = key => {
    const before = garageStorage.getItem(key); original.remove(key);
    if (!DEVICE_KEYS.has(String(key)) && before !== null) changed();
  };
  garageStorage.clear = () => { original.clear(); changed(); };
  window.garageCloudSync = {
    start, save, replace, poll, api, authorizeAction, confirmSave, resolveConflicts,
    load: async password => {
      if (dirty) throw error('Сначала сохраните локальные изменения', 'UNSAVED_CHANGES');
      return start(password || window.garageLoginPassword);
    },
    getStatus: () => ({ ready, dirty, saving: !!inFlight, conflict: !!conflict, actionRequired, durable: !persistenceFailed, updatedAt: version })
  };
  setInterval(() => poll(), 5000);
  window.addEventListener('online', () => { paused = false; if (dirty) schedule(0); else poll(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (dirty) schedule(0); else poll(); }
    else if (dirty) persistDraft();
  });
  window.addEventListener('pagehide', () => { if (dirty) persistDraft(); });
  window.addEventListener('beforeunload', event => {
    if (dirty) { persistDraft(); event.preventDefault(); event.returnValue = ''; }
  });
})();
