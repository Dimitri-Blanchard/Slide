/**
 * Backfills locale strings that still match English (often after translate API 403s).
 * Uses MyMemory public API (langpair), conservative rate limit.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/locales');

const LANGPAIR = {
  zh: 'en|zh-CN',
  de: 'en|de',
  es: 'en|es',
  it: 'en|it',
  pt: 'en|pt',
  ru: 'en|ru',
  ja: 'en|ja',
  ko: 'en|ko',
};

/** Do not send these whole-string values to MT (brand / symbols). */
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
  'HD',
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

async function mymemoryTranslate(text, langpair) {
  const q = encodeURIComponent(text.slice(0, 450));
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${encodeURIComponent(langpair)}`;
  const res = await fetch(url);
  const j = await res.json();
  if (j.responseStatus !== 200) {
    throw new Error(j.responseDetails || JSON.stringify(j));
  }
  const out = j.responseData.translatedText;
  if (typeof out === 'string' && out.includes('MYMEMORY WARNING')) {
    throw new Error('MyMemory quota');
  }
  return out;
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
  const pair = LANGPAIR[lang];
  if (!pair) return;
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
  console.log(`${lang}: backfilling ${toFix.length} strings…`);
  const merged = deepClone(tree);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < toFix.length; i++) {
    const { k, text } = toFix[i];
    try {
      const tr = await mymemoryTranslate(text, pair);
      if (tr && tr !== text) {
        setDeep(merged, k, tr);
        ok++;
      }
    } catch (e) {
      fail++;
      if (fail <= 5) console.warn(`${lang} ${k}:`, e.message);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`  ${lang}: ${i + 1}/${toFix.length} (ok ${ok}, fail ${fail})`);
    }
    await sleep(400);
  }
  fs.writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`${lang}: done. updated ~${ok}, failures ${fail}`);
}

const langs = process.argv[2] ? [process.argv[2]] : ['de', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'];

async function main() {
  for (const lang of langs) {
    await backfillFile(lang);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
