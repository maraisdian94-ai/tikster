# TikSTER

A simple tracker for exam papers being typed: subject, teacher, grade and status.
Teachers open the link and see the list (no account). Admins sign in with a name and password to edit.

Runs as a Cloudflare Worker (free) with static assets and a D1 database.

- `public/index.html` is the whole page (no build step).
- `src/worker.js` sends `/api/*` to `src/api.js` and serves the page for everything else.
- `src/api.js`: list papers (public), log in/out, add/edit/delete (admins only). The table is created automatically.
- `wrangler.jsonc`: Worker config. The `tikster` D1 database is created on first deploy if missing.

## Cloudflare build settings
Build command: none. Deploy command: `npx wrangler deploy`. Root directory: `/`.

## Secrets (Worker > Settings > Variables and Secrets, type Secret)
- `ADMIN_USERS` = `sam:password1,mamma:password2` (name:password pairs, comma separated)
- `SESSION_SECRET` = any long random string

Changing a password: edit `ADMIN_USERS` and click Deploy. Changing `SESSION_SECRET` signs everyone out.

## Local test
Create `.dev.vars` with the two secrets, then `npx wrangler dev`.
