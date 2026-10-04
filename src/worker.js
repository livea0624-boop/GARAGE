const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
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

function isAuthorized(request, env) {
  const configured = env.GARAGE_API_PASSWORD;

  if (!configured) return false;

  const supplied =
    request.headers.get('x-garage-password') || '';

  return supplied.length > 0 &&
    supplied === configured;
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

    if (url.pathname === '/api/state') {
      if (!env.GARAGE_DB) {
        return json({
          error: 'D1 binding GARAGE_DB is not configured'
        }, 500);
      }

      if (!env.GARAGE_API_PASSWORD) {
        return json({
          error: 'API password is not configured'
        }, 503);
      }

      if (!isAuthorized(request, env)) {
        return json({
          error: 'Unauthorized'
        }, 401);
      }

      if (request.method === 'GET') {
        const row = await env.GARAGE_DB
          .prepare(
            'SELECT state_json, updated_at FROM app_state WHERE id = 1'
          )
          .first();

        if (!row) {
          return json({
            state: null,
            updatedAt: null
          });
        }

        try {
          return json({
            state: JSON.parse(row.state_json),
            updatedAt: row.updated_at
          });
        } catch {
          return json({
            error: 'Stored state is invalid'
          }, 500);
        }
      }

      if (request.method === 'PUT') {
        let body;

        try {
          body = await request.json();
        } catch {
          return json({
            error: 'Invalid JSON'
          }, 400);
        }

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

        await env.GARAGE_DB
          .prepare(`
            INSERT INTO app_state
              (id, state_json, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              state_json = excluded.state_json,
              updated_at = excluded.updated_at
          `)
          .bind(
            JSON.stringify(body.state),
            updatedAt
          )
          .run();

        return json({
          ok: true,
          updatedAt
        });
      }

      return json({
        error: 'Method not allowed'
      }, 405);
    }

    return env.ASSETS.fetch(request);
  }
};
