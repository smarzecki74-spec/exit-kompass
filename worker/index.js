/**
 * Cloudflare Worker – liefert die statische Seite aus public/, die Inhalte (/content.json) aus Supabase
 * und das CMS-API unter /api/*.
 * Die API-Handler liegen in functions/api (gleiches Format wie Pages Functions),
 * damit das Projekt sowohl als Worker als auch als Pages-Projekt läuft.
 */
import { onRequest as middleware } from '../functions/api/_middleware.js';
import * as login from '../functions/api/login.js';
import * as logout from '../functions/api/logout.js';
import * as me from '../functions/api/me.js';
import * as content from '../functions/api/content.js';
import * as upload from '../functions/api/upload.js';
import * as lead from '../functions/api/lead.js';
import { fail } from '../lib/cms.js';
import { hasDb, hasDbAdmin, loadContent } from '../lib/db.js';

// CMS-Routen (hinter Login-Middleware)
const ROUTES = {
  '/api/login': login,
  '/api/logout': logout,
  '/api/me': me,
  '/api/content': content,
  '/api/upload': upload,
};

// Öffentliche Routen (ohne Login)
const PUBLIC_ROUTES = {
  '/api/lead': lead,
};

// Wie lange Cloudflare den Seiteninhalt aus der DB zwischenspeichert (Sekunden).
// Kurz halten: CMS-Änderungen sollen praktisch sofort live sein.
const CONTENT_EDGE_CACHE = 15;

// ---------- Inhalte: Supabase zuerst, sonst public/content.json ----------
// Die DB ist nur dann die Quelle, wenn das CMS auch in die DB schreibt (SUPABASE_SECRET_KEY gesetzt).
// Sonst liefe das CMS im GitHub-Modus und seine Änderungen wären auf der Seite unsichtbar.
function contentFromDb(env) {
  return hasDb(env) && hasDbAdmin(env);
}

async function getSiteContent(request, env, ctx) {
  if (contentFromDb(env)) {
    const cache = caches.default;
    const cacheKey = new Request(new URL('/__content-cache', request.url).toString());
    const hit = await cache.match(cacheKey);
    if (hit) return { content: await hit.json(), source: 'db-cache' };

    try {
      const r = await loadContent(env);
      if (r.ok) {
        const res = new Response(JSON.stringify(r.content), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CONTENT_EDGE_CACHE}` },
        });
        ctx.waitUntil(cache.put(cacheKey, res));
        return { content: r.content, source: 'db' };
      }
      console.error('[content] Supabase-Fehler', r.status, r.message);
    } catch (err) {
      console.error('[content] Supabase nicht erreichbar', err);
    }
  }
  // Fallback: Datei aus dem Repo
  const res = await env.ASSETS.fetch(new Request(new URL('/content.json', request.url)));
  if (!res.ok) return null;
  return { content: await res.json(), source: 'file' };
}

async function serveContentJson(request, env, ctx) {
  const c = await getSiteContent(request, env, ctx);
  if (!c) return env.ASSETS.fetch(request);
  return new Response(JSON.stringify(c.content), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Source': c.source,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ---------- Impressum/Datenschutz: Kontaktdaten aus den Inhalten serverseitig einsetzen ----------
const LEGAL_PAGES = /^\/(impressum|datenschutz)(\.html)?\/?$/;
const LABELS = {
  name: 'Name',
  street: 'Straße und Hausnummer',
  zipCity: 'PLZ und Ort',
  email: 'E-Mail-Adresse',
  phone: 'Telefonnummer',
  whatsapp: 'WhatsApp-Nummer',
};

function phoneDigits(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '49' + d.slice(1);
  return d.replace(/\D/g, '');
}

async function renderLegal(request, env, ctx) {
  const page = await env.ASSETS.fetch(request);
  if (!page.ok || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;

  let contact = {};
  try {
    const c = await getSiteContent(request, env, ctx);
    if (c && c.content) contact = c.content.contact || {};
  } catch {
    return page; // Fallback: statischer Text aus der HTML-Datei
  }
  const val = (k) => String(contact[k] == null ? '' : contact[k]).trim();

  const rewritten = new HTMLRewriter()
    .on('[data-contact-line]', {
      element(el) {
        if (!val(el.getAttribute('data-contact-line'))) el.remove();
      },
    })
    .on('[data-contact]', {
      element(el) {
        const key = el.getAttribute('data-contact');
        const v = val(key);
        if (!v) {
          if (el.hasAttribute('data-optional')) return el.remove();
          el.setInnerContent(
            `<span class="rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">[BITTE ERGÄNZEN: ${LABELS[key] || key}]</span>`,
            { html: true }
          );
          el.removeAttribute('href');
          return;
        }
        el.setInnerContent(v);
        const kind = el.getAttribute('data-href');
        if (kind === 'tel') el.setAttribute('href', 'tel:+' + phoneDigits(v));
        if (kind === 'wa') el.setAttribute('href', 'https://wa.me/' + phoneDigits(v));
        if (kind === 'mailto') el.setAttribute('href', 'mailto:' + v);
      },
    })
    .transform(page);

  const headers = new Headers(rewritten.headers);
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(rewritten.body, { status: rewritten.status, headers });
}

function pickHandler(mod, method) {
  const name = 'onRequest' + method.charAt(0) + method.slice(1).toLowerCase();
  return mod[name] || mod.onRequest || null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // Öffentliche API (Lead-Formular)
    if (PUBLIC_ROUTES[path]) {
      const handler = pickHandler(PUBLIC_ROUTES[path], request.method);
      if (!handler) return fail('Methode nicht erlaubt.', 405);
      try {
        return await handler({ request, env, data: {}, waitUntil: ctx.waitUntil.bind(ctx) });
      } catch (err) {
        console.error(err);
        return fail('Serverfehler.', 500);
      }
    }

    // CMS-API
    if (url.pathname.startsWith('/api/')) {
      const mod = ROUTES[path];
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

    if ((request.method === 'GET' || request.method === 'HEAD') && path === '/content.json') {
      return serveContentJson(request, env, ctx);
    }

    if (request.method === 'GET' && LEGAL_PAGES.test(url.pathname)) {
      return renderLegal(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
