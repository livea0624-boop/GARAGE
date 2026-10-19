#!/usr/bin/env python3
"""Chromium UI regressions with a disposable static server and in-memory API.

No Worker, D1 or deployed URL is contacted. Requires Python Playwright and Chromium.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import threading
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CHECKS = []


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def check(name, value=True):
    if not value:
        raise AssertionError(name)
    CHECKS.append(name)


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'public')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    state = None
    version = 0
    errors = []
    requests = []
    action_denials = 0
    action_password = 'isolated-ui-action-password'

    def intercept(route):
        nonlocal state, version, action_denials
        request = route.request
        path = urlparse(request.url).path
        requests.append(path)
        if not request.url.startswith(base + '/'):
            route.abort()
            errors.append('Unexpected network request')
            return
        if not path.startswith('/api/'):
            route.continue_()
            return
        status = 200
        if path == '/api/auth/status':
            result = {'configured': True}
        elif path == '/api/auth/action' and request.post_data_json.get('password') != action_password:
            action_denials += 1
            status = 401
            result = {'error': 'Неверный пароль действий.'}
        elif path == '/api/state':
            if request.method == 'PUT':
                state = request.post_data_json['state']
                version += 1
                result = {'ok': True, 'updatedAt': str(version)}
            else:
                result = {'state': state, 'updatedAt': str(version) if version else None}
        else:
            result = {'ok': True}
        route.fulfill(status=status, content_type='application/json', body=json.dumps(result))

    def expected_action_denial(url, status):
        return url == base + '/api/auth/action' and status == 401

    def console_error(message):
        if message.type != 'error':
            return
        if (message.location.get('url') == base + '/api/auth/action'
                and message.text == 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'):
            return
        errors.append(message.text)

    chromium = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not chromium:
        raise RuntimeError('Chromium is required; install it or set CHROMIUM_PATH')
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=chromium, headless=True, args=['--no-sandbox', '--no-proxy-server'])
            try:
                context = browser.new_context(viewport={'width': 1280, 'height': 900})
                context.route('**/*', intercept)
                page = context.new_page()
                file_choosers = []
                page.on('filechooser', lambda chooser: file_choosers.append(chooser))
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', console_error)
                page.on('response', lambda response: errors.append(f'HTTP {response.status}: {urlparse(response.url).path}') if response.status >= 400 and not expected_action_denial(response.url, response.status) else None)
                page.goto(base, wait_until='networkidle')
                expect(page.locator('#garageCloudGate [role="dialog"]')).to_be_visible()
                check('login dialog has an accessible name', page.locator('#garageCloudGate [role="dialog"]').get_attribute('aria-labelledby'))
                expect(page.locator('#gaction')).to_be_hidden()
                expect(page.locator('#garageCloudGate input[type="password"]:visible')).to_have_count(1)
                expect(page.locator('#garageActionGate')).to_have_count(0)
                check('configured site opening asks only for the login password')
                page.locator('#glogin').fill('isolated-ui-test')
                page.locator('#glogin').press('Enter')
                expect(page.locator('#garageCloudGate')).to_have_count(0)
                page.wait_for_function('() => { const s=window.garageCloudSync?.getStatus(); return s?.ready && !s.dirty && !s.saving && !s.conflict; }')
                expect(page.locator('#garageActionGate')).to_have_count(0)
                check('login and initial synchronization do not ask for an action password', '/api/auth/action' not in requests)
                check('login works with Enter')
                expect(page.locator('aside')).to_be_visible()
                page.locator('#newClient').click()
                dialog = page.locator('#clientModal [role="dialog"]')
                expect(dialog).to_be_visible()
                expect(page.locator('#clientName')).to_be_focused()
                check('opening dialog focuses the first form field')
                check('client field has an associated label', page.locator('label[for="clientName"]').inner_text() == 'ФИО')
                page.locator('#closeClientModal').focus()
                page.keyboard.press('Shift+Tab')
                expect(page.locator('#saveClientModal')).to_be_focused()
                page.keyboard.press('Tab')
                expect(page.locator('#closeClientModal')).to_be_focused()
                check('Tab and Shift+Tab stay inside dialog')
                check('background is inert while dialog is open', page.locator('.app').evaluate('(el)=>el.inert'))
                page.keyboard.press('Escape')
                expect(page.locator('#clientModal')).to_be_hidden()
                expect(page.locator('#newClient')).to_be_focused()
                check('Escape closes dialog and restores opener focus')
                check('background becomes interactive again', not page.locator('.app').evaluate('(el)=>el.inert'))

                # Open a real nested confirmation using an existing seller, then cancel.
                page.locator('#sellerManage').click()
                page.locator('#sellerList [data-delete]').first.click()
                expect(page.locator('#actionConfirmModal')).to_be_visible()
                check('nested confirmation is painted above its parent dialog', page.locator('#confirmNo').evaluate('(el)=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'))
                page.keyboard.press('Escape')
                expect(page.locator('#actionConfirmModal')).to_be_hidden()
                expect(page.locator('#sellerModal')).to_be_visible()
                check('Escape closes only the nested dialog', page.locator('#sellerModal').evaluate('(el)=>el.contains(document.activeElement)'))
                page.keyboard.press('Escape')
                expect(page.locator('#sellerModal')).to_be_hidden()

                # Dynamic password prompts preserve their cancellation Promise.
                page.evaluate('() => { window.__actionResult="waiting"; window.garageRequestActionPassword().then(value=>window.__actionResult=value); }')
                expect(page.locator('#garageActionGate [role="dialog"]')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.locator('#garageActionGate')).to_have_count(0)
                check('Escape cancels password prompt without stranding the operation', page.evaluate('window.__actionResult') is False)

                page.locator('.nav [data-page="settings"]').click()
                check('pointer clicks do not add the removed three-pixel focus outline', page.locator('.nav [data-page="settings"]').evaluate('(el)=>{const s=getComputedStyle(el);return s.outlineWidth!=="3px"||s.outlineStyle==="none"}'))

                before_import = json.dumps(state, sort_keys=True)
                before_choosers = len(file_choosers)
                page.locator('#importGarageBackup').click()
                expect(page.locator('#garageActionGate')).to_be_visible()
                check('import asks for action password before opening a file chooser', len(file_choosers) == before_choosers)
                page.locator('#gac').click()
                expect(page.locator('#garageActionGate')).to_have_count(0)
                check('cancelling import authentication opens no chooser and preserves data', len(file_choosers) == before_choosers and json.dumps(state, sort_keys=True) == before_import)

                page.locator('#importGarageBackup').click()
                expect(page.locator('#garageActionGate')).to_be_visible()
                page.locator('#gap').fill('incorrect-action-password')
                page.locator('#gav').click()
                expect(page.locator('#gae')).to_contain_text('Неверный пароль действий.')
                check('incorrect import password opens no chooser and preserves data', action_denials == 1 and len(file_choosers) == before_choosers and json.dumps(state, sort_keys=True) == before_import)
                page.locator('#gac').click()
                expect(page.locator('#garageActionGate')).to_have_count(0)

                page.locator('#importGarageBackup').click()
                expect(page.locator('#garageActionGate')).to_be_visible()
                page.locator('#gap').fill(action_password)
                with page.expect_file_chooser() as chooser:
                    page.locator('#gav').click()
                expect(page.locator('#garageActionGate')).to_have_count(0)
                chooser.value.set_files([])
                check('correct import password opens the file chooser once', len(file_choosers) == before_choosers + 1)
                check('cancelling the file chooser does not change data', json.dumps(state, sort_keys=True) == before_import)

                page.locator('[data-interface-mode="mobile"]').click()
                box = page.locator('aside').bounding_box()
                check('forced mobile navigation stays visible on desktop', box and abs(box['y'] + box['height'] - 900) <= 2)
                page.locator('.nav [data-page="clients"]').click()
                expect(page.locator('#clients')).to_have_class('page active')
                check('forced mobile navigation switches pages')
                page.locator('.nav [data-page="settings"]').click()
                page.locator('[data-interface-mode="auto"]').click()
                for width, height, mode in [(390, 844, 'auto'), (390, 844, 'mobile'), (844, 390, 'auto'), (844, 390, 'mobile')]:
                    page.set_viewport_size({'width': width, 'height': height})
                    page.evaluate('(mode)=>garageInterfaceMode.set(mode)', mode)
                    expect(page.locator('aside')).to_be_visible()
                    page.locator('.nav [data-page="clients"]').click()
                    page.locator('#clientsNewTop').click()
                    expect(dialog).to_be_visible()
                    box = dialog.bounding_box()
                    check(f'{width}x{height} {mode}: dialog fits viewport', box and box['x'] >= -1 and box['y'] >= -1 and box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1)
                    for selector in ('#closeClientModal', '#saveClientModal'):
                        box = page.locator(selector).bounding_box()
                        check(f'{width}x{height} {mode}: {selector} remains reachable', box and box['y'] >= 0 and box['y'] + box['height'] <= height + 1)
                    page.keyboard.press('Escape')
                    expect(page.locator('#clientModal')).to_be_hidden()
                check('all static and API requests stayed on the disposable local server', all(path.startswith('/') for path in requests))
                check('no browser errors or failed assets', not errors)
            finally:
                browser.close()
        print(json.dumps({'passed': len(CHECKS), 'checks': CHECKS}, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({'passed': len(CHECKS), 'checks': CHECKS, 'failure': str(error), 'browser_errors': errors}, ensure_ascii=False))
        return 1
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    raise SystemExit(main())
