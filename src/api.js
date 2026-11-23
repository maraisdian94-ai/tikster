// TikSTER API (Cloudflare Worker + D1).
// Bindings / variables (Worker > Settings > Variables and Secrets):
//   DB             D1 database binding
//   ADMIN_USERS    secret, e.g.  "sam:long-password-1,mamma:long-password-2"
//   SESSION_SECRET secret, any long random string
const STATUSES = ["todo", "typing", "done", "collected"];
const DAY = 86400;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
}
function same(a, b) { // constant-time string compare
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function admins(env) {
  return String(env.ADMIN_USERS || "").split(",").map(p => p.trim()).filter(Boolean).map(p => {
    const i = p.indexOf(":"); return { name: p.slice(0, i).trim().toLowerCase(), pass: p.slice(i + 1) };
  }).filter(a => a.name && a.pass);
}
async function who(request, env) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)tik=([^;]+)/);
  if (!m || !env.SESSION_SECRET) return null;
  const [name, exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!name || !exp || !sig || Number(exp) < Date.now() / 1000) return null;
  if (!same(sig, await hmac(env.SESSION_SECRET, `${name}.${exp}`))) return null;
  return admins(env).some(a => a.name === name) ? name : null;
}
let ready = false;
async function init(db) {
  if (ready) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY, subject TEXT NOT NULL, teacher TEXT NOT NULL, grade TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo', note TEXT NOT NULL DEFAULT '', updatedAt INTEGER NOT NULL)`).run();
  ready = true;
}
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
function clean(p, partial) {
  const o = {};
  for (const [k, n] of [["subject", 80], ["teacher", 80], ["grade", 10], ["note", 140]])
    if (!partial || k in p) o[k] = clip(p[k], n);
  if (!partial || "status" in p) o.status = STATUSES.includes(p.status) ? p.status : "todo";
  if (!partial && (!o.subject || !o.teacher || !o.grade)) return null;
  return o;
}

export async function onRequest({ request, env, params }) {
  const path = (params.path || []).join("/");
  const method = request.method;
  if (!env.DB) return json({ error: "Database not connected (add the DB binding)." }, 500);
  await init(env.DB);

  if (path === "papers" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM papers").all();
    return json(results);
  }
  if (path === "me") return json({ admin: await who(request, env) });

  if (path === "login" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = clip(body.name, 40).toLowerCase(), pass = String(body.password || "");
    const ok = admins(env).find(a => a.name === name && same(a.pass, pass));
    if (!ok || !env.SESSION_SECRET) { await new Promise(r => setTimeout(r, 600)); return json({ error: "bad login" }, 401); }
    const exp = Math.floor(Date.now() / 1000) + 30 * DAY;
    const val = `${name}.${exp}.${await hmac(env.SESSION_SECRET, `${name}.${exp}`)}`;
    return json({ admin: name }, 200, { "set-cookie": `tik=${encodeURIComponent(val)}; Path=/; Max-Age=${30 * DAY}; HttpOnly; Secure; SameSite=Strict` });
  }
  if (path === "logout" && method === "POST")
    return json({ admin: null }, 200, { "set-cookie": "tik=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" });

  // Everything below changes data: admins only.
  if (!(await who(request, env))) return json({ error: "not signed in" }, 401);
  const now = Date.now();

  if (path === "papers" && method === "POST") {
    const body = await request.json().catch(() => null);
    const list = (Array.isArray(body) ? body : [body]).slice(0, 300).map(p => clean(p || {}, false));
    if (!list.length || list.some(p => !p)) return json({ error: "subject, teacher and grade are required" }, 400);
    const stmt = env.DB.prepare("INSERT INTO papers (id,subject,teacher,grade,status,note,updatedAt) VALUES (?,?,?,?,?,?,?)");
    await env.DB.batch(list.map(p => stmt.bind(crypto.randomUUID(), p.subject, p.teacher, p.grade, p.status, p.note, now)));
    return json({ added: list.length });
  }
  const m = path.match(/^papers\/([\w-]{1,64})$/);
  if (m && method === "PATCH") {
    const p = clean(await request.json().catch(() => ({})), true);
    const keys = Object.keys(p);
    if (!keys.length) return json({ error: "nothing to change" }, 400);
    await env.DB.prepare(`UPDATE papers SET ${keys.map(k => `${k}=?`).join(",")}, updatedAt=? WHERE id=?`)
      .bind(...keys.map(k => p[k]), now, m[1]).run();
    return json({ ok: true });
  }
  if (m && method === "DELETE") {
    await env.DB.prepare("DELETE FROM papers WHERE id=?").bind(m[1]).run();
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}
