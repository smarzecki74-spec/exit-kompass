/**
 * Mini-CMS – gemeinsame Helfer für die Cloudflare Pages Functions.
 *
 * Keine Datenbank: Inhalte liegen als JSON im GitHub-Repo, gespeichert wird per GitHub-API,
 * Cloudflare Pages baut nach jedem Commit automatisch neu.
 *
 * Umgebungsvariablen (Cloudflare → Pages-Projekt → Einstellungen → Variablen und Geheimnisse):
 *   CMS_USERS      Pflicht. "name:hash,name:hash"  (Hash mit `npm run cms:hash` erzeugen)
 *   CMS_SECRET     Pflicht. Zufälliger String ≥ 32 Zeichen (signiert die Sitzungs-Cookies)
 *   GITHUB_TOKEN   Pflicht. Fine-grained Token, nur dieses Repo, Contents: Read and write
 *   GITHUB_REPO    optional, Standard: smarzecki74-spec/exit-kompass
 *   GITHUB_BRANCH  optional, Standard: main
 *   CMS_CONTENT    optional, Standard: public/content.json
 *   CMS_UPLOADS    optional, Standard: public/assets/img   (öffentlicher Pfad = ohne "public")
 *   GITHUB_API     optional, nur für lokale Tests (Mock-Server)
 */

export const COOKIE = 'cms_session';
const SESSION_HOURS = 8;
const enc = new TextEncoder();

export function config(env) {
  return {
    repo: env.GITHUB_REPO || 'smarzecki74-spec/exit-kompass',
    branch: env.GITHUB_BRANCH || 'main',
    contentPath: env.CMS_CONTENT || 'public/content.json',
    uploadDir: (env.CMS_UPLOADS || 'public/assets/img').replace(/\/+$/, ''),
  };
}

export function missingEnv(env, keys) {
  return keys.filter((k) => !env[k] || String(env[k]).trim() === '');
}

// ---------- Antworten ----------
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
export function fail(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

// ---------- Base64 ----------
export function b64encodeBytes(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
export function b64decodeBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64url(bytes) {
  return b64encodeBytes(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return b64decodeBytes(s);
}

// Längen-unabhängiger Vergleich (gegen Timing-Angriffe)
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------- Benutzer & Passwörter ----------
// Format je Benutzer: name:pbkdf2_sha256$<iterationen>$<salt base64>$<hash base64>
export function parseUsers(raw) {
  const users = {};
  String(raw || '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const i = entry.indexOf(':');
      if (i > 0) users[entry.slice(0, i).trim().toLowerCase()] = entry.slice(i + 1).trim();
    });
  return users;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(parts[1], 10);
  if (!iterations || iterations > 100000) return false; // Workers-Limit
  const salt = b64decodeBytes(parts[2]);
  const expected = b64decodeBytes(parts[3]);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    expected.length * 8
  );
  return safeEqual(new Uint8Array(bits), expected);
}

// ---------- Sitzung (signiertes Cookie, kein Server-Speicher nötig) ----------
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSession(user, secret) {
  const payload = b64url(enc.encode(JSON.stringify({ u: user, exp: Date.now() + SESSION_HOURS * 3600 * 1000 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return payload + '.' + b64url(new Uint8Array(sig));
}

export async function readSession(request, secret) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!match) return null;
  const [payload, sig] = match[1].split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (!data.exp || data.exp < Date.now()) return null;
    return { user: data.u, exp: data.exp };
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Schutz gegen Cross-Site-Requests: gleicher Origin + eigener Header
export function sameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return false;
  return request.headers.get('X-CMS') === '1';
}

// ---------- GitHub ----------
async function gh(env, path, init = {}) {
  const { repo } = config(env);
  const base = (env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
  const res = await fetch(`${base}/repos/${repo}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mini-cms',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch { /* leer */ }
  return { status: res.status, ok: res.ok, data };
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

export async function readFile(env, filePath) {
  const { branch } = config(env);
  const r = await gh(env, `/contents/${encodePath(filePath)}?ref=${encodeURIComponent(branch)}`);
  if (!r.ok) return { ok: false, status: r.status, message: (r.data && r.data.message) || 'GitHub-Fehler' };
  const text = new TextDecoder().decode(b64decodeBytes(r.data.content || ''));
  return { ok: true, sha: r.data.sha, text };
}

export async function writeFile(env, filePath, bytes, { message, sha, user }) {
  const { branch } = config(env);
  const body = {
    message,
    content: b64encodeBytes(bytes),
    branch,
    committer: { name: `CMS (${user})`, email: 'cms@users.noreply.github.com' },
  };
  if (sha) body.sha = sha;
  const r = await gh(env, `/contents/${encodePath(filePath)}`, { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) return { ok: false, status: r.status, message: (r.data && r.data.message) || 'GitHub-Fehler' };
  return { ok: true, sha: r.data.content && r.data.content.sha, commit: r.data.commit && r.data.commit.sha };
}

export function ghError(r) {
  if (r.status === 401) return fail('GitHub-Token ungültig oder abgelaufen (GITHUB_TOKEN prüfen).', 502);
  if (r.status === 403) return fail('GitHub-Token hat keine Schreibrechte auf das Repo.', 502);
  if (r.status === 404) return fail('Datei oder Repo auf GitHub nicht gefunden (GITHUB_REPO/Pfad prüfen).', 502);
  if (r.status === 409 || r.status === 422) {
    return fail('Inzwischen wurde eine neuere Version gespeichert. Bitte Seite neu laden, deine Änderungen bleiben als Entwurf erhalten.', 409);
  }
  return fail('GitHub-Fehler: ' + r.message, 502);
}
