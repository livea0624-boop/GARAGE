/* GARAGE OEM VIN lookup — isolated UI; no customer/order data is sent. */
(() => {
  function mount() {
    if (document.getElementById('garage-oem-widget-host')) return;
    const host = document.createElement('div');
    host.id = 'garage-oem-widget-host';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
<style>
:host{all:initial;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#111827}
*{box-sizing:border-box}
button,input{font:inherit}
.toggle{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;background:#1d4ed8;color:#fff;border-radius:999px;padding:13px 18px;box-shadow:0 6px 24px #0004;cursor:pointer;font-weight:700}
.panel{position:fixed;right:20px;bottom:76px;z-index:2147483000;width:min(370px,calc(100vw - 24px));max-height:min(600px,calc(100vh - 110px));overflow:auto;background:white;border:1px solid #dfe5ee;border-radius:18px;box-shadow:0 12px 45px #0004;padding:18px}
[hidden]{display:none!important}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px}
h2{font-size:17px;line-height:1.3;margin:0}
small{display:block;color:#6b7280;line-height:1.4;margin:6px 0 12px}
label{display:block;font-weight:650;margin:9px 0 5px}
input{width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#fff;color:#111827}
.actions{display:flex;gap:8px;margin-top:14px}
.search{border:0;background:#1d4ed8;color:white;border-radius:9px;padding:11px;cursor:pointer;flex:1;font-weight:650}
.search:disabled{opacity:.65;cursor:wait}
.close{background:transparent;border:0;font-size:22px;cursor:pointer;padding:2px 7px}
.result{white-space:pre-wrap;margin:12px 0 0;line-height:1.45;font-size:14px;overflow-wrap:anywhere}
.links{margin-top:9px;display:grid;gap:5px}
a{color:#1d4ed8;text-decoration:underline;overflow-wrap:anywhere}
.notice{border-top:1px solid #e5e7eb;margin-top:12px;padding-top:9px;color:#6b7280;font-size:11px;line-height:1.45}
@media(max-width:550px){.toggle{right:12px;bottom:12px}.panel{right:12px;bottom:68px;padding:14px}}
</style>
<button class="toggle" type="button" aria-expanded="false" aria-controls="oem-panel">OEM по VIN</button>
<section id="oem-panel" class="panel" aria-label="Поиск оригинальной запчасти" hidden>
 <header><h2>Поиск OEM по VIN</h2><button class="close" type="button" aria-label="Закрыть">×</button></header>
 <small>Приоритет: оригинальные каталоги Exist — Elcats, Japancats и другие доступные.</small>
 <form>
 <label for="oem-vin">VIN автомобиля</label>
 <input id="oem-vin" name="vin" maxlength="17" spellcheck="false" autocomplete="off" placeholder="17 символов" required>
 <label for="oem-part">Название детали</label>
 <input id="oem-part" name="part" maxlength="120" autocomplete="off" placeholder="Например, пружина задняя" required>
 <div class="actions"><button class="search" type="submit">Найти OEM</button></div>
 </form>
 <div class="result" role="status" aria-live="polite"></div>
 <div class="links"></div>
 <div class="notice">Если каталог не подтвердил применяемость именно по VIN, результат будет помечен «VIN не подтверждён». Аналоги не показываются.</div>
</section>`;
    document.body.appendChild(host);
    const toggle = root.querySelector('.toggle');
    const panel = root.querySelector('.panel');
    const close = root.querySelector('.close');
    const form = root.querySelector('form');
    const result = root.querySelector('.result');
    const links = root.querySelector('.links');
    const search = root.querySelector('.search');
    const vinInput = root.querySelector('#oem-vin');
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) vinInput.focus();
    });
    close.addEventListener('click', () => {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const vin = vinInput.value.trim().toUpperCase();
      const part = root.querySelector('#oem-part').value.trim();
      links.replaceChildren();
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        result.textContent = 'Проверьте VIN: нужно 17 символов без I, O, Q.';
        return;
      }
      if (!part) return;
      if (!window.garageLoginPassword) {
        result.textContent = 'Сначала войдите в GARAGE с паролем.';
        return;
      }
      search.disabled = true;
      result.textContent = 'Проверяю оригинальные каталоги…';
      try {
        const response = await fetch('/api/oem-search', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-garage-password': window.garageLoginPassword },
          body: JSON.stringify({ vin, part }),
          cache: 'no-store'
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Ошибка поиска');
        result.textContent = data.answer || 'Каталоги не вернули результат.';
        for (const source of (data.sources || []).slice(0, 4)) {
          try {
            const url = new URL(source.url);
            if (url.protocol !== 'https:' || !['exist.ru','elcats.ru','japancats.ru','eurospares.co.uk'].some(d => url.hostname === d || url.hostname.endsWith('.' + d))) continue;
            const a = document.createElement('a');
            a.href = url.href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Источник: ' + url.hostname;
            links.appendChild(a);
          } catch (_) { /* Ignore untrusted URL. */ }
        }
      } catch (error) {
        result.textContent = 'Не удалось проверить каталог: ' + (error.message || 'ошибка сети');
      } finally {
        search.disabled = false;
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
