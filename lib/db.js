/**
 * Supabase-Anbindung (REST/PostgREST, ohne SDK – läuft direkt im Cloudflare Worker).
 *
 * Variablen:
 *   SUPABASE_URL              in wrangler.jsonc (öffentlich)
 *   SUPABASE_PUBLISHABLE_KEY  in wrangler.jsonc (öffentlich, durch RLS abgesichert:
 *                             nur Leads anlegen + veröffentlichten Inhalt lesen)
 *   SUPABASE_SECRET_KEY       Geheimnis im Cloudflare-Dashboard (Supabase → Project Settings → API Keys →
 *                             Secret key bzw. service_role). Nötig fürs CMS-Speichern.
 *
 * Tabellen: leads, site_content, content_revisions, heartbeat (siehe supabase/migrations).
 */

export const CONTENT_KEY = 'main';

export function hasDb(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
}
export function hasDbAdmin(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
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

// ---------- Inhalte ----------
// admin=false: über den öffentlichen Key (Website), admin=true: über den Secret Key (CMS)
export async function loadContent(env, { admin = false } = {}) {
  const r = await rest(env, `site_content?key=eq.${CONTENT_KEY}&select=content,version,updated_at,updated_by`, { admin });
  if (!r.ok) return { ok: false, status: r.status, message: dbMessage(r) };
  const row = Array.isArray(r.data) ? r.data[0] : null;
  if (!row) return { ok: false, status: 404, message: 'Kein Inhalt in der Datenbank (site_content.main fehlt).' };
  return { ok: true, content: row.content, version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

// Gibt { ok, version } zurück; version === null bedeutet Konflikt (jemand war schneller).
export async function publishContent(env, content, expectedVersion, user, message) {
  const r = await rest(env, 'rpc/publish_content', {
    admin: true,
    method: 'POST',
    body: {
      p_key: CONTENT_KEY,
      p_content: content,
      p_expected_version: expectedVersion,
      p_user: user,
      p_message: message || null,
    },
  });
  if (!r.ok) return { ok: false, status: r.status, message: dbMessage(r) };
  return { ok: true, version: r.data === null ? null : Number(r.data) };
}

// ---------- Leads ----------
export async function insertLead(env, lead) {
  const r = await rest(env, 'leads', { method: 'POST', body: lead, prefer: 'return=minimal' });
  if (!r.ok) return { ok: false, status: r.status, message: dbMessage(r) };
  return { ok: true };
}
