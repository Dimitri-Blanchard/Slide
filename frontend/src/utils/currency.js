/**
 * Nitro price: 7 CHF (base).
 * Converts to local currency based on user locale/country.
 * Rates are approximate (CHF as reference).
 */
const NITRO_PRICE_CHF = 7;

// Taux CHF -> devise cible (approximatif, à jour fév 2025)
const CHF_TO_CURRENCY = {
  CHF: 1,
  EUR: 1.05,
  USD: 1.14,
  GBP: 0.90,
  CAD: 1.54,
  AUD: 1.74,
  JPY: 172,
  CNY: 8.2,
  KRW: 1550,
  BRL: 5.7,
  INR: 95,
  RUB: 105,
  PLN: 4.5,
  SEK: 12,
  NOK: 12.2,
  DKK: 7.8,
  TRY: 37,
  MXN: 19.5,
  TWD: 36,
  HKD: 8.9,
};

// Langue app (fr, de, en...) -> locale pour devise (priorité sur navigator si app langue européenne)
const APP_LANG_TO_LOCALE = {
  fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-PT',
  nl: 'nl-NL', pl: 'pl-PL', ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP',
  ko: 'ko-KR', en: null, // null = utiliser navigator
};

// Région (locale) -> devise
const REGION_TO_CURRENCY = {
  CH: 'CHF', LI: 'CHF', // Suisse, Liechtenstein
  US: 'USD', CA: 'CAD', // Amérique du Nord
  GB: 'GBP', UK: 'GBP', // Royaume-Uni
  JP: 'JPY', // Japon
  KR: 'KRW', // Corée du Sud
  CN: 'CNY', TW: 'TWD', HK: 'HKD', // Asie
  IN: 'INR', // Inde
  BR: 'BRL', MX: 'MXN', // Amérique latine
  RU: 'RUB', // Russie
  PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK', // Europe du Nord
  TR: 'TRY', // Turquie
  // Zone Euro (priorité EUR)
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR',
  ES: 'EUR', FI: 'EUR', FR: 'EUR', GR: 'EUR', IE: 'EUR',
  IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR',
  NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
};

/** Symbole par devise pour affichage */
const CURRENCY_SYMBOLS = {
  CHF: 'CHF', EUR: '€', USD: '$', GBP: '£', CAD: 'CA$', AUD: 'A$',
  JPY: '¥', CNY: '¥', KRW: '₩', BRL: 'R$', INR: '₹', RUB: '₽',
  PLN: 'zł', SEK: 'kr', NOK: 'kr', DKK: 'kr', TRY: '₺', MXN: 'MX$',
  TWD: 'NT$', HKD: 'HK$',
};

/**
 * Récupère la devise selon la locale du navigateur.
 * @param {string} [locale] - Ex: "fr-CH", "en-US"
 * @returns {{ code: string, symbol: string }}
 */
export function getLocaleCurrency(locale) {
  const loc = locale || navigator.language || 'en-US';
  const region = (loc.split('-')[1] || loc.slice(-2) || 'US').toUpperCase();
  const code = REGION_TO_CURRENCY[region] || 'CHF';
  const symbol = CURRENCY_SYMBOLS[code] || code;
  return { code, symbol };
}

/**
 * Convertit le prix Nitro (7 CHF) en devise locale.
 * @param {string} [locale]
 * @returns {{ amount: number, formatted: string, code: string, symbol: string }}
 */
export function getNitroPriceLocalized(locale) {
  const { code, symbol } = getLocaleCurrency(locale);
  const rate = CHF_TO_CURRENCY[code] ?? CHF_TO_CURRENCY.CHF;
  const amount = NITRO_PRICE_CHF * rate;

  const formatted = new Intl.NumberFormat(locale || undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: code === 'JPY' || code === 'KRW' ? 0 : 2,
    maximumFractionDigits: code === 'JPY' || code === 'KRW' ? 0 : 2,
  }).format(amount);

  return { amount, formatted, code, symbol };
}

/**
 * Formate le prix Nitro mensuel pour l'affichage (ex: "7 CHF/mo" ou "7,35 €/mois").
 * Priorité à la langue de l'app : si l'utilisateur a choisi français, on affiche en €.
 * @param {string} [locale] - Locale (navigator.language ou priorité langue app)
 * @param {string} [periodSuffix] - Suffixe période, ex: "/mo" ou "/mois"
 * @param {string} [appLanguage] - Langue sélectionnée dans l'app (ex: "fr", "en")
 * @returns {string}
 */
export function formatNitroPriceMonthly(locale, periodSuffix = '/mo', appLanguage) {
  const effectiveLocale = appLanguage && APP_LANG_TO_LOCALE[appLanguage]
    ? APP_LANG_TO_LOCALE[appLanguage]
    : (locale || navigator.language);
  const { formatted } = getNitroPriceLocalized(effectiveLocale);
  return `${formatted}${periodSuffix}`;
}
