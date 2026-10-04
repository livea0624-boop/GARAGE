const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type, x-garage-password'
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    ...corsHeaders
  }
});

const encoder = new TextEncoder();

function b64(bytes) {
  let out = '';
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i += 0x8000) {
    out += String.fromCharCode(...a.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

function unb64(value) {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function randomSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 150000,
      hash: 'SHA-256'
    },
    key,
    256
  );

  return b64(bits);
}

async function ensureSchema(env) {
  await env.GARAGE_DB.batch([
    env.GARAGE_DB.prepare(`
      CREATE TABLE IF NOT EXISTS auth_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    env.GARAGE_DB.prepare(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    env.GARAGE_DB.prepare(`
      CREATE TABLE IF NOT EXISTS system_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
  ]);
}

async function oneTimeCleanStart(env) {
  const marker = await env.GARAGE_DB
    .prepare(`SELECT value FROM system_meta WHERE key = 'initial_clean_start_v1'`)
    .first();

  if (marker) return;

  // One-time clean start for this new cloud-only version.
  // Existing Garage data and old passwords are removed once.
  await env.GARAGE_DB.batch([
    env.GARAGE_DB.prepare('DELETE FROM app_state'),
    env.GARAGE_DB.prepare('DELETE FROM auth_config'),
    env.GARAGE_DB.prepare(`
      INSERT INTO system_meta (key, value, updated_at)
      VALUES ('initial_clean_start_v1', 'done', ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).bind(new Date().toISOString())
  ]);
}

async function init(env) {
  await ensureSchema(env);
  await oneTimeCleanStart(env);
}

async function getAuth(env) {
  return env.GARAGE_DB
    .prepare('SELECT id, salt, password_hash, updated_at FROM auth_config WHERE id = 1')
    .first();
}

async function authorized(request, env) {
  const supplied = request.headers.get('x-garage-password') || '';
  if (!supplied) return false;

  const auth = await getAuth(env);
  if (!auth) return false;

  try {
    const hash = await hashPassword(supplied, unb64(auth.salt));
    return hash === auth.password_hash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

async function requireAuth(request, env) {
  if (!(await authorized(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

async function authStatus(env) {
  const auth = await getAuth(env);
  return json({ configured: !!auth });
}

async function setupPassword(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const password = String(body?.password || '');

  if (password.length < 6) {
    return json({ error: 'Минимум 6 символов.' }, 400);
  }

  const existing = await getAuth(env);

  if (existing) {
    return json({ error: 'Пароль уже создан.' }, 409);
  }

  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  await env.GARAGE_DB
    .prepare(`
      INSERT INTO auth_config (id, salt, password_hash, updated_at)
      VALUES (1, ?, ?, ?)
    `)
    .bind(b64(salt), passwordHash, now)
    .run();

  return json({ ok: true });
}

async function login(request, env) {
  if (await authorized(request, env)) {
    return json({ ok: true });
  }

  return json({ error: 'Неверный пароль.' }, 401);
}

async function readState(env) {
  const row = await env.GARAGE_DB
    .prepare('SELECT state_json, updated_at FROM app_state WHERE id = 1')
    .first();

  if (!row) {
    return json({ state: null, updatedAt: null });
  }

  try {
    return json({
      state: JSON.parse(row.state_json),
      updatedAt: row.updated_at
    });
  } catch {
    return json({ error: 'Stored state is invalid' }, 500);
  }
}

async function writeState(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (
    !body ||
    !body.state ||
    typeof body.state !== 'object' ||
    Array.isArray(body.state)
  ) {
    return json({ error: 'Expected an object in state' }, 400);
  }

  const updatedAt = new Date().toISOString();

  await env.GARAGE_DB
    .prepare(`
      INSERT INTO app_state (id, state_json, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `)
    .bind(JSON.stringify(body.state), updatedAt)
    .run();

  return json({ ok: true, updatedAt });
}

async function clearState(request, env) {
  const error = await requireAuth(request, env);
  if (error) return error;

  await env.GARAGE_DB.prepare('DELETE FROM app_state').run();

  return json({ ok: true });
}

function notFound() {
  return json({ error: 'Not Found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (!env.GARAGE_DB) {
      return json({
        error: 'D1 binding GARAGE_DB is not configured'
      }, 500);
    }

    try {
      // API routes are handled before Assets, so they work even if the
      // Assets binding is missing from a manual Worker deployment.
      if (url.pathname === '/api/auth/status') {
        if (request.method !== 'GET') {
          return json({ error: 'Method not allowed' }, 405);
        }

        await init(env);
        return await authStatus(env);
      }

      if (url.pathname === '/api/auth/setup') {
        if (request.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405);
        }

        await init(env);
        return await setupPassword(request, env);
      }

      if (url.pathname === '/api/auth/login') {
        if (request.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405);
        }

        await init(env);
        return await login(request, env);
      }

      if (url.pathname === '/api/state') {
        await init(env);

        if (request.method === 'GET') {
          const error = await requireAuth(request, env);
          if (error) return error;
          return await readState(env);
        }

        if (request.method === 'PUT') {
          const error = await requireAuth(request, env);
          if (error) return error;
          return await writeState(request, env);
        }

        if (request.method === 'DELETE') {
          return await clearState(request, env);
        }

        return json({ error: 'Method not allowed' }, 405);
      }

      // Static site handling. If the Worker was manually deployed without
      // an Assets binding, return a clean 404 instead of throwing
      // "Cannot read properties of undefined (reading 'fetch')".
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return await env.ASSETS.fetch(request);
      }

      return notFound();
    } catch (error) {
      console.error('GARAGE Worker error:', error);
      return json({
        error: error?.message || 'Internal Server Error'
      }, 500);
    }
  }
};
