# TikSTER

A simple tracker for exam papers being typed: subject, teacher, grade and status.
Teachers open the link and see the list (no account). Admins sign in with a name and password to edit.

Hosted on Cloudflare Pages (free), with a D1 database.

- `index.html` is the whole page (no build step).
- `functions/api/[[path]].js` is the small API: list papers (public), log in/out, add/edit/delete (admins only).
  The database table is created automatically on first use.

## Cloudflare settings (Pages project > Settings)
- Build: framework "None", no build command, output directory `/`.
- Bindings: D1 database, variable name `DB`.
- Variables and secrets (type Secret):
  - `ADMIN_USERS` = `sam:password1,mamma:password2` (name:password pairs, comma separated)
  - `SESSION_SECRET` = any long random string

## Adding an admin or changing a password
Edit `ADMIN_USERS` in the Pages settings, then redeploy (Deployments > ... > Retry deployment).
Changing `SESSION_SECRET` signs everyone out.
