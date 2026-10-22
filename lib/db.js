/**
 * Supabase-Anbindung für das Lead-Formular (REST/PostgREST, ohne SDK – läuft direkt im Cloudflare Worker).
 * Die Website-Inhalte liegen NICHT in Supabase, sondern in public/content.json (CMS = GitHub-Commits).
 *
 * Variablen:
 *   SUPABASE_URL              in wrangler.jsonc (öffentlich)
 *   SUPABASE_PUBLISHABLE_KEY  in wrangler.jsonc (öffentlich, durch RLS abgesichert: nur Leads anlegen)
 *
 * Tabelle: leads (siehe supabase/migrations).
 */

export function hasDb(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
}

async function rest(env, path, { admin = false, method = 'GET', body, prefer } = {}) {
  const key = admin ? env.SUPABASE_SECRET_KEY : env.SUPABASE_PUBLISHABLE_KEY;
  const headers = { apikey: key, Accept: 'application/json' };
  // Legacy-JWT-Keys brauchen zusätzlich den Authorization-Header; neue sb_-Keys nicht.
  if (key && key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { ok: res.ok, status: res.status, data };
}

function dbMessage(r) {
  return (r.data && (r.data.message || r.data.hint)) || `HTTP ${r.status}`;
}

// ---------- Leads ----------
export async function insertLead(env, lead) {
  const r = await rest(env, 'leads', { method: 'POST', body: lead, prefer: 'return=minimal' });
  if (!r.ok) return { ok: false, status: r.status, message: dbMessage(r) };
  return { ok: true };
}
