import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "../locales/de.json";
import en from "../locales/en.json";

const STORAGE_KEY = "pd_locale";

function initialLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "de" || saved === "en") return saved;
  } catch {
    /* noop */
  }
  return "de";
}

i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: "de",
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export function setLanguage(lng: "de" | "en", persist = true) {
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, lng);
    } catch {
      /* noop */
    }
  }
  void i18n.changeLanguage(lng);
}

/** Instanz-Standardsprache anwenden, falls der Nutzer nichts gewählt hat. */
export function applyDefaultLanguage(lng: "de" | "en") {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch {
    /* noop */
  }
  void i18n.changeLanguage(lng);
}

export default i18n;
