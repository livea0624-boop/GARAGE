const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders,
      ...extraHeaders
    }
  });
}

async function ensureStateTable(env) {
  await env.GARAGE_DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function sameOriginOrAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    return originUrl.host === requestUrl.host;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    try {
      if (!env.GARAGE_DB) {
        return json({ error: 'D1 binding GARAGE_DB is not configured' }, 500);
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (!sameOriginOrAllowed(request)) {
        return json({ error: 'Origin not allowed' }, 403);
      }

      await ensureStateTable(env);
      const url = new URL(request.url);

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, service: 'garage', storage: 'cloudflare-d1' });
      }

      if (url.pathname === '/api/state' && request.method === 'GET') {
        const row = await env.GARAGE_DB.prepare(`
          SELECT state_json, updated_at
          FROM app_state
          WHERE id = 1
        `).first();

        if (!row) {
          return json({ state: null, updatedAt: null });
        }

        let state;
        try {
          state = JSON.parse(row.state_json);
        } catch {
          return json({ error: 'Stored state is invalid' }, 500);
        }

        return json({ state, updatedAt: row.updated_at });
      }

      if (url.pathname === '/api/state' && request.method === 'PUT') {
        const body = await readJson(request);

        if (!body || !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
          return json({ error: 'Expected an object in state' }, 400);
        }

        const updatedAt = new Date().toISOString();
        const stateJson = JSON.stringify(body.state);

        await env.GARAGE_DB.prepare(`
          INSERT INTO app_state (id, state_json, updated_at)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            state_json = excluded.state_json,
            updated_at = excluded.updated_at
        `).bind(stateJson, updatedAt).run();

        return json({ ok: true, updatedAt });
      }

      if (!env.ASSETS) {
        return json({ error: 'Assets binding is not configured' }, 500);
      }

      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'strict-origin-when-cross-origin');
      headers.set('x-frame-options', 'SAMEORIGIN');
      headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      console.error('GARAGE Worker error:', error);
      return json({ error: 'Internal Server Error', detail: String(error?.message || error) }, 500);
    }
  }
};
