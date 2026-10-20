// POST multipart/form-data mit Feld "file" → Bild ins Repo (public/assets/img/…)
// Antwort: { path: "/assets/img/…" } – sichtbar auf der Live-Seite nach dem nächsten Deploy.
import { json, fail, config, writeFile, ghError } from '../../lib/cms.js';

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

function slug(name) {
  return String(name || 'bild')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'bild';
}

export async function onRequestPost({ request, env, data }) {
  let form;
  try { form = await request.formData(); } catch { return fail('Ungültiger Upload.'); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return fail('Keine Datei erhalten.');

  const ext = TYPES[file.type];
  if (!ext) return fail('Nur JPG, PNG, WebP oder AVIF erlaubt.');
  if (file.size > MAX_BYTES) return fail('Bild ist größer als 4 MB.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.getRandomValues(new Uint8Array(3)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  const name = `${slug(form.get('name') || file.name)}-${stamp}-${rand}.${ext}`;

  const { uploadDir } = config(env);
  const repoPath = `${uploadDir}/${name}`;
  const r = await writeFile(env, repoPath, bytes, { message: `CMS: Bild hochgeladen von ${data.user} (${name})`, user: data.user });
  if (!r.ok) return ghError(r);

  const publicPath = '/' + repoPath.replace(/^public\//, '');
  return json({ ok: true, path: publicPath, commit: r.commit });
}
