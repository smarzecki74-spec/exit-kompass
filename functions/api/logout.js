import { json, clearCookie } from '../../lib/cms.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}
