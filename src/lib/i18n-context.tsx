'use client';
/**
 * Client-side I18nProvider and helpers.
 *
 * Issue #515 — now uses the shared i18n-config module so the supported locale
 * list and message-loading path are identical to the next-intl server config
 * (src/i18n.ts).  The provider also accepts an `initialLocale` prop so the
 * server-selected locale can be passed down without a client/server mismatch.
 */
import React, { ReactNode, useState } from 'react';
import {
  SUPPORTED_LOCALES,
  SupportedLocale,
  DEFAULT_LOCALE,
  resolveLocale,
} from '@/lib/i18n-config';

// Re-export so callers that imported these from here still compile.
export type { SupportedLocale };
export { SUPPORTED_LOCALES, DEFAULT_LOCALE };

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  messages: Record<string, unknown>;
}

const I18nContext = React.createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  /**
   * Locale pre-selected on the server (e.g. read from the request cookie or
   * next-intl routing).  When provided the client initialises with the same
   * locale the server used — preventing a hydration mismatch.
   * Defaults to DEFAULT_LOCALE ('en') when omitted.
   */
  initialLocale?: string;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  // resolveLocale normalises case and falls back to DEFAULT_LOCALE for unknown
  // values, so a misconfigured server prop cannot crash the client.
  const [locale, setLocaleState] = useState<SupportedLocale>(
    resolveLocale(initialLocale),
  );
  const [messages, setMessages] = useState<Record<string, unknown>>({});

  const handleSetLocale = async (newLocale: SupportedLocale) => {
    const resolved = resolveLocale(newLocale);
    setLocaleState(resolved);
    try {
      // Load from the same public/locales path used by the server config.
      const localeMessages = await import(
        `../../public/locales/${resolved}.json`
      );
      setMessages(localeMessages.default);
    } catch (error) {
      console.error(`Failed to load locale ${resolved}:`, error);
      // Fall back to English on load failure — consistent with server fallback.
      try {
        const fallback = await import(
          `../../public/locales/${DEFAULT_LOCALE}.json`
        );
        setMessages(fallback.default);
      } catch {
        // If even the fallback fails, keep existing messages rather than crashing.
      }
    }
  };

  return (
    <I18nContext.Provider
      value={{ locale, setLocale: handleSetLocale, messages }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

export function useTranslations() {
  const { messages } = useI18n();
  return (key: string, defaultValue: string = key) => {
    const keys = key.split('.');
    let value: unknown = messages;
    for (const k of keys) {
      if (typeof value === 'object' && value !== null) {
        value = (value as Record<string, unknown>)[k];
      }
    }
    return typeof value === 'string' ? value : defaultValue;
  };
}
