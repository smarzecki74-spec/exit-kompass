// POST /api/lead – öffentlicher Endpunkt für das E-Book-Formular (keine Anmeldung nötig).
// Body (JSON, auch als text/plain per sendBeacon): { name, phone, source, page, consent, consentText, website }
// Speichert den Lead in Supabase (Tabelle leads, nur Insert über den öffentlichen Key + RLS).
import { json, fail } from '../../lib/cms.js';
import { hasDb, insertLead } from '../../lib/db.js';

const MAX_BODY = 4 * 1024;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return '+' + d.slice(1).replace(/\D/g, '');
  if (d.startsWith('00')) return '+' + d.slice(2);
  if (d.startsWith('0')) return '+49' + d.slice(1);
  return '+' + d;
}

export async function onRequestPost({ request, env }) {
  // Nur Anfragen von der eigenen Seite
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return fail('Ungültige Anfrage.', 403);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail('Anfrage zu groß.', 413);

  let data;
  try { data = JSON.parse(raw || '{}'); } catch { return fail('Ungültige Anfrage.'); }
  if (!data || typeof data !== 'object') return fail('Ungültige Anfrage.');

  // Honeypot: Bots bekommen ein "ok", es wird aber nichts gespeichert
  if (data.website) return json({ ok: true });

  const name = clean(data.name, 60);
  const phone = normalizePhone(clean(data.phone, 25));
  if (name.length < 2) return fail('Bitte gib deinen Vornamen ein.');
  if (!/^\+\d{8,15}$/.test(phone)) return fail('Bitte gib eine gültige Mobilnummer ein.');
  if (data.consent !== true) return fail('Einwilligung fehlt.');

  if (!hasDb(env)) {
    console.error('[lead] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY fehlen – Lead nicht gespeichert.');
    return fail('Speichern ist gerade nicht möglich.', 503);
  }

  let page = clean(data.page, 300);
  try { const p = new URL(page); page = p.origin + p.pathname + p.search; } catch { page = ''; }

  const r = await insertLead(env, {
    name,
    phone,
    source: clean(data.source, 20) || null,
    page: page || null,
    consent: true,
    consent_text: clean(data.consentText, 600) || null,
  });
  if (!r.ok) {
    console.error('[lead] Supabase-Fehler', r.status, r.message);
    return fail('Speichern ist gerade nicht möglich.', 502);
  }
  return json({ ok: true });
}
