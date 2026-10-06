const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
  'access-control-allow-headers': 'content-type, x-garage-password'
};

const json = (body, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
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
      action_hash TEXT,
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
  const supplied = password || request.headers.get('x-garage-password') || '';
  if (!supplied) return false;
  return (await sha256(supplied)) === auth.action_hash;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
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
        const loginPassword = String(body?.password || '');
        if (loginPassword.length < 6) {
          return json({ error: 'Password must contain at least 6 characters' }, 400);
        }
        const now = new Date().toISOString();
        const hash = await sha256(loginPassword);
        await env.GARAGE_DB.prepare(`
          INSERT INTO garage_auth (id, login_hash, action_hash, updated_at)
          VALUES (1, ?, ?, ?)
        `).bind(hash, hash, now).run();
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
        if (!(await requireLogin(request, env))) {
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
        await env.GARAGE_DB.prepare(
          'UPDATE garage_auth SET login_hash = ?, action_hash = NULL, updated_at = ? WHERE id = 1'
        ).bind(await sha256(next), new Date().toISOString()).run();
        return json({ ok: true });
      }

      if (url.pathname === '/api/state') {
        if (!(await requireLogin(request, env))) return json({ error: 'Unauthorized' }, 401);

        if (request.method === 'GET') {
          const row = await env.GARAGE_DB.prepare(
            'SELECT state_json, updated_at FROM app_state WHERE id = 1'
          ).first();
          if (!row) return json({ state: null, updatedAt: null });
          try {
            return json({ state: JSON.parse(row.state_json), updatedAt: row.updated_at });
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
          const updatedAt = new Date().toISOString();
          await env.GARAGE_DB.prepare(`
            INSERT INTO app_state (id, state_json, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              state_json = excluded.state_json,
              updated_at = excluded.updated_at
          `).bind(JSON.stringify(body.state), updatedAt).run();
          return json({ ok: true, updatedAt });
        }
        return json({ error: 'Method not allowed' }, 405);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || 'Internal server error' }, 500);
    }
  }
};
