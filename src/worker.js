const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
  'access-control-allow-headers': 'content-type, x-garage-password, x-garage-action-password'
};

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

const json = (body, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...securityHeaders,
      ...corsHeaders
    }
  }
);

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureAuthTable(env) {
  await env.GARAGE_DB.prepare(`
    CREATE TABLE IF NOT EXISTS garage_auth (
      id INTEGER PRIMARY KEY,
      login_hash TEXT NOT NULL,
      action_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function getAuth(env) {
  await ensureAuthTable(env);
  return env.GARAGE_DB.prepare(
    'SELECT login_hash, action_hash, updated_at FROM garage_auth WHERE id = 1'
  ).first();
}

async function requireLogin(request, env) {
  const supplied = request.headers.get('x-garage-password') || '';
  const auth = await getAuth(env);
  if (!auth || !supplied) return false;
  return (await sha256(supplied)) === auth.login_hash;
}

async function requireAction(request, env, password) {
  const auth = await getAuth(env);
  if (!auth) return false;
  const supplied = password || request.headers.get('x-garage-action-password') || '';
  if (!supplied) return false;
  return (await sha256(supplied)) === auth.action_hash;
}

// These preferences belong to the browser, even in snapshots saved by old clients.
const deviceOnlyKeys = new Set(['garageCurrentUser', 'garageInterfaceMode']);
const credentialKeys = new Set(['garageSitePassword', 'garageLoginPassword', 'garageActionPassword', 'GARAGE_API_PASSWORD']);
const orderKeys = new Set([
  'garageClientOrders', 'garageCompletedOrders', 'garageOrderHistoryOverrides',
  'garageArchivedOrders', 'garageOrderArchive', 'garageCompletedOrderOverrides'
]);
const dictionaryOrderKeys = new Set(['garageOrderHistoryOverrides', 'garageCompletedOrderOverrides']);
const legacyOrderKeys = new Set(['garageArchivedOrders', 'garageOrderArchive', 'garageCompletedOrderOverrides']);
const liveOrderKeys = new Set(['garageClientOrders', 'garageCompletedOrders', 'garageOrderHistoryOverrides']);

function sharedState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  return Object.fromEntries(Object.entries(state).filter(([key]) => !deviceOnlyKeys.has(key) && !credentialKeys.has(key)));
}

async function readState(env) {
  const row = await env.GARAGE_DB.prepare(
    'SELECT state_json, updated_at FROM app_state WHERE id = 1'
  ).first();
  if (!row) return { state: null, updatedAt: null };
  return { state: sharedState(JSON.parse(row.state_json)), updatedAt: row.updated_at };
}

function storedValue(state, key) {
  const value = state?.[key];
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function recordIds(state, keys) {
  const ids = new Set();
  for (const key of keys) {
    const value = storedValue(state, key);
    // Counting IDs inside an object supplied in place of an array would allow
    // a "same IDs" wipe: the browser ignores that object as an invalid list.
    const dictionary = dictionaryOrderKeys.has(key)
      || (legacyOrderKeys.has(key) && value && typeof value === 'object' && !Array.isArray(value));
    const records = dictionary
      ? value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value) : []
      : Array.isArray(value) ? value : [];
    for (const record of records) {
      if (record && typeof record === 'object' && record.id != null) ids.add(String(record.id));
      // Keep malformed legacy records protected as well, rather than silently dropping them.
      else ids.add(JSON.stringify(record));
    }
  }
  return ids;
}

function losesRecords(before, after, keys) {
  const next = recordIds(after, keys);
  return [...recordIds(before, keys)].some(id => !next.has(id));
}

function isDestructive(before, after) {
  if (!before) return false;
  // Moving an order into/out of the archive preserves the order in this union.
  // Obsolete containers are protected too, but cannot hide a live order in a
  // key that current clients do not read.
  if (losesRecords(before, after, liveOrderKeys)) return true;
  if (losesRecords(before, after, orderKeys)) return true;
  for (const key of ['garageClients', 'garageWarehouseSales', 'garageReturns']) {
    if (losesRecords(before, after, [key])) return true;
  }
  const oldSellers = storedValue(before, 'garageSellers');
  const newSellers = storedValue(after, 'garageSellers');
  if (Array.isArray(oldSellers) && oldSellers.some(seller => !Array.isArray(newSellers) || !newSellers.includes(seller))) {
    return true;
  }
  // Submitted carts and empty order-source containers are temporary data. Other
  // shared keys cannot be removed by merely relabelling a request as a normal save.
  return Object.keys(before).some(key => !Object.hasOwn(after, key)
    && key !== 'garageClientCarts' && !orderKeys.has(key));
}

function nextUpdatedAt(previous) {
  // A successful save always changes the CAS token, even within the same millisecond.
  const previousTime = Date.parse(previous);
  return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
}

function stateConflict(current) {
  return json({ error: 'State changed on another device. Reload and merge before saving.', code: 'STATE_CONFLICT', ...current }, 409);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...securityHeaders, ...corsHeaders } });
    }

    if (!env.GARAGE_DB) {
      return json({ error: 'D1 binding GARAGE_DB is not configured' }, 500);
    }

    try {
      if (url.pathname === '/api/auth/status' && request.method === 'GET') {
        const auth = await getAuth(env);
        return json({ configured: !!auth });
      }

      if (url.pathname === '/api/auth/setup' && request.method === 'POST') {
        const existing = await getAuth(env);
        if (existing) return json({ error: 'Already configured' }, 409);

        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        const loginPassword = String(body?.loginPassword || body?.password || '');
        const actionPassword = String(body?.actionPassword || '');
        if (loginPassword.length < 6 || actionPassword.length < 6) {
          return json({ error: 'Passwords must contain at least 6 characters' }, 400);
        }
        if (loginPassword === actionPassword) {
          return json({ error: 'Login and action passwords must be different' }, 400);
        }
        const now = new Date().toISOString();
        const result = await env.GARAGE_DB.prepare(`
          INSERT INTO garage_auth (id, login_hash, action_hash, updated_at)
          VALUES (1, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `).bind(await sha256(loginPassword), await sha256(actionPassword), now).run();
        if (!result.meta?.changes) return json({ error: 'Already configured' }, 409);
        return json({ ok: true });
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        const auth = await getAuth(env);
        if (!auth || (await sha256(String(body?.password || ''))) !== auth.login_hash) {
          return json({ error: 'Unauthorized' }, 401);
        }
        return json({ ok: true });
      }

      if (url.pathname === '/api/auth/action' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        if (!(await requireAction(request, env, String(body?.password || '')))) {
          return json({ error: 'Unauthorized' }, 401);
        }
        return json({ ok: true });
      }

      if (url.pathname === '/api/auth/change' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        const auth = await getAuth(env);
        const current = String(body?.currentPassword || '');
        const next = String(body?.password || '');
        if (!auth || (await sha256(current)) !== auth.login_hash) return json({ error: 'Unauthorized' }, 401);
        if (next.length < 6) return json({ error: 'Password must contain at least 6 characters' }, 400);
        const nextHash = await sha256(next);
        if (nextHash === auth.action_hash) return json({ error: 'Login and action passwords must be different' }, 400);
        const result = await env.GARAGE_DB.prepare(
          'UPDATE garage_auth SET login_hash = ?, updated_at = ? WHERE id = 1 AND login_hash = ? AND action_hash != ?'
        ).bind(nextHash, new Date().toISOString(), auth.login_hash, nextHash).run();
        if (!result.meta?.changes) return json({ error: 'Passwords changed. Try again.' }, 409);
        return json({ ok: true });
      }

      // Отдельная смена пароля опасных действий. Текущий пароль действий
      // проверяется по action_hash; пароль входа для этой операции не подходит.
      if (url.pathname === '/api/auth/change-action' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        const auth = await getAuth(env);
        const current = String(body?.currentPassword || '');
        const next = String(body?.password || '');
        if (!auth || (await sha256(current)) !== auth.action_hash) return json({ error: 'Unauthorized' }, 401);
        if (next.length < 6) return json({ error: 'Password must contain at least 6 characters' }, 400);
        const nextHash = await sha256(next);
        if (nextHash === auth.login_hash) return json({ error: 'Login and action passwords must be different' }, 400);
        const result = await env.GARAGE_DB.prepare(
          'UPDATE garage_auth SET action_hash = ?, updated_at = ? WHERE id = 1 AND action_hash = ? AND login_hash != ?'
        ).bind(nextHash, new Date().toISOString(), auth.action_hash, nextHash).run();
        if (!result.meta?.changes) return json({ error: 'Passwords changed. Try again.' }, 409);
        return json({ ok: true });
      }

      if (url.pathname === '/api/hosting-stats' && request.method === 'GET') {
        if (!(await requireLogin(request, env))) return json({ error: 'Unauthorized' }, 401);

        await env.GARAGE_DB.prepare(`
          CREATE TABLE IF NOT EXISTS hosting_usage_samples (
            sample_day TEXT PRIMARY KEY,
            database_bytes INTEGER NOT NULL,
            created_at TEXT NOT NULL
          )
        `).run();

        // run() exposes D1 meta.size_after, which gives the actual database size
        // after the query. We use a harmless read to obtain the current size.
        const dbCheck = await env.GARAGE_DB.prepare(
          'SELECT id, state_json FROM app_state WHERE id = 1'
        ).run();
        const dbBytes = Number(dbCheck?.meta?.size_after || 0);
        const stateRow = dbCheck?.results?.[0] || null;
        const stateBytes = stateRow?.state_json ? new TextEncoder().encode(String(stateRow.state_json)).byteLength : 0;

        const authRow = await env.GARAGE_DB.prepare(
          'SELECT login_hash, action_hash FROM garage_auth WHERE id = 1'
        ).first();
        const authBytes = authRow
          ? new TextEncoder().encode(String(authRow.login_hash || '') + String(authRow.action_hash || '')).byteLength
          : 0;

        const overheadBytes = Math.max(0, dbBytes - stateBytes - authBytes);
        const now = new Date();
        const day = now.toISOString().slice(0, 10);
        await env.GARAGE_DB.prepare(`
          INSERT INTO hosting_usage_samples (sample_day, database_bytes, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(sample_day) DO UPDATE SET
            database_bytes = excluded.database_bytes,
            created_at = excluded.created_at
        `).bind(day, dbBytes, now.toISOString()).run();

        await env.GARAGE_DB.prepare(`
          DELETE FROM hosting_usage_samples
          WHERE sample_day NOT IN (
            SELECT sample_day FROM hosting_usage_samples
            ORDER BY sample_day DESC LIMIT 30
          )
        `).run();

        const samples = await env.GARAGE_DB.prepare(
          'SELECT sample_day, database_bytes FROM hosting_usage_samples ORDER BY sample_day ASC'
        ).all();
        const rows = samples?.results || [];
        let avgDailyGrowthBytes = 0;
        if (rows.length >= 2) {
          const first = rows[0];
          const last = rows[rows.length - 1];
          const days = Math.max(1, (Date.parse(String(last.sample_day)) - Date.parse(String(first.sample_day))) / 86400000);
          avgDailyGrowthBytes = Math.max(0, (Number(last.database_bytes) - Number(first.database_bytes)) / days);
        }

        return json({
          databaseBytes: dbBytes,
          stateBytes,
          authBytes,
          overheadBytes,
          avgDailyGrowthBytes,
          sampleCount: rows.length,
          freeLimits: {
            databaseBytes: 500 * 1024 * 1024,
            accountStorageBytes: 5 * 1024 * 1024 * 1024,
            rowsReadPerDay: 5000000,
            rowsWrittenPerDay: 100000,
            workerRequestsPerDay: 100000,
            timeTravelDays: 7
          },
          measuredAt: now.toISOString()
        });
      }

      if (url.pathname === '/api/state') {
        if (!(await requireLogin(request, env))) return json({ error: 'Unauthorized' }, 401);

        if (request.method === 'GET') {
          try {
            return json(await readState(env));
          } catch {
            return json({ error: 'Stored state is invalid' }, 500);
          }
        }

        if (request.method === 'PUT') {
          let body;
          try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
          if (!body || !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
            return json({ error: 'Expected an object in state' }, 400);
          }
          if (!Object.hasOwn(body, 'baseUpdatedAt')) {
            return json({ error: 'baseUpdatedAt is required. Load the current state before saving.', code: 'STATE_VERSION_REQUIRED' }, 428);
          }
          if (body.baseUpdatedAt !== null && typeof body.baseUpdatedAt !== 'string') {
            return json({ error: 'baseUpdatedAt must be a string or null' }, 400);
          }
          const current = await readState(env);
          if (body.baseUpdatedAt !== current.updatedAt) return stateConflict(current);
          const state = sharedState(body.state);
          if ((body.operation === 'replace' || isDestructive(current.state, state)) && !(await requireAction(request, env))) {
            return json({ error: 'Action password is required for replacing or deleting shared data.', code: 'ACTION_PASSWORD_REQUIRED' }, 403);
          }
          const updatedAt = nextUpdatedAt(current.updatedAt);
          const serialized = JSON.stringify(state);
          // D1 executes each statement atomically. Checking only before an
          // unconditional UPSERT would still let two simultaneous writers win.
          const result = current.updatedAt === null
            ? await env.GARAGE_DB.prepare(`
                INSERT INTO app_state (id, state_json, updated_at)
                VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING
              `).bind(serialized, updatedAt).run()
            : await env.GARAGE_DB.prepare(`
                UPDATE app_state SET state_json = ?, updated_at = ?
                WHERE id = 1 AND updated_at = ?
              `).bind(serialized, updatedAt, current.updatedAt).run();
          if (!result.meta?.changes) return stateConflict(await readState(env));
          return json({ ok: true, updatedAt });
        }
        return json({ error: 'Method not allowed' }, 405);
      }

      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      for (const [header, value] of Object.entries(securityHeaders)) response.headers.set(header, value);
      return response;
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || 'Internal server error' }, 500);
    }
  }
};
