const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-garage-password'
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...corsHeaders
  }
});

async function ensureAuthTable(env) {
  await env.GARAGE_DB.prepare(`
    CREATE TABLE IF NOT EXISTS garage_auth (
      id INTEGER PRIMARY KEY,
      password TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function getCloudPassword(env) {
  await ensureAuthTable(env);
  const row = await env.GARAGE_DB
    .prepare('SELECT password FROM garage_auth WHERE id = 1')
    .first();
  return row?.password ? String(row.password) : '';
}

function suppliedPassword(request) {
  return request.headers.get('x-garage-password') || '';
}

async function authorized(request, env) {
  const current = await getCloudPassword(env);
  const supplied = suppliedPassword(request);
  return Boolean(current && supplied && current === supplied);
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    try {
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

      if (
        url.pathname === '/api/auth/status' &&
        request.method === 'GET'
      ) {
        return json({
          configured: Boolean(await getCloudPassword(env))
        });
      }

      if (
        url.pathname === '/api/auth/setup' &&
        request.method === 'POST'
      ) {
        const body = await bodyJson(request);
        const password = String(body?.password || '');

        if (password.length < 6) {
          return json({
            error: 'Password must contain at least 6 characters'
          }, 400);
        }

        const current = await getCloudPassword(env);

        if (current) {
          return json({
            error: 'Password already configured'
          }, 409);
        }

        await env.GARAGE_DB.prepare(
          `INSERT INTO garage_auth
            (id, password, updated_at)
           VALUES (1, ?, ?)`
        ).bind(
          password,
          new Date().toISOString()
        ).run();

        return json({
          ok: true
        });
      }

      if (
        url.pathname === '/api/auth/login' &&
        request.method === 'POST'
      ) {
        const body = await bodyJson(request);
        const password = String(body?.password || '');
        const current = await getCloudPassword(env);

        return password && current && password === current
          ? json({ ok: true })
          : json({ error: 'Unauthorized' }, 401);
      }

      if (
        url.pathname === '/api/auth/change' &&
        request.method === 'POST'
      ) {
        const body = await bodyJson(request);
        const current = await getCloudPassword(env);
        const suppliedCurrent = String(
          body?.currentPassword || ''
        );
        const next = String(body?.password || '');

        if (!current || suppliedCurrent !== current) {
          return json({
            error: 'Unauthorized'
          }, 401);
        }

        if (next.length < 6) {
          return json({
            error: 'Password must contain at least 6 characters'
          }, 400);
        }

        await env.GARAGE_DB.prepare(
          `UPDATE garage_auth
           SET password = ?, updated_at = ?
           WHERE id = 1`
        ).bind(
          next,
          new Date().toISOString()
        ).run();

        return json({
          ok: true
        });
      }

      if (url.pathname === '/api/state') {
        if (!(await authorized(request, env))) {
          return json({
            error: 'Unauthorized'
          }, 401);
        }

        if (request.method === 'GET') {
          const row = await env.GARAGE_DB.prepare(
            `SELECT state_json, updated_at
             FROM app_state
             WHERE id = 1`
          ).first();

          if (!row) {
            return json({
              state: null,
              updatedAt: null
            });
          }

          let state;

          try {
            state = JSON.parse(row.state_json);
          } catch {
            return json({
              error: 'Stored state is invalid'
            }, 500);
          }

          return json({
            state,
            updatedAt: row.updated_at
          });
        }

        if (request.method === 'PUT') {
          const body = await bodyJson(request);

          if (
            !body ||
            !body.state ||
            typeof body.state !== 'object' ||
            Array.isArray(body.state)
          ) {
            return json({
              error: 'Expected an object in state'
            }, 400);
          }

          const updatedAt = new Date().toISOString();

          await env.GARAGE_DB.prepare(`
            INSERT INTO app_state
              (id, state_json, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              state_json = excluded.state_json,
              updated_at = excluded.updated_at
          `).bind(
            JSON.stringify(body.state),
            updatedAt
          ).run();

          return json({
            ok: true,
            updatedAt
          });
        }

        return json({
          error: 'Method not allowed'
        }, 405);
      }

      if (!env.ASSETS) {
        return json({
          error: 'Assets binding is not configured'
        }, 500);
      }

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error(
        'GARAGE Worker error:',
        error
      );

      return json({
        error: 'Internal Server Error',
        detail: String(
          error?.message || error
        )
      }, 500);
    }
  }
};
