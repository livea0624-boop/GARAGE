import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../public/',import.meta.url));
const chromePath = process.env.CHROME_BIN || ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>{
  try { readFileSync(path); return true; } catch { return false; }
});

test('real Chrome: mobile navigation, search and desktop layout',async()=>{
  assert.ok(chromePath,'Chrome must be installed on CI runner');
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://local').pathname;
    if (path.startsWith('/api/')) {
      const data=path==='/api/auth/status'?{configured:true}:
        path==='/api/auth/login'?{ok:true}:
        path==='/api/state'?(req.method==='PUT'?{ok:true,updatedAt:new Date().toISOString()}: {state:{},updatedAt:new Date().toISOString()}):
        {ok:true};
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify(data)); return;
    }
    const pathName=path==='/'?'/index.html':path;
    if (!/^\/(?:index\.html|garage-design-refresh\.css|garage-mobile-v8\.css|garage-mobile-v8\.js)$/.test(pathName)) {
      res.writeHead(404);res.end();return;
    }
    const asset=join(root,pathName.replace(/^\//,''));
    const mime=extname(asset)==='.css'?'text/css':extname(asset)==='.js'?'application/javascript':'text/html';
    res.writeHead(200,{'content-type':mime});
    res.end(readFileSync(asset));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:chromePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const consoleErrors=[];
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    page.on('pageerror',error=>consoleErrors.push(error.message));
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.locator('#garageMobileDock').waitFor({state:'visible',timeout:10000});
    // Login gate is part of the original app; complete mocked auth before testing navigation.
    await page.locator('#glogin').fill('mock-password');
    await page.locator('#gcb').click();
    await page.locator('#garageCloudGate').waitFor({state:'detached',timeout:10000});
    assert.equal(await page.locator('#garageMobileDock button[data-mobile-page]').count(),6);
    assert.equal(await page.locator('aside').isVisible(),false);
    assert.equal(await page.locator('#currentSellerSwitch').isVisible(),true);
    assert.equal(await page.locator('#globalSearch').isVisible(),true);
    await page.locator('#garageMobileDock [data-mobile-page="orders"]').click();
    assert.equal(await page.locator('#orders').evaluate(e=>e.classList.contains('active')),true);
    await page.locator('#garageMobileDock [data-mobile-page="more"]').click();
    assert.equal(await page.locator('#garageMobileMore').isVisible(),true);
    await page.locator('#garageMobileMore [data-mobile-page="history"]').click();
    assert.equal(await page.locator('#history').evaluate(e=>e.classList.contains('active')),true);
    assert.equal(await page.locator('#garageMobileMore').isVisible(),false);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=2,'horizontal mobile overflow '+overflow);

    await page.setViewportSize({width:1440,height:900});
    await page.waitForTimeout(200);
    assert.equal(await page.locator('aside').isVisible(),true);
    assert.equal(await page.locator('#garageMobileDock').isVisible(),false);
    const desktopOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(desktopOverflow<=2,'horizontal desktop overflow '+desktopOverflow);
    assert.ok(consoleErrors.filter(e=>!/fetch|network/i.test(e)).length<3,
      'Unexpected page script errors: '+consoleErrors.join(' | '));
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
