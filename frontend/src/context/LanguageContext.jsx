import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations, languages } from '../locales';

const LanguageContext = createContext(null);

// Default language
const DEFAULT_LANGUAGE = 'fr';

// Get nested value from object using dot notation
const getNestedValue = (obj, path) => {
  if (!path) return undefined;
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value === undefined || value === null) return undefined;
    value = value[key];
  }
  
  return value;
};

// Replace placeholders like {name} with actual values
const interpolate = (text, params) => {
  if (!text || !params) return text;
  
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Try to get saved language from localStorage
    const saved = localStorage.getItem('app_language');
    if (saved && translations[saved]) {
      return saved;
    }
    // Try to detect from browser
    const browserLang = navigator.language?.split('-')[0];
    if (browserLang && translations[browserLang]) {
      return browserLang;
    }
    return DEFAULT_LANGUAGE;
  });
  
  // Current translations object
  const currentTranslations = useMemo(() => {
    return translations[language] || translations[DEFAULT_LANGUAGE];
  }, [language]);
  
  // Save language to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('app_language', language);
    // Also update the html lang attribute
    document.documentElement.lang = language;
  }, [language]);
  
  // Translation function
  // Usage: t('settings.title') or t('chat.typeMessageTo', { name: 'John' })
  const t = useCallback((key, params = null) => {
    const value = getNestedValue(currentTranslations, key);
    
    if (value === undefined) {
      // Fallback to English if key not found in current language
      const fallback = getNestedValue(translations.en, key);
      if (fallback !== undefined) {
        return params ? interpolate(fallback, params) : fallback;
      }
      // Fallback to French if also not in English
      const frFallback = getNestedValue(translations.fr, key);
      if (frFallback !== undefined) {
        return params ? interpolate(frFallback, params) : frFallback;
      }
      // Return the key itself as last resort
      console.warn(`Translation not found: ${key}`);
      return key;
    }
    
    return params ? interpolate(value, params) : value;
  }, [currentTranslations]);
  
  // Change language function
  const changeLanguage = useCallback((langCode) => {
    if (translations[langCode]) {
      setLanguage(langCode);
      return true;
    }
    console.warn(`Language not supported: ${langCode}`);
    return false;
  }, []);
  
  // Check if a translation key exists
  const hasTranslation = useCallback((key) => {
    return getNestedValue(currentTranslations, key) !== undefined;
  }, [currentTranslations]);
  
  // Get all available languages
  const getLanguages = useCallback(() => {
    return languages;
  }, []);
  
  // Format date according to current language
  const formatDate = useCallback((date, options = {}) => {
    const d = date instanceof Date ? date : new Date(date);
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return d.toLocaleDateString(language, { ...defaultOptions, ...options });
  }, [language]);
  
  // Format time according to current language
  const formatTime = useCallback((date, options = {}) => {
    const d = date instanceof Date ? date : new Date(date);
    const defaultOptions = {
      hour: '2-digit',
      minute: '2-digit',
    };
    return d.toLocaleTimeString(language, { ...defaultOptions, ...options });
  }, [language]);
  
  // Format relative time (e.g., "2 hours ago")
  const formatRelativeTime = useCallback((date) => {
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
      return t('time.now');
    } else if (diffMins < 60) {
      return t('time.minutesAgo', { minutes: diffMins });
    } else if (diffHours < 24) {
      return t('time.hoursAgo', { hours: diffHours });
    } else if (diffDays === 1) {
      return t('time.yesterday');
    } else {
      return formatDate(d);
    }
  }, [t, formatDate]);
  
  const value = useMemo(() => ({
    language,
    languages,
    t,
    changeLanguage,
    hasTranslation,
    getLanguages,
    formatDate,
    formatTime,
    formatRelativeTime,
    isRTL: ['ar', 'he', 'fa'].includes(language), // For future RTL support
  }), [
    language,
    t,
    changeLanguage,
    hasTranslation,
    getLanguages,
    formatDate,
    formatTime,
    formatRelativeTime,
  ]);
  
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// Custom hook to use translations
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Shorthand hook that returns just the t function
export function useTranslation() {
  const { t, language } = useLanguage();
  return { t, language };
}

export default LanguageContext;
