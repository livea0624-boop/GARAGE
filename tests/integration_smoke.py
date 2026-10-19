#!/usr/bin/env python3
"""Run the real Worker, local D1 and Chromium against disposable test data.

Requires Node/Wrangler installed for this checkout, Python Playwright and a
Chromium executable. This test never uses remote D1 or the normal local state.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
PORT = int(os.environ.get("GARAGE_INTEGRATION_PORT", "8790"))
INSPECTOR_PORT = int(os.environ.get("GARAGE_INTEGRATION_INSPECTOR_PORT", "9236"))
BASE = f"http://127.0.0.1:{PORT}"
ENV_FILE = Path("/workspace/.cloud-onboarding/garage/env.sh")
CHECKS = []
REDACTIONS = []


def clean(value):
    text = str(value)
    for secret in REDACTIONS:
        text = text.replace(secret, "[generated test credential]")
    return text


def check(name, condition=True):
    if not condition:
        raise AssertionError(name)
    CHECKS.append(name)


def credentials():
    pair = (secrets.token_urlsafe(24), secrets.token_urlsafe(24))
    REDACTIONS.extend(pair)
    return pair


def command(*args):
    executable = str(ROOT / "node_modules/.bin/wrangler")
    argv = [executable, *map(str, args)]
    if ENV_FILE.is_file():
        return ["bash", "-c", 'source "$1"; shift; exec "$@"', "garage-integration", str(ENV_FILE), *argv]
    return argv


def local_env():
    env = os.environ.copy()
    env.update(WRANGLER_SEND_METRICS="false", CLOUDFLARE_CF_FETCH_ENABLED="false", CI="true")
    return env


def api(path, method="GET", body=None, login=None, action=None):
    headers = {"content-type": "application/json"}
    if login:
        headers["x-garage-password"] = login
    if action:
        headers["x-garage-action-password"] = action
    request = Request(BASE + path, method=method, headers=headers,
                      data=json.dumps(body).encode() if body is not None else None)
    # Cloud environments may inject a proxy. Test traffic must remain localhost.
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(request, timeout=5) as response:
            payload = response.read()
            return response.status, json.loads(payload) if payload else None
    except HTTPError as error:
        return error.code, json.loads(error.read())


def free_port(port):
    with socket.socket() as listener:
        # A previous disposable phase can leave TIME_WAIT sockets after its
        # server exits. These are reusable and are not an occupied listener.
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listener.bind(("127.0.0.1", port))
        except OSError as error:
            raise RuntimeError(f"Test port {port} is occupied; choose a free GARAGE_INTEGRATION_PORT/INSPECTOR_PORT") from error


@contextmanager
def worker(state_directory):
    free_port(PORT)
    free_port(INSPECTOR_PORT)
    initialized = subprocess.run(command("d1", "execute", "garage-cloud-db", "--local", "--persist-to", state_directory,
                                         "--file", ROOT / "schema.sql"), cwd=ROOT, env=local_env(),
                                 capture_output=True, text=True, timeout=60)
    if initialized.returncode:
        raise RuntimeError("Local schema initialization failed: " + clean(initialized.stdout + initialized.stderr))
    with (state_directory / "worker.log").open("w+") as log:
        process = subprocess.Popen(command("dev", "--local", "--ip", "127.0.0.1", "--port", PORT,
                                           "--inspector-port", INSPECTOR_PORT, "--persist-to", state_directory),
                                   cwd=ROOT, env=local_env(), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + 45
            while True:
                if process.poll() is not None:
                    log.seek(0)
                    raise RuntimeError("Local Worker exited during startup: " + clean(log.read()[-6000:]))
                try:
                    if api("/api/auth/status")[0] == 200:
                        break
                except (URLError, OSError, TimeoutError):
                    pass
                if time.monotonic() >= deadline:
                    log.seek(0)
                    raise RuntimeError("Local Worker did not become ready: " + clean(log.read()[-6000:]))
                time.sleep(0.2)
            yield
        finally:
            # Only terminate the process group created above, including workerd.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)


def api_checks():
    login, action = credentials()
    check("fresh D1 has no passwords", api("/api/auth/status") == (200, {"configured": False}))
    check("state requires login", api("/api/state")[0] == 401)
    check("identical setup passwords rejected", api("/api/auth/setup", "POST", {"loginPassword": login, "actionPassword": login})[0] == 400)
    check("API password setup", api("/api/auth/setup", "POST", {"loginPassword": login, "actionPassword": action}) == (200, {"ok": True}))
    check("repeat setup rejected", api("/api/auth/setup", "POST", {"loginPassword": login, "actionPassword": action})[0] == 409)
    check("incorrect login rejected", api("/api/auth/login", "POST", {"password": secrets.token_urlsafe(20)})[0] == 401)
    check("correct API login", api("/api/auth/login", "POST", {"password": login}) == (200, {"ok": True}))
    check("empty state read", api("/api/state", login=login) == (200, {"state": None, "updatedAt": None}))
    initial = {"garageClients": json.dumps([{"id": "integration-client", "name": "API smoke", "phone": "000"}])}
    check("state version required", api("/api/state", "PUT", {"state": initial}, login)[0] == 428)
    check("invalid state version rejected", api("/api/state", "PUT", {"state": initial, "baseUpdatedAt": 42}, login)[0] == 400)
    status, saved = api("/api/state", "PUT", {"state": initial, "baseUpdatedAt": None}, login)
    check("first CAS write", status == 200 and isinstance(saved.get("updatedAt"), str))
    version = saved["updatedAt"]
    check("CAS readback", api("/api/state", login=login) == (200, {"state": initial, "updatedAt": version}))
    status, stale = api("/api/state", "PUT", {"state": initial, "baseUpdatedAt": None}, login)
    check("stale CAS write rejected with current state", status == 409 and stale.get("code") == "STATE_CONFLICT" and stale.get("state") == initial)
    wipe = {"state": {}, "baseUpdatedAt": version}
    check("deletion requires action password", api("/api/state", "PUT", wipe, login)[0] == 403)
    check("login password cannot authorize deletion", api("/api/state", "PUT", wipe, login, login)[0] == 403)
    check("denied deletion preserves D1", api("/api/state", login=login)[1]["state"] == initial)
    status, saved = api("/api/state", "PUT", wipe, login, action)
    check("action password authorizes deletion", status == 200)
    version = saved["updatedAt"]
    check("authorized wipe persisted", api("/api/state", login=login)[1]["state"] == {})
    replace = {"state": {}, "baseUpdatedAt": version, "operation": "replace"}
    check("explicit replacement requires action password", api("/api/state", "PUT", replace, login)[0] == 403)
    status, saved = api("/api/state", "PUT", replace, login, action)
    check("authorized replacement", status == 200)
    version = saved["updatedAt"]

    def concurrent_write(index):
        state = {"garageClients": json.dumps([{"id": f"race-{index}"}])}
        return api("/api/state", "PUT", {"state": state, "baseUpdatedAt": version}, login)[0]

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(concurrent_write, range(2)))
    check("simultaneous CAS writers cannot overwrite each other", sorted(statuses) == [200, 409])


def browser_checks():
    try:
        from playwright.sync_api import sync_playwright, expect
    except ImportError as error:
        raise RuntimeError("Install Python Playwright to run integration tests: python3 -m pip install playwright") from error
    chromium = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chromium:
        raise RuntimeError("Chromium is required; install it or set CHROMIUM_PATH")
    login, action = credentials()
    client_name = "Integration client " + secrets.token_hex(4)
    xss_seller = '<img src=x onerror="window.__garageXss=1">'
    browser_errors, console_errors, http_errors = [], [], []

    def attach(page):
        page.on("pageerror", lambda error: browser_errors.append(clean(error)))
        page.on("console", lambda message: console_errors.append({"text": clean(message.text), "location": message.location}) if message.type == "error" else None)
        page.on("response", lambda response: http_errors.append({"status": response.status, "url": response.url}) if response.status >= 400 else None)

    def logged_in(page, first=False):
        expect(page.locator("#garageCloudGate")).to_be_visible()
        if first:
            expect(page.locator("#gaction")).to_be_visible()
        else:
            expect(page.locator("#gaction")).to_be_hidden()
        page.locator("#glogin").fill(login)
        if first:
            page.locator("#gaction").fill(action)
        page.locator("#gcb").click()
        expect(page.locator("#garageCloudGate")).to_have_count(0)
        saved(page)

    def saved(page):
        page.wait_for_function("() => { const s=window.garageCloudSync?.getStatus(); return s?.ready && !s.dirty && !s.saving && !s.conflict; }", timeout=15000)

    def navigate(page, name):
        page.locator(f'.nav button[data-page="{name}"]').click()
        expect(page.locator(f"#{name}")).to_have_class("page active")

    def close_sellers(page):
        if page.locator("#sellerModal").is_visible():
            page.locator("#closeSellerModal").click()

    def create_client(page, name):
        navigate(page, "clients")
        page.locator("#clientsNewTop").click()
        page.locator("#clientName").fill(name)
        page.locator("#clientPhone").fill("+7 000 000-00-00")
        page.locator("#saveClientModal").click()
        expect(page.locator("#clientModal")).to_be_hidden()
        expect(page.locator("#clientsList .client-name", has_text=name)).to_have_count(1)
        saved(page)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=chromium, headless=True, args=["--no-sandbox", "--no-proxy-server"])
        try:
            first = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = first.new_page()
            attach(page)
            response = page.goto(BASE, wait_until="networkidle")
            check("split UI assets load", response.status == 200)
            logged_in(page, first=True)
            check("browser first-run password setup")
            second = browser.new_context(viewport={"width": 1280, "height": 900})
            other = second.new_page()
            attach(other)
            other.goto(BASE, wait_until="networkidle")
            logged_in(other)
            check("independent browser session login")
            sellers = page.locator("#currentSellerSwitch option").all_text_contents()
            check("default seller choices", len(sellers) >= 2)
            page.locator("#currentSellerSwitch").select_option(label=sellers[0])
            close_sellers(page)
            other.locator("#currentSellerSwitch").select_option(label=sellers[1])
            close_sellers(other)
            navigate(other, "clients")
            create_client(page, client_name)
            check("client creation through UI")
            expect(other.locator("#clientsList .client-name", has_text=client_name)).to_have_count(1, timeout=16000)
            check("real Worker polling synchronizes second session")
            expect(other.locator("#currentSellerSwitch")).to_have_value(sellers[1])
            expect(page.locator("#currentSellerSwitch")).to_have_value(sellers[0])
            check("selected sellers remain independent across synchronization")
            status, remote = api("/api/state", login=login)
            check("device preferences excluded from shared D1 state", status == 200 and "garageCurrentUser" not in remote["state"] and "garageInterfaceMode" not in remote["state"])
            other.reload(wait_until="networkidle")
            logged_in(other)
            navigate(other, "clients")
            expect(other.locator("#clientsList .client-name", has_text=client_name)).to_have_count(1)
            expect(other.locator("#currentSellerSwitch")).to_have_value(sellers[1])
            check("client and device seller persist after reload")

            page.evaluate("window.__garageXss=0")
            page.locator("#sellerManage").click()
            page.locator("#newSellerName").fill(xss_seller)
            page.locator("#addSeller").click()
            expect(page.locator("#sellerList img")).to_have_count(0)
            expect(page.locator("#sellerList")).to_contain_text(xss_seller)
            close_sellers(page)
            page.locator("#currentSellerSwitch").select_option(label=xss_seller)
            close_sellers(page)
            create_client(page, client_name + " escaped seller")
            expect(page.locator("#clientsList img")).to_have_count(0)
            check("seller HTML remains inert in manager and client cards", page.evaluate("window.__garageXss") == 0)

            navigate(page, "settings")
            page.locator('[data-interface-mode="mobile"]').click()
            expect(page.locator("body")).to_have_class(re.compile(r".*garage-mobile-mode.*"))
            nav = page.locator("aside").bounding_box()
            viewport = page.viewport_size
            check("forced mobile navigation is fixed at viewport bottom", nav and abs(nav["x"]) <= 2 and abs(nav["width"] - viewport["width"]) <= 2 and abs(nav["y"] + nav["height"] - viewport["height"]) <= 2)
            navigate(page, "clients")
            navigate(page, "settings")
            check("forced mobile navigation remains usable")
            page.locator('[data-interface-mode="auto"]').click()
            page.set_viewport_size({"width": 844, "height": 390})
            navigate(page, "clients")
            page.locator("#clientsNewTop").click()
            dialog = page.locator('#clientModal [role="dialog"]')
            expect(dialog).to_be_visible()
            box = dialog.bounding_box()
            check("landscape client dialog fits viewport", box and box["x"] >= -1 and box["y"] >= -1 and box["x"] + box["width"] <= 845 and box["y"] + box["height"] <= 391)
            page.locator("#clientVin").scroll_into_view_if_needed()
            button = page.locator("#saveClientModal").bounding_box()
            check("landscape client dialog keeps footer accessible", button and button["y"] >= 0 and button["y"] + button["height"] <= 391)
            page.locator("#cancelClientModal").click()
            expect(page.locator("#clientModal")).to_be_hidden()

            page.set_viewport_size({"width": 1440, "height": 1000})
            navigate(page, "settings")
            before_import = api("/api/state", login=login)[1]["state"]
            invalid_backup = {"format": "garage-local-backup-v2", "data": {
                "garageClients": json.dumps([{"id": "invalid-import", "name": 7}])
            }}
            with page.expect_file_chooser() as chooser:
                page.locator("#importGarageBackup").click()
            chooser.value.set_files({"name": "invalid-backup.json", "mimeType": "application/json",
                                     "buffer": json.dumps(invalid_backup).encode()})
            expect(page.locator(".garage-toast.error .garage-toast-text").last).to_contain_text("garageClients[0].name")
            expect(page.locator("#actionConfirmModal")).to_be_hidden()
            check("malformed backup rejected before confirmation or D1 mutation", api("/api/state", login=login)[1]["state"] == before_import)

            imported_name = "Imported integration client " + secrets.token_hex(4)
            imported_state = dict(before_import)
            imported_clients = json.loads(imported_state["garageClients"])
            imported_clients.append({"id": "import-" + secrets.token_hex(8), "name": imported_name, "phone": "000"})
            imported_state["garageClients"] = json.dumps(imported_clients)
            valid_backup = {"format": "garage-local-backup-v2", "data": imported_state}
            with page.expect_file_chooser() as chooser:
                page.locator("#importGarageBackup").click()
            chooser.value.set_files({"name": "valid-backup.json", "mimeType": "application/json",
                                     "buffer": json.dumps(valid_backup).encode()})
            expect(page.locator("#actionConfirmModal")).to_be_visible()
            page.locator("#confirmYes").click()
            expect(page.locator("#garageActionGate")).to_be_visible()
            check("backup replacement requests action password")
            page.locator("#gap").fill(action)
            with page.expect_navigation(wait_until="networkidle"):
                page.locator("#gav").click()
            logged_in(page)
            navigate(page, "clients")
            expect(page.locator("#clientsList .client-name", has_text=imported_name)).to_have_count(1)
            check("authenticated backup import survives server save and reload", api("/api/state", login=login)[1]["state"] == imported_state)
            rollback = page.evaluate("JSON.parse(localStorage.getItem('GARAGE_ROLLBACK_BACKUP')).data")
            check("successful import retains prior data as browser rollback copy", rollback == before_import)
            expect(page.locator("#currentSellerSwitch")).to_have_value(xss_seller)
            check("backup import preserves device seller preference")

            navigate(page, "settings")
            expect(page.locator("#exportPreviousGarageBackup")).to_be_visible()
            with page.expect_download() as pending_download:
                page.locator("#exportPreviousGarageBackup").click()
                expect(page.locator("#garageActionGate")).to_be_visible()
                check("rollback backup download requests action password")
                page.locator("#gap").fill(action)
                page.locator("#gav").click()
            download = pending_download.value
            downloaded_text = Path(download.path()).read_text()
            downloaded = json.loads(downloaded_text)
            previous_names = [client["name"] for client in json.loads(downloaded["data"]["garageClients"])]
            check("downloaded rollback contains original clients before import", client_name in previous_names and imported_name not in previous_names)
            check("downloaded rollback excludes credentials and device preferences",
                  login not in downloaded_text and action not in downloaded_text
                  and "garageCurrentUser" not in downloaded["data"] and "garageInterfaceMode" not in downloaded["data"]
                  and not any("password" in key.lower() for key in downloaded["data"]))

            # Legacy backups may contain only clients. Rendering fills seller
            # defaults; those writes must be confirmed before the success reload.
            minimal_name = "Minimal imported client " + secrets.token_hex(4)
            minimal_clients = [{"id": "minimal-" + secrets.token_hex(8), "name": minimal_name, "phone": "000"}]
            minimal_backup = {"format": "garage-local-backup-v2", "data": {
                "garageClients": json.dumps(minimal_clients)
            }}
            navigate(page, "settings")
            with page.expect_file_chooser() as chooser:
                page.locator("#importGarageBackup").click()
            chooser.value.set_files({"name": "minimal-clients-backup.json", "mimeType": "application/json",
                                     "buffer": json.dumps(minimal_backup).encode()})
            expect(page.locator("#actionConfirmModal")).to_be_visible()
            page.locator("#confirmYes").click()
            expect(page.locator("#garageActionGate")).to_be_visible()
            page.locator("#gap").fill(action)
            navigations = []

            def record_navigation(frame):
                if frame == page.main_frame:
                    navigations.append(frame.url)

            page.on("framenavigated", record_navigation)
            with page.expect_navigation(wait_until="networkidle"):
                page.locator("#gav").click()
            page.remove_listener("framenavigated", record_navigation)
            check("minimal clients-only import reloads exactly once", len(navigations) == 1)
            # Read D1 before logging back in so a later startup save cannot hide
            # a normalization write that the importer failed to await.
            minimal_remote = api("/api/state", login=login)[1]["state"]
            check("minimal backup normalization reaches D1 before reload",
                  json.loads(minimal_remote.get("garageClients", "[]")) == minimal_clients
                  and len(json.loads(minimal_remote.get("garageSellers", "[]"))) >= 2)
            logged_in(page)
            navigate(page, "clients")
            expect(page.locator("#clientsList .client-name", has_text=minimal_name)).to_have_count(1)
            expect(page.locator("#clientsList .client-card")).to_have_count(1)
            check("minimal imported data persists after reauthentication")
            check("no uncaught browser errors", not browser_errors)
            check("no failed browser HTTP responses", not http_errors)
            check("no browser console errors", not console_errors)
        finally:
            browser.close()
            if browser_errors or console_errors or http_errors:
                print(json.dumps({"browser_errors": browser_errors, "console_errors": console_errors, "http_errors": http_errors}, ensure_ascii=False))


def main():
    try:
        with tempfile.TemporaryDirectory(prefix="garage-integration-") as directory:
            temporary = Path(directory)
            api_state, browser_state = temporary / "api", temporary / "browser"
            api_state.mkdir()
            browser_state.mkdir()
            with worker(api_state):
                api_checks()
            with worker(browser_state):
                browser_checks()
        print(json.dumps({"passed": len(CHECKS), "checks": CHECKS}, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({"passed": len(CHECKS), "checks": CHECKS, "failure": clean(error)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
