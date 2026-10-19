(function () {
  'use strict';
  const data = Object.create(null);
  const deviceKeys = new Set(['garageInterfaceMode', 'garageCurrentUser']);
  const prefix = 'garageDevice:';
  function readDevice(key) {
    try { return localStorage.getItem(prefix + key) ?? localStorage.getItem(key) ?? data[key] ?? null; }
    catch { return data[key] ?? null; }
  }
  window.garageDeviceKeys = deviceKeys;
  window.garageCredentialKeys = new Set(['garageSitePassword', 'garageLoginPassword', 'garageActionPassword', 'GARAGE_API_PASSWORD']);
  window.garageStorage = {
    get length() { return new Set([...Object.keys(data), ...[...deviceKeys].filter(k => readDevice(k) !== null)]).size; },
    key(index) { return [...new Set([...Object.keys(data), ...[...deviceKeys].filter(k => readDevice(k) !== null)])][index] ?? null; },
    getItem(key) { key = String(key); return deviceKeys.has(key) ? readDevice(key) : (data[key] ?? null); },
    setItem(key, value) {
      key = String(key); value = String(value); data[key] = value;
      if (deviceKeys.has(key)) {
        try { localStorage.setItem(prefix + key, value); localStorage.removeItem(key); } catch { /* in-memory fallback */ }
      }
    },
    removeItem(key) {
      key = String(key); delete data[key];
      if (deviceKeys.has(key)) { try { localStorage.removeItem(prefix + key); localStorage.removeItem(key); } catch { /* unavailable */ } }
    },
    clear() {
      // Cloud snapshots must never switch the employee or layout on this device.
      for (const key of Object.keys(data)) if (!deviceKeys.has(key)) delete data[key];
    }
  };
})();
