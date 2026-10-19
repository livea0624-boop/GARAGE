(function (root) {
  'use strict';
  const missing = Symbol('missing');
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const same = (a, b) => a === b || (a !== missing && b !== missing && JSON.stringify(a) === JSON.stringify(b));
  const valueAt = (value, key) => own(value, key) ? value[key] : missing;
  // Match the application's canonical order lookup: an archived order takes
  // precedence over a redundant active/history copy in a legacy snapshot.
  const orderKeys = ['garageCompletedOrders', 'garageClientOrders', 'garageOrderHistoryOverrides',
    'garageArchivedOrders', 'garageOrderArchive', 'garageCompletedOrderOverrides'];
  const dictionaryOrderKeys = new Set(['garageOrderHistoryOverrides', 'garageCompletedOrderOverrides']);
  const legacyOrderKeys = new Set(['garageArchivedOrders', 'garageOrderArchive']);
  function mergeSnapshots(base = {}, local = {}, remote = {}, preference = 'local') {
    const conflicts = [];
    function atomic(a, b, c, key, id) {
      if (same(b, c)) return b;
      if (same(b, a)) return c;
      if (same(c, a)) return b;
      conflicts.push({ key, id: String(id ?? ''), base: a === missing ? null : a,
        local: b === missing ? null : b, remote: c === missing ? null : c });
      return preference === 'remote' ? c : b;
    }
    function collection(a, b, c, key) {
      if (same(b, c) || same(b, a) || same(c, a)) return atomic(a, b, c, key);
      if ([a, b, c].every(Array.isArray)) {
        const all = [...a, ...b, ...c];
        const entities = all.length && all.every(v => object(v) && v.id != null);
        const strings = all.every(v => typeof v === 'string');
        if (entities || strings) {
          const identity = v => entities ? String(v.id) : v;
          if ([a, b, c].some(list => new Set(list.map(identity)).size !== list.length)) return atomic(a, b, c, key);
          const maps = [a, b, c].map(list => Object.fromEntries(list.map(v => [identity(v), v])));
          const ids = new Set([...c, ...b, ...a].map(identity));
          const result = [];
          for (const id of ids) {
            const next = atomic(...maps.map(map => valueAt(map, id)), key, id);
            if (next !== missing) result.push(next);
          }
          return result;
        }
      }
      if ([a, b, c].every(object)) {
        const result = Object.create(null);
        for (const id of new Set([...Object.keys(c), ...Object.keys(b), ...Object.keys(a)])) {
          const next = atomic(valueAt(a, id), valueAt(b, id), valueAt(c, id), key, id);
          if (next !== missing) result[id] = next;
        }
        return result;
      }
      return atomic(a, b, c, key);
    }
    const state = Object.create(null);
    function orderSnapshot(snapshot) {
      const records = new Map();
      for (const key of orderKeys) {
        if (!own(snapshot, key)) continue;
        let parsed;
        try { parsed = JSON.parse(snapshot[key]); } catch { return null; }
        const dictionary = dictionaryOrderKeys.has(key) || (legacyOrderKeys.has(key) && object(parsed));
        if (dictionary ? !object(parsed) : !Array.isArray(parsed)) return null;
        const slots = dictionary ? Object.keys(parsed) : parsed.map((_, index) => index);
        const seen = new Set();
        for (const slot of slots) {
          const record = parsed[slot];
          if (!object(record) || record.id == null || seen.has(String(record.id))) return null;
          const id = String(record.id);
          seen.add(id);
          if (!records.has(id)) records.set(id, { key, record });
        }
      }
      return records;
    }
    const orderSnapshots = [base, local, remote].map(orderSnapshot);
    const mergeOrders = orderSnapshots.every(snapshot => snapshot !== null);
    for (const key of new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(base)])) {
      if (['garageInterfaceMode', 'garageCurrentUser'].includes(key)) continue;
      if (orderKeys.includes(key)) continue;
      const raw = [base, local, remote].map(v => valueAt(v, key));
      let next;
      try {
        const parsed = raw.map(v => v === missing ? missing : JSON.parse(v));
        if (parsed[0] === missing && parsed[1] !== missing && parsed[2] !== missing) {
          if (Array.isArray(parsed[1]) && Array.isArray(parsed[2])) parsed[0] = [];
          else if (object(parsed[1]) && object(parsed[2])) parsed[0] = {};
        }
        next = collection(...parsed, key);
        if (next !== missing) next = JSON.stringify(next);
      } catch { next = atomic(...raw, key); }
      if (next !== missing) state[key] = next;
    }
    if (mergeOrders) {
      const merged = new Map();
      for (const id of new Set([...orderSnapshots[2].keys(), ...orderSnapshots[1].keys(), ...orderSnapshots[0].keys()])) {
        const versions = orderSnapshots.map(snapshot => snapshot.has(id) ? snapshot.get(id) : missing);
        const next = atomic(...versions, 'garageOrders', id);
        if (next !== missing) merged.set(id, next);
      }
      for (const key of orderKeys) {
        const entries = [...merged.values()].filter(entry => entry.key === key);
        // Merge the presence of an empty container separately from its records.
        // Choosing a remote edit over a local archive move must not also keep
        // the stale archived copy of that same order.
        const presence = [base, local, remote].map(snapshot => own(snapshot, key));
        const keep = presence[1] === presence[0] ? presence[2] : presence[1];
        if (!entries.length && !keep) continue;
        const shapeSources = preference === 'remote' ? [remote, local, base] : [local, remote, base];
        const shapeSource = shapeSources.find(snapshot => own(snapshot, key));
        const dictionary = dictionaryOrderKeys.has(key)
          || (legacyOrderKeys.has(key) && shapeSource && object(JSON.parse(shapeSource[key])));
        const value = dictionary
          ? Object.fromEntries(entries.map(entry => [String(entry.record.id), entry.record]))
          : entries.map(entry => entry.record);
        state[key] = JSON.stringify(value);
      }
    } else {
      // Corrupt/ambiguous legacy data cannot safely be split into records.
      // Keep the whole group atomic so a per-key choice still cannot resurrect
      // a stale archived copy alongside a concurrently edited active order.
      const groups = [base, local, remote].map(snapshot => Object.fromEntries(
        orderKeys.filter(key => own(snapshot, key)).map(key => [key, snapshot[key]])
      ));
      Object.assign(state, atomic(...groups, 'garageOrders'));
    }
    return { state, conflicts };
  }
  root.GarageMerge = { mergeSnapshots };
  if (typeof module !== 'undefined') module.exports = root.GarageMerge;
})(typeof window === 'undefined' ? globalThis : window);
