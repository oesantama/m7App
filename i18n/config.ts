import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEs from './locales/es/common.json';
import commonEn from './locales/en/common.json';
import fulfillmentEs from './locales/es/fulfillment.json';
import fulfillmentEn from './locales/en/fulfillment.json';

// Detección automática por idioma del navegador de quien usa el sistema (sin selector manual,
// por decisión del cliente) — se cachea en localStorage para no re-detectar en cada carga.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { common: commonEs, fulfillment: fulfillmentEs },
      en: { common: commonEn, fulfillment: fulfillmentEn },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    nonExplicitSupportedLngs: true,
    ns: ['common', 'fulfillment'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'm7_lang',
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
