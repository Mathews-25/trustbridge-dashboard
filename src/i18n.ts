/**
 * next-intl server configuration.
 *
 * Issue #515 — uses the shared i18n-config module so the supported locale
 * list, default locale, and message-loading path are identical on the server
 * (here) and on the client (I18nProvider in src/lib/i18n-context.tsx).
 *
 * Behaviour:
 *   - Locale is normalised to lower-case before validation so cookies that
 *     arrive as "EN" or "Es" are accepted without error.
 *   - Unsupported locales trigger notFound() so Next.js returns a 404 rather
 *     than attempting to load a non-existent messages file.
 *   - Missing translation file falls back to English to avoid a hard 500 if a
 *     newly-added locale file has not yet been deployed.
 */
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  resolveLocale,
  isSupportedLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from '@/lib/i18n-config';

// Re-export so existing import sites that pulled these from here still compile.
export type { SupportedLocale } from '@/lib/i18n-config';
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale, resolveLocale };

export default getRequestConfig(async ({ locale }: { locale?: string }) => {
  // Normalise case and fall back to DEFAULT_LOCALE when the cookie is absent.
  const activeLocale = resolveLocale(locale ?? DEFAULT_LOCALE);

  // Unsupported locale → 404.  Using isSupportedLocale keeps the check
  // consistent with the client-side resolveLocale guard.
  if (!isSupportedLocale(activeLocale)) {
    notFound();
  }

  let messages: Record<string, unknown>;
  try {
    // Load from the same public/locales path used by the client provider.
    messages = (
      await import(`../public/locales/${activeLocale}.json`)
    ).default;
  } catch {
    // Fallback to English on missing file — consistent with client provider.
    messages = (
      await import(`../public/locales/${DEFAULT_LOCALE}.json`)
    ).default;
  }

  return { locale: activeLocale, messages };
});
