import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enRaw from "./locales/en.json";
import tr from "./locales/tr.json";

// TypeScript error here if en.json is missing keys that exist in tr.json
const en = enRaw satisfies typeof tr;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
  },
  lng: localStorage.getItem("mygames-lang") || "tr",
  fallbackLng: "tr",
  supportedLngs: ["en", "tr"],
  interpolation: { escapeValue: false },
});

export default i18n;
