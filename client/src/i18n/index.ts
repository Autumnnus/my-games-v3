import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

async function loadTranslations() {
  const [enRes, trRes] = await Promise.all([
    fetch('/i18n/locales/en.json'),
    fetch('/i18n/locales/tr.json'),
  ]);

  const resources: Record<string, { translation: unknown }> = {};
  if (enRes.ok) {
    try { resources.en = { translation: await enRes.json() }; }
    catch { resources.en = { translation: {} }; }
  }
  if (trRes.ok) {
    try { resources.tr = { translation: await trRes.json() }; }
    catch { resources.tr = { translation: {} }; }
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: localStorage.getItem('mygames-lang') || 'tr',
    fallbackLng: 'tr',
    supportedLngs: ['en', 'tr'],
    interpolation: { escapeValue: false },
  });
}

loadTranslations();

export default i18n;