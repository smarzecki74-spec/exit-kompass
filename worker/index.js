/**
 * Cloudflare Worker – liefert die statische Seite aus public/ und das CMS-API unter /api/*.
 * Die API-Handler liegen in functions/api (gleiches Format wie Pages Functions),
 * damit das Projekt sowohl als Worker als auch als Pages-Projekt läuft.
 */
import { onRequest as middleware } from '../functions/api/_middleware.js';
import * as login from '../functions/api/login.js';
import * as logout from '../functions/api/logout.js';
import * as me from '../functions/api/me.js';
import * as content from '../functions/api/content.js';
import * as upload from '../functions/api/upload.js';
import { fail } from '../lib/cms.js';

const ROUTES = {
  '/api/login': login,
  '/api/logout': logout,
  '/api/me': me,
  '/api/content': content,
  '/api/upload': upload,
};

function pickHandler(mod, method) {
  const name = 'onRequest' + method.charAt(0) + method.slice(1).toLowerCase();
  return mod[name] || mod.onRequest || null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const mod = ROUTES[url.pathname.replace(/\/+$/, '')];
      if (!mod) return fail('Nicht gefunden.', 404);
      const handler = pickHandler(mod, request.method);
      if (!handler) return fail('Methode nicht erlaubt.', 405);

      const data = {};
      const context = {
        request,
        env,
        data,
        waitUntil: ctx.waitUntil.bind(ctx),
        next: () => handler({ request, env, data, waitUntil: context.waitUntil }),
      };
      try {
        return await middleware(context);
      } catch (err) {
        console.error(err);
        return fail('Serverfehler: ' + (err && err.message ? err.message : 'unbekannt'), 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
