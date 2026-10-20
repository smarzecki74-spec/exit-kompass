// GET: aktuelle content.json direkt aus GitHub (nicht aus dem Cache der Live-Seite)
// PUT: { content, sha, message? } → Commit auf den Branch → Cloudflare deployt automatisch
import { json, fail, config, readFile, writeFile, ghError } from '../../lib/cms.js';

const MAX_BYTES = 512 * 1024;

export async function onRequestGet({ env }) {
  const { contentPath } = config(env);
  const r = await readFile(env, contentPath);
  if (!r.ok) return ghError(r);
  let content;
  try { content = JSON.parse(r.text); } catch { return fail('content.json im Repo ist kein gültiges JSON.', 500); }
  return json({ ok: true, content, sha: r.sha });
}

export async function onRequestPut({ request, env, data }) {
  let body;
  try { body = await request.json(); } catch { return fail('Ungültige Anfrage.'); }
  const { content, sha } = body || {};
  if (!content || typeof content !== 'object' || Array.isArray(content)) return fail('Inhalt fehlt oder ist ungültig.');
  if (!sha || typeof sha !== 'string') return fail('Versionskennung fehlt – bitte Seite neu laden.');

  const text = JSON.stringify(content, null, 2) + '\n';
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_BYTES) return fail('Inhalt ist zu groß.');

  const note = String(body.message || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  const message = `CMS: Inhalte aktualisiert von ${data.user}` + (note ? ` – ${note}` : '');

  const { contentPath } = config(env);
  const r = await writeFile(env, contentPath, bytes, { message, sha, user: data.user });
  if (!r.ok) return ghError(r);
  return json({ ok: true, sha: r.sha, commit: r.commit });
}
