const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,DELETE,POST,OPTIONS',
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

const textEncoder = new TextEncoder();

function b64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) {
    s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function unb64(value) {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

async function derivePasswordHash(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 150000,
      hash: 'SHA-256'
    },
    key,
    256
  );

  return b64(bits);
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function getAuth(env) {
  return await env.GARAGE_DB
    .prepare(
      'SELECT id, salt, password_hash, updated_at FROM auth_config WHERE id = 1'
    )
    .first();
}

async function checkPassword(request, env) {
  const password = request.headers.get('x-garage-password') || '';

  if (!password) return false;

  const auth = await getAuth(env);

  if (!auth) return false;

  const salt = unb64(auth.salt);
  const hash = await derivePasswordHash(password, salt);

  return hash === auth.password_hash;
}

async function requirePassword(request, env) {
  const ok = await checkPassword(request, env);

  if (!ok) {
    return json({
      error: 'Unauthorized'
    }, 401);
  }

  return null;
}

async function setupPassword(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      error: 'Invalid JSON'
    }, 400);
  }

  const password = String(body?.password || '');

  if (password.length < 6) {
    return json({
      error: 'Password must contain at least 6 characters'
    }, 400);
  }

  const existing = await getAuth(env);

  if (existing) {
    return json({
      error: 'Password is already configured'
    }, 409);
  }

  const salt = randomSalt();
  const hash = await derivePasswordHash(password, salt);
  const now = new Date().toISOString();

  await env.GARAGE_DB
    .prepare(`
      INSERT INTO auth_config
        (id, salt, password_hash, updated_at)
      VALUES
        (1, ?, ?, ?)
    `)
    .bind(
      b64(salt),
      hash,
      now
    )
    .run();

  return json({
    ok: true
  });
}

async function login(request, env) {
  const ok = await checkPassword(request, env);

  if (!ok) {
    return json({
      error: 'Неверный пароль'
    }, 401);
  }

  return json({
    ok: true
  });
}

async function authStatus(env) {
  const auth = await getAuth(env);

  return json({
    configured: !!auth
  });
}

async function getState(env) {
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

async function putState(request, env) {
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
      VALUES
        (1, ?, ?)
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

async function deleteState(request, env) {
  const authError = await requirePassword(request, env);
  if (authError) return authError;

  await env.GARAGE_DB
    .prepare('DELETE FROM app_state')
    .run();

  return json({
    ok: true
  });
}

async function downloadState(request, env) {
  const authError = await requirePassword(request, env);
  if (authError) return authError;

  return await getState(env);
}

async function uploadState(request, env) {
  const authError = await requirePassword(request, env);
  if (authError) return authError;

  return await putState(request, env);
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

    if (url.pathname === '/api/auth/status') {
      if (request.method !== 'GET') {
        return json({
          error: 'Method not allowed'
        }, 405);
      }

      return await authStatus(env);
    }

    if (url.pathname === '/api/auth/setup') {
      if (request.method !== 'POST') {
        return json({
          error: 'Method not allowed'
        }, 405);
      }

      return await setupPassword(request, env);
    }

    if (url.pathname === '/api/auth/login') {
      if (request.method !== 'POST') {
        return json({
          error: 'Method not allowed'
        }, 405);
      }

      return await login(request, env);
    }

    if (url.pathname === '/api/state') {
      if (request.method === 'GET') {
        const authError = await requirePassword(request, env);
        if (authError) return authError;

        return await getState(env);
      }

      if (request.method === 'PUT') {
        const authError = await requirePassword(request, env);
        if (authError) return authError;

        return await putState(request, env);
      }

      if (request.method === 'DELETE') {
        return await deleteState(request, env);
      }

      return json({
        error: 'Method not allowed'
      }, 405);
    }

    if (url.pathname === '/api/backup/download') {
      if (request.method !== 'GET') {
        return json({
          error: 'Method not allowed'
        }, 405);
      }

      return await downloadState(request, env);
    }

    if (url.pathname === '/api/backup/upload') {
      if (request.method !== 'PUT') {
        return json({
          error: 'Method not allowed'
        }, 405);
      }

      return await uploadState(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
