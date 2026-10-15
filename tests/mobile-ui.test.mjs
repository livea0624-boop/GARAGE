import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/garage-mobile-v8.css', import.meta.url), 'utf8');
const refinements = readFileSync(new URL('../public/garage-design-refresh.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/garage-mobile-v8.js', import.meta.url), 'utf8');

test('all new assets load without external paid services', () => {
  for (const asset of ['garage-design-refresh.css','garage-mobile-v8.css','garage-mobile-v8.js']) {
    assert.equal(html.split('/'+asset).length-1,1, asset);
  }
  assert.doesNotMatch(css+js+refinements,/openai|api-key|google-fonts|cdn\.|billing/ig);
});

test('original GARAGE sections remain available through main dock or more sheet', () => {
  const sections = [...html.matchAll(/<button[^>]+data-page="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(sections, ['home','clients','orders','deliveries','sales','history','settings']);
  const primary = js.match(/const PRIMARY = \[([\s\S]*?)\];/)[1];
  const secondary = js.match(/const SECONDARY = \[([\s\S]*?)\];/)[1];
  for (const page of sections) {
    assert.ok(primary.includes("'"+page+"'")||secondary.includes("'"+page+"'"), 'Missing page '+page);
  }
  assert.match(js,/link\.click\(\)/,'Navigation must reuse original GARAGE event handlers');
});

test('existing forced desktop/mobile selector knows the new mobile stylesheet', () => {
  assert.match(html,/MOBILE_STYLE_IDS[^\n]*'garage-mobile-v8'/);
  assert.match(html,/<link id="garage-mobile-v8" rel="stylesheet"/);
  assert.match(css, /body:not\(\.garage-desktop-mode\) aside\{display:none!important\}/);
  assert.match(css, /@media \(max-width:700px\)/);
});

test('mobile dock is fixed and mobile controls have accessible touch sizes', () => {
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css,/min-height:54px!important/);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(js,/aria-current/);
  assert.match(js,/aria-expanded/);
  assert.match(js,/event\.key==='Escape'/);
  assert.match(js,/event\.key==='Tab'/);
});
