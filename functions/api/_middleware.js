// Schützt alle /api/*-Routen. Nur /api/login ist ohne Sitzung erreichbar.
import { readSession, fail, missingEnv, sameOrigin } from '../../lib/cms.js';

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  const missing = missingEnv(env, ['CMS_USERS', 'CMS_SECRET', 'GITHUB_TOKEN']);
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
