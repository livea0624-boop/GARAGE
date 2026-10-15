// OEM search for GARAGE. Attach to the existing authenticated Worker.
const OEM_DOMAINS = ['elcats.ru', 'japancats.ru', 'exist.ru', 'eurospares.co.uk'];
const OEM_PROMPT = [
  'Ты помощник магазина запчастей. Ищи ТОЛЬКО оригинальные OEM-артикулы, не аналоги.',
  'Приоритет: оригинальные каталоги, опубликованные Exist, в первую очередь Elcats и Japancats.',
  'Не делай вид, что вводил VIN в каталог, если этого не было. По применяемости к VIN можно утверждать подтверждение ТОЛЬКО при прямом результате каталога именно для этого VIN.',
  'Не путай доказательство применяемости по модели с точным VIN-подбором.',
  'Ответ строго краткий, по-русски: марка/модель если известна; деталь; OEM; каталог; статус: "VIN подтверждён" или "VIN не подтверждён".',
  'Если артикул нельзя установить достоверно — прямо укажи, что не найден. Не выдумывай номера, модели, ссылки.',
  'Никаких заменителей или предложений о покупке.'
].join('\n');
function oemJson(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function oemExtract(response) {
  if (response.output_text) return response.output_text;
  return (response.output || []).flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text || '').join('\n');
}
export async function handleOemSearch(request, env, requireLogin) {
  if (request.method !== 'POST') return oemJson({ error: 'Method not allowed' }, 405);
  if (!(await requireLogin(request, env))) return oemJson({ error: 'Unauthorized' }, 401);
  if (!env.OPENAI_API_KEY) return oemJson({ error: 'Не настроен OPENAI_API_KEY для поиска OEM.' }, 503);
  let body;
  try { body = await request.json(); } catch { return oemJson({ error: 'Invalid JSON' }, 400); }
  const vin = String(body?.vin || '').trim().toUpperCase();
  const part = String(body?.part || '').trim();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || part.length < 2 || part.length > 120) {
    return oemJson({ error: 'Укажите правильный VIN (17 знаков) и название детали.' }, 400);
  }
  // Fixed window quota protects external API costs. 10 requests per hour for each GARAGE instance.
  await env.GARAGE_DB.prepare(`CREATE TABLE IF NOT EXISTS oem_search_limits (window_hour TEXT PRIMARY KEY, used INTEGER NOT NULL)`).run();
  const hour = new Date().toISOString().slice(0, 13);
  const quota = await env.GARAGE_DB.prepare(`INSERT INTO oem_search_limits(window_hour, used) VALUES (?, 1)
    ON CONFLICT(window_hour) DO UPDATE SET used = used + 1 WHERE used < 10`).bind(hour).run();
  if (!quota.meta?.changes) return oemJson({ error: 'Лимит поиска: 10 запросов в час. Попробуйте позже.' }, 429);
  // Keep the limits table bounded.
  await env.GARAGE_DB.prepare('DELETE FROM oem_search_limits WHERE window_hour < ?').bind(new Date(Date.now() - 48 * 3600e3).toISOString().slice(0,13)).run();
  const ai = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'authorization': 'Bearer ' + env.OPENAI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.OEM_OPENAI_MODEL || 'gpt-5-mini',
      instructions: OEM_PROMPT,
      input: `VIN: ${vin}\nДеталь: ${part}\nИщи документы/схемы применяемости исключительно в перечисленных каталогах. Если прямой VIN-подбор недоступен, явно укажи.`,
      tools: [{ type: 'web_search', filters: { allowed_domains: OEM_DOMAINS } }],
      max_output_tokens: 700
    }),
    signal: AbortSignal.timeout(35000)
  });
  const data = await ai.json().catch(() => ({}));
  if (!ai.ok) {
    console.error('OEM model HTTP status', ai.status);
    return oemJson({ error: 'Сервис поиска временно недоступен.' }, 502);
  }
  const sources = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      for (const a of c.annotations || []) {
        if (a.type !== 'url_citation' || !a.url) continue;
        try {
          const u = new URL(a.url);
          if (u.protocol === 'https:' && OEM_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d)) &&
            !sources.some(v => v.url === u.href)) sources.push({ url: u.href });
        } catch (_) {}
      }
    }
  }
  const answer = oemExtract(data).trim();
  return oemJson({ answer: answer || 'Нет подтверждённых данных в доступных OEM-каталогах.', sources });
}
