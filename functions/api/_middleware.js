// Schützt alle CMS-Routen unter /api/*. Nur /api/login ist ohne Sitzung erreichbar.
// (/api/lead ist öffentlich und wird im Worker vor dieser Middleware behandelt.)
import { readSession, fail, missingEnv, sameOrigin } from '../../lib/cms.js';
import { hasDbAdmin } from '../../lib/db.js';

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // GITHUB_TOKEN ist nur Pflicht, solange die Inhalte nicht in Supabase liegen (Bild-Upload braucht ihn weiterhin)
  const required = ['CMS_USERS', 'CMS_SECRET'];
  if (!hasDbAdmin(env)) required.push('GITHUB_TOKEN');
  const missing = missingEnv(env, required);
  if (missing.length) {
    return fail('CMS ist noch nicht eingerichtet. Fehlende Variablen in Cloudflare: ' + missing.join(', '), 503);
  }

  // Schreibende Requests nur vom eigenen Admin (CSRF-Schutz)
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) {
    return fail('Ungültige Anfrage.', 403);
  }

  if (url.pathname === '/api/login') return next();

  const session = await readSession(request, env.CMS_SECRET);
  if (!session) return fail('Nicht angemeldet.', 401);
  data.user = session.user;
  data.sessionExp = session.exp;
  return next();
}
