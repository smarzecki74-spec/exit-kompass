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

// ---------- Impressum/Datenschutz: Kontaktdaten aus content.json serverseitig einsetzen ----------
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

async function renderLegal(request, env) {
  const page = await env.ASSETS.fetch(request);
  if (!page.ok || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;

  let contact = {};
  try {
    const res = await env.ASSETS.fetch(new Request(new URL('/content.json', request.url)));
    if (res.ok) contact = (await res.json()).contact || {};
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

    if (request.method === 'GET' && LEGAL_PAGES.test(url.pathname)) {
      return renderLegal(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
