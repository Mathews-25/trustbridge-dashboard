/**
 * Shared i18n configuration — single source of truth for supported locales.
 *
 * Consumed by:
 *   - src/i18n.ts                (next-intl server getRequestConfig)
 *   - src/lib/i18n-context.tsx   (client I18nProvider)
 *   - tests/unit/i18n.test.ts    (locale parity tests)
 *
 * Issue #515 — Unify next-intl server config with client I18nProvider.
 */

export const SUPPORTED_LOCALES = ['en', 'es', 'pt'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Default locale used when no explicit locale is detected (missing cookie, etc.). */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Returns true when `locale` is in the supported list.
 * Normalises to lower-case before checking so "EN" and "en" both match.
 */
export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale.toLowerCase());
}

/**
 * Resolves a raw locale string to a SupportedLocale.
 *
 * Edge cases handled:
 *   - null / undefined / empty string → DEFAULT_LOCALE ('en')
 *   - upper-case input e.g. 'EN'     → 'en'
 *   - unsupported value e.g. 'fr'    → DEFAULT_LOCALE ('en')
 */
export function resolveLocale(raw: string | undefined | null): SupportedLocale {
  if (!raw) return DEFAULT_LOCALE;
  const lower = raw.trim().toLowerCase();
  return isSupportedLocale(lower) ? lower : DEFAULT_LOCALE;
}
