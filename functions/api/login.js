import { json, fail, parseUsers, verifyPassword, createSession, sessionCookie } from '../../lib/cms.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return fail('Ungültige Anfrage.'); }
  const user = String(body.user || '').trim().toLowerCase();
  const password = String(body.password || '');

  const users = parseUsers(env.CMS_USERS);
  const stored = users[user];
  // Immer rechnen, auch bei unbekanntem Benutzer (gleiche Antwortzeit)
  const ok = await verifyPassword(password, stored || 'pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');

  if (!stored || !ok) {
    await delay(900); // bremst Durchprobieren
    return fail('Benutzername oder Passwort falsch.', 401);
  }

  const token = await createSession(user, env.CMS_SECRET);
  return json({ ok: true, user }, 200, { 'Set-Cookie': sessionCookie(token) });
}
