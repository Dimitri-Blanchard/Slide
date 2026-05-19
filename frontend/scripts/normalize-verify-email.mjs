import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../src/locales');

const BY_LANG = {
  en: 'Email address verified',
  fr: 'Adresse e-mail vérifiée ✓',
  de: 'E-Mail-Adresse bestätigt',
  es: 'Correo electrónico verificado',
  it: 'Indirizzo email verificato',
  pt: 'Endereço de email verificado',
  ru: 'Адрес электронной почты подтверждён',
  ja: 'メールアドレスを確認しました',
  ko: '이메일 주소가 확인되었습니다',
  zh: '电子邮件地址已验证',
};

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

for (const f of files) {
  const code = f.replace('.json', '');
  const p = path.join(dir, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!j.auth) continue;
  const cur = String(j.auth.verifyEmailSuccess || '');
  if (cur.includes('â') || cur.includes('\uFFFD') || cur.includes('verified â')) {
    j.auth.verifyEmailSuccess = BY_LANG[code] || BY_LANG.en;
    fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
    console.log('fixed', f);
  }
}
