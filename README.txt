GARAGE v2.0 — Cloudflare Workers Static Assets

Structure:
public/index.html = GARAGE v2.0
wrangler.jsonc = Cloudflare config (assets.directory = ./public)
package.json = Wrangler CLI

Cloudflare Workers Builds:
Build command: leave empty
Deploy command: npx wrangler deploy
Path: /

Only public/ is uploaded as static assets.
server.js is not required for this deployment.
