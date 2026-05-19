/**
 * Backfills locale strings that still match English, using Lingva (Google Translate proxy).
 * https://lingva.ml — public instances may rate-limit; uses ~380ms delay between calls.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/locales');

const LINGVA_TARGETS = ['de', 'es', 'it', 'pt', 'ru', 'ja', 'ko'];

const PRESERVE_EXACT = new Set([
  'Spotify',
  'GIF',
  'OK',
  'DM',
  'Nitro',
  'PNG',
  'WebP',
  'JPEG',
  'TLS',
  'HTTPS',
  'HTTP',
  'API',
  'HD',
  'IP',
  'QR',
  'APP',
  'Ctrl',
  'Cmd',
  'Klipy',
  'Slide',
  'Google Authenticator',
  'Authy',
]);

function flattenLeaves(obj, prefix = '') {
  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenLeaves(v, p));
    } else {
      out[p] = v;
    }
  }
  return out;
}

function setDeep(root, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== 'object') {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lingvaTranslate(text, targetLang) {
  const safe = String(text).replace(/:\/\//g, '__COLONSLASHSLASH__');
  const seg = encodeURIComponent(safe.slice(0, 4500));
  const url = `https://lingva.ml/api/v1/en/${targetLang}/${seg}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const j = await res.json();
  if (!j.translation) {
    throw new Error(JSON.stringify(j));
  }
  return String(j.translation).replace(/__COLONSLASHSLASH__/g, '://');
}

function shouldSkipValue(s) {
  if (typeof s !== 'string') return true;
  const t = s.trim();
  if (!t) return true;
  if (PRESERVE_EXACT.has(t)) return true;
  if (t.length <= 2 && !/\s/.test(t)) return true;
  return false;
}

async function backfillFile(lang) {
  const enPath = path.join(localesDir, 'en.json');
  const targetPath = path.join(localesDir, `${lang}.json`);
  const enTree = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const tree = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  const enFlat = flattenLeaves(enTree);
  const flat = flattenLeaves(tree);
  const toFix = [];
  for (const k of Object.keys(enFlat)) {
    const ev = enFlat[k];
    const tv = flat[k];
    if (typeof ev !== 'string') continue;
    if (tv !== ev) continue;
    if (shouldSkipValue(ev)) continue;
    toFix.push({ k, text: ev });
  }
  if (toFix.length === 0) {
    console.log(`${lang}: nothing to backfill`);
    return;
  }
  console.log(`${lang}: backfilling ${toFix.length} strings via Lingva…`);
  const merged = deepClone(tree);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < toFix.length; i++) {
    const { k, text } = toFix[i];
    try {
      const tr = await lingvaTranslate(text, lang);
      if (tr && tr !== text) {
        setDeep(merged, k, tr);
        ok++;
      }
    } catch (e) {
      fail++;
      if (fail <= 8) console.warn(`${lang} ${k}:`, e.message);
    }
    if ((i + 1) % 40 === 0) {
      console.log(`  ${lang}: ${i + 1}/${toFix.length} (ok ${ok}, fail ${fail})`);
    }
    await sleep(150);
  }
  fs.writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`${lang}: done. updated ~${ok}, failures ${fail}`);
}

const langs = process.argv[2] ? [process.argv[2]] : LINGVA_TARGETS;

async function main() {
  for (const lang of langs) {
    await backfillFile(lang);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
