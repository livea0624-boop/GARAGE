import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOemSearch } from '../src/oem-search.js';

const VIN = 'JMZBK12Z561261094';

function mockEnv({ key = 'test-api-key', used = 0 } = {}) {
  let count = used;
  return {
    OPENAI_API_KEY: key,
    GARAGE_DB: {
      prepare(query) {
        return {
          bind() { return this; },
          async run() {
            if (query.startsWith('INSERT INTO oem_search_limits')) {
              if (count >= 10) return { meta: { changes: 0 } };
              count += 1;
            }
            return { meta: { changes: 1 } };
          }
        };
      }
    }
  };
}
function request(body = { vin: VIN, part: 'пружина задняя' }) {
  return new Request('https://garage.example/api/oem-search', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
test('requires logged-in GARAGE user before making a billable request', async () => {
  const response = await handleOemSearch(request(), mockEnv(), async () => false);
  assert.equal(response.status, 401);
});

test('reports missing Cloudflare OpenAI secret', async () => {
  const response = await handleOemSearch(request(), mockEnv({ key: '' }), async () => true);
  assert.equal(response.status, 503);
});

test('rejects malformed VIN', async () => {
  const response = await handleOemSearch(request({ vin: 'BADVIN', part: 'колодки задние' }), mockEnv(), async () => true);
  assert.equal(response.status, 400);
});

test('limits paid searches to 10 requests per hour', async () => {
  const response = await handleOemSearch(request(), mockEnv({ used: 10 }), async () => true);
  assert.equal(response.status, 429);
});

test('does not present an OEM number without an allowed-domain URL citation', async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    output: [{ content: [{ type: 'output_text', text: 'OEM 12345, VIN подтверждён' }] }]
  });
  try {
    const response = await handleOemSearch(request(), mockEnv(), async () => true);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.vinConfirmed, false);
    assert.equal(data.sources.length, 0);
    assert.ok(!data.answer.includes('12345'));
  } finally { globalThis.fetch = prev; }
});

test('only exposes allowed catalogue citations; positive VIN claims are removed', async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.deepEqual(body.tools[0].filters.allowed_domains,
      ['elcats.ru', 'japancats.ru', 'exist.ru', 'eurospares.co.uk']);
    return Response.json({ output: [{
      content: [{ type: 'output_text', text: 'Пружина задняя: BP4K-28-011B.\nVIN подтверждён.', annotations: [
        { type: 'url_citation', url: 'https://www.japancats.ru/Mazda' },
        { type: 'url_citation', url: 'https://example.com/fake' }
      ] }]
    }] });
  };
  try {
    const response = await handleOemSearch(request(), mockEnv(), async () => true);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.match(data.answer, /BP4K-28-011B/);
    assert.equal(data.vinConfirmed, false);
    assert.match(data.answer, /VIN не подтверждён/);
    assert.equal(data.sources.length, 1);
    assert.match(data.sources[0].url, /japancats\.ru/);
  } finally { globalThis.fetch = prev; }
});

test('returns controlled error on OpenAI failure', async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 401 });
  try {
    const response = await handleOemSearch(request(), mockEnv(), async () => true);
    assert.equal(response.status, 502);
  } finally { globalThis.fetch = prev; }
});
