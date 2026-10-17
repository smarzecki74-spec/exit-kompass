// Erzeugt public/assets/icons.js aus lucide-static.
// Nur bei neuen Icons nötig: `npm run icons`
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Schlüssel = Name, wie er in content.json steht (Material-Symbols-Namen bleiben kompatibel)
const MAP = {
  account_balance: 'landmark',
  gavel: 'gavel',
  flight_takeoff: 'plane-takeoff',
  shield: 'shield-check',
  trending_up: 'trending-up',
  palms: 'tree-palm',
  explore: 'compass',
  check_circle: 'circle-check',
  person: 'user',
  chat: 'message-circle',
  lock: 'lock',
  arrow_forward: 'arrow-right',
  close: 'x',
  expand_more: 'chevron-down',
  star: 'star',
  quote: 'quote',
  public: 'globe',
  balance: 'scale',
};

const out = {};
for (const [key, file] of Object.entries(MAP)) {
  const svg = readFileSync(join(root, 'node_modules/lucide-static/icons', `${file}.svg`), 'utf8');
  // Nur den inneren Teil behalten, Wrapper wird im Frontend gesetzt
  out[key] = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const js = `/* Automatisch generiert von scripts/build-icons.mjs – Lucide Icons (ISC-Lizenz) */
window.ICONS = ${JSON.stringify(out, null, 2)};
window.icon = function (name, cls) {
  var inner = window.ICONS[name] || window.ICONS.explore;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="' + (cls || 'w-5 h-5') + '">' + inner + '</svg>';
};
`;
writeFileSync(join(root, 'public/assets/icons.js'), js);
console.log(`icons.js geschrieben (${Object.keys(out).length} Icons)`);
