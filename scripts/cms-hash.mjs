#!/usr/bin/env node
/**
 * Erzeugt Passwort-Hashes für das CMS (Variable CMS_USERS in Cloudflare).
 *
 *   npm run cms:hash -- sebastian collin              → generiert sichere Zufallspasswörter
 *   npm run cms:hash -- 'sebastian=MeinPasswort'      → eigenes Passwort
 *   npm run cms:hash -- sebastian collin --secret     → zusätzlich einen neuen CMS_SECRET
 *
 * Ausgabe: fertiger Wert für CMS_USERS (name:hash,name:hash)
 */
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 100000; // Maximum, das Cloudflare Workers für PBKDF2 erlaubt

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

function randomPassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2_sha256$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

const args = process.argv.slice(2);
const wantSecret = args.includes('--secret');
const rest = args.filter((a) => a !== '--secret');

if (!rest.length && !wantSecret) {
  console.log("Benutzung: npm run cms:hash -- <name>[=passwort] [<name>[=passwort] …] [--secret]");
  process.exit(1);
}

const entries = [];
for (const arg of rest) {
  const i = arg.indexOf('=');
  const name = (i === -1 ? arg : arg.slice(0, i)).trim().toLowerCase();
  let pw = i === -1 ? '' : arg.slice(i + 1);
  if (!/^[a-z0-9._-]{2,32}$/.test(name)) {
    console.error(`Ungültiger Benutzername: ${name} (erlaubt: a-z, 0-9, . _ -)`);
    process.exit(1);
  }
  const generated = !pw;
  if (generated) pw = randomPassword();
  if (pw.length < 10) {
    console.error(`Passwort für ${name} ist zu kurz (mindestens 10 Zeichen).`);
    process.exit(1);
  }
  entries.push({ name, pw, generated, hash: await hash(pw) });
}

if (entries.length) {
  console.log('\nZugangsdaten:');
  for (const e of entries) console.log(`  ${e.name.padEnd(12)} ${e.generated ? e.pw + '   (generiert)' : '(eigenes Passwort)'}`);
  console.log('\nCMS_USERS (in Cloudflare als Geheimnis eintragen):\n');
  console.log(entries.map((e) => `${e.name}:${e.hash}`).join(','));
}
if (wantSecret) {
  console.log('\nCMS_SECRET (in Cloudflare als Geheimnis eintragen):\n');
  console.log(b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, ''));
}
console.log('');
