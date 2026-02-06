import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en.json';
import koTranslation from './locales/ko.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: enTranslation },
            ko: { translation: koTranslation },
        },
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // React already handles XSS
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
        },
    });

export default i18n;
