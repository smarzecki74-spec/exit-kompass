// CMS-Inhalte.
// Mit Supabase (SUPABASE_URL + SUPABASE_SECRET_KEY gesetzt): Inhalte liegen in site_content,
//   Veröffentlichen ist sofort live, jede Version landet in content_revisions.
// Ohne Supabase (Fallback): content.json im GitHub-Repo, Veröffentlichen = Commit → Auto-Deploy.
//
// GET: { content, sha, mode }   – "sha" ist die Versionskennung (DB: "v<Nummer>", GitHub: Datei-SHA)
// PUT: { content, sha, message? }
import { json, fail, config, readFile, writeFile, ghError } from '../../lib/cms.js';
import { hasDbAdmin, loadContent, publishContent } from '../../lib/db.js';

const MAX_BYTES = 512 * 1024;
const CONFLICT_MSG = 'Inzwischen wurde eine neuere Version gespeichert. Bitte Seite neu laden, deine Änderungen bleiben als Entwurf erhalten.';

export async function onRequestGet({ env }) {
  if (hasDbAdmin(env)) {
    const r = await loadContent(env, { admin: true });
    if (!r.ok) return fail('Datenbank-Fehler: ' + r.message, 502);
    return json({ ok: true, content: r.content, sha: 'v' + r.version, mode: 'db', updatedAt: r.updatedAt, updatedBy: r.updatedBy });
  }

  const { contentPath } = config(env);
  const r = await readFile(env, contentPath);
  if (!r.ok) return ghError(r);
  let content;
  try { content = JSON.parse(r.text); } catch { return fail('content.json im Repo ist kein gültiges JSON.', 500); }
  return json({ ok: true, content, sha: r.sha, mode: 'github' });
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

  if (hasDbAdmin(env)) {
    const m = /^v(\d+)$/.exec(sha);
    if (!m) return fail(CONFLICT_MSG, 409); // Entwurf stammt noch aus der GitHub-Zeit
    const r = await publishContent(env, content, parseInt(m[1], 10), data.user, note || null);
    if (!r.ok) return fail('Datenbank-Fehler: ' + r.message, 502);
    if (r.version === null) return fail(CONFLICT_MSG, 409);
    return json({ ok: true, sha: 'v' + r.version, mode: 'db' });
  }

  const message = `CMS: Inhalte aktualisiert von ${data.user}` + (note ? ` – ${note}` : '');
  const { contentPath } = config(env);
  const r = await writeFile(env, contentPath, bytes, { message, sha, user: data.user });
  if (!r.ok) return ghError(r);
  return json({ ok: true, sha: r.sha, commit: r.commit, mode: 'github' });
}
