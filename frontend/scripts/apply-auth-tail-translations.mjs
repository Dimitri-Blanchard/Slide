/**
 * Applies known-good auth.* tail strings (post-reset / verify email) per language.
 * Idempotent: overwrites listed keys only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/locales');

const TAILS = {
  it: {
    redirectToApp: "Reindirizzamento all'app...",
    forgotSuccessMessage: "Se esiste un account per questa email, è stato inviato un link di reimpostazione. Controlla la posta in arrivo.",
    resetLinkInvalid: "Il link manca o è scaduto. Richiedi un nuovo link.",
    requestNewLink: "Richiedi un nuovo link",
    securityBannerTitle: "Protetto",
    securityBannerDesc: "I tuoi dati sono crittografati end-to-end. Non memorizziamo né leggiamo mai i tuoi messaggi.",
    checkInbox: "Controlla la posta in arrivo",
    verifyEmailLoading: "Verifica in corso…",
    verifyEmailWait: "Attendere prego.",
    verifyEmailSuccessDesc: "Il tuo indirizzo email è stato confermato. Il tuo account è ora protetto.",
    verifyEmailInvalid: "Link non valido",
    verifyEmailNoToken: "Link non valido — nessun token fornito.",
    verifyEmailExpired: "Link non valido o scaduto.",
    backToApp: "Torna all'app",
  },
  pt: {
    redirectToApp: "A redirecionar para a aplicação...",
    forgotSuccessMessage: "Se existir uma conta para este email, foi enviada uma ligação de redefinição. Verifique a sua caixa de entrada.",
    resetLinkInvalid: "A ligação está em falta ou expirou. Peça uma nova ligação.",
    requestNewLink: "Pedir nova ligação",
    securityBannerTitle: "Protegido",
    securityBannerDesc: "Os seus dados estão encriptados de ponta a ponta. Nunca armazenamos nem lemos as suas mensagens.",
    checkInbox: "Verifique a sua caixa de entrada",
    verifyEmailLoading: "A verificar…",
    verifyEmailWait: "Por favor aguarde.",
    verifyEmailSuccessDesc: "O seu endereço de email foi confirmado. A sua conta está agora protegida.",
    verifyEmailInvalid: "Ligação inválida",
    verifyEmailNoToken: "Ligação inválida — nenhum token fornecido.",
    verifyEmailExpired: "Ligação inválida ou expirada.",
    backToApp: "Voltar à aplicação",
  },
  ru: {
    redirectToApp: "Переход в приложение...",
    forgotSuccessMessage: "Если учётная запись с этим адресом существует, мы отправили ссылку для сброса. Проверьте почту.",
    resetLinkInvalid: "Ссылка отсутствует или устарела. Запросите новую ссылку.",
    requestNewLink: "Запросить новую ссылку",
    securityBannerTitle: "Защищено",
    securityBannerDesc: "Ваши данные надёжно шифруются. Мы никогда не храним и не читаем ваши сообщения.",
    checkInbox: "Проверьте почту",
    verifyEmailLoading: "Проверка…",
    verifyEmailWait: "Пожалуйста, подождите.",
    verifyEmailSuccessDesc: "Ваш адрес электронной почты подтверждён. Учётная запись защищена.",
    verifyEmailInvalid: "Недействительная ссылка",
    verifyEmailNoToken: "Недействительная ссылка — токен не указан.",
    verifyEmailExpired: "Недействительная или устаревшая ссылка.",
    backToApp: "Вернуться в приложение",
  },
  ja: {
    redirectToApp: "アプリにリダイレクトしています...",
    forgotSuccessMessage: "このメールアドレスにアカウントがある場合、再設定用のリンクを送信しました。受信トレイをご確認ください。",
    resetLinkInvalid: "リンクがないか期限切れです。新しいリンクをリクエストしてください。",
    requestNewLink: "新しいリンクをリクエスト",
    securityBannerTitle: "保護されています",
    securityBannerDesc: "データはエンドツーエンドで暗号化されています。メッセージを保存したり読んだりすることはありません。",
    checkInbox: "受信トレイを確認してください",
    verifyEmailLoading: "確認中…",
    verifyEmailWait: "お待ちください。",
    verifyEmailSuccessDesc: "メールアドレスが確認されました。アカウントは保護されています。",
    verifyEmailInvalid: "無効なリンク",
    verifyEmailNoToken: "無効なリンク — トークンがありません。",
    verifyEmailExpired: "無効または期限切れのリンクです。",
    backToApp: "アプリに戻る",
  },
  ko: {
    redirectToApp: "앱으로 이동 중...",
    forgotSuccessMessage: "해당 이메일로 가입된 계정이 있으면 재설정 링크를 보냈습니다. 받은편지함을 확인하세요.",
    resetLinkInvalid: "링크가 없거나 만료되었습니다. 새 링크를 요청하세요.",
    requestNewLink: "새 링크 요청",
    securityBannerTitle: "보호됨",
    securityBannerDesc: "데이터는 종단간 암호화됩니다. 메시지를 저장하거나 읽지 않습니다.",
    checkInbox: "받은편지함을 확인하세요",
    verifyEmailLoading: "확인 중…",
    verifyEmailWait: "잠시만 기다려 주세요.",
    verifyEmailSuccessDesc: "이메일 주소가 확인되었습니다. 계정이 보호되었습니다.",
    verifyEmailInvalid: "잘못된 링크",
    verifyEmailNoToken: "잘못된 링크 — 토큰이 없습니다.",
    verifyEmailExpired: "잘못되었거나 만료된 링크입니다.",
    backToApp: "앱으로 돌아가기",
  },
};

for (const [lang, keys] of Object.entries(TAILS)) {
  const p = path.join(localesDir, `${lang}.json`);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.auth = j.auth || {};
  Object.assign(j.auth, keys);
  fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
  console.log('patched auth tail', lang);
}
