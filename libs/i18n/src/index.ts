import i18n, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import pt from './locales/pt.json';
import fr from './locales/fr.json';
import nl from './locales/nl.json';

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'fr', 'nl'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function initI18n(): I18nInstance {
  if (i18n.isInitialized) return i18n;
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        pt: { translation: pt },
        fr: { translation: fr },
        nl: { translation: nl },
      },
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
      nonExplicitSupportedLngs: true,
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: 'cowboy.lang',
        caches: ['localStorage'],
      },
    });
  return i18n;
}

export default i18n;
