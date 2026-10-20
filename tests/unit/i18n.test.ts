import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isSupportedLocale,
  resolveLocale,
} from '@/lib/i18n-config';

// ---------------------------------------------------------------------------
// Shared config module — issue #515
// ---------------------------------------------------------------------------

describe('i18n-config (shared module)', () => {
  it('exports SUPPORTED_LOCALES containing en, es, pt', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('es');
    expect(SUPPORTED_LOCALES).toContain('pt');
    expect(SUPPORTED_LOCALES).toHaveLength(3);
  });

  it('DEFAULT_LOCALE is en', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('isSupportedLocale returns true for all supported locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it('isSupportedLocale returns false for unsupported locales', () => {
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale('de')).toBe(false);
    expect(isSupportedLocale('zh')).toBe(false);
  });

  it('resolveLocale handles missing / null / undefined → DEFAULT_LOCALE', () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
  });

  it('resolveLocale normalises locale case (EN → en)', () => {
    expect(resolveLocale('EN')).toBe('en');
    expect(resolveLocale('ES')).toBe('es');
    expect(resolveLocale('PT')).toBe('pt');
  });

  it('resolveLocale returns DEFAULT_LOCALE for unsupported values', () => {
    expect(resolveLocale('fr')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('xx')).toBe(DEFAULT_LOCALE);
  });
});

// ---------------------------------------------------------------------------
// Locale parity — server config vs client I18nProvider use the same list
// ---------------------------------------------------------------------------

describe('locale list parity — server config vs client provider (#515)', () => {
  it('SUPPORTED_LOCALES in i18n-config matches locale files on disk', () => {
    const localeDir = path.join(process.cwd(), 'public/locales');
    const files = fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'));
    const fileLocales = files.map((f) => f.replace('.json', ''));

    for (const locale of SUPPORTED_LOCALES) {
      expect(fileLocales).toContain(locale);
    }
  });

  it('every locale file has a matching entry in SUPPORTED_LOCALES', () => {
    const localeDir = path.join(process.cwd(), 'public/locales');
    const files = fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'));
    const fileLocales = files.map((f) => f.replace('.json', ''));

    for (const fileLocale of fileLocales) {
      expect(SUPPORTED_LOCALES as readonly string[]).toContain(fileLocale);
    }
  });
});

// ---------------------------------------------------------------------------
// Existing locale file tests (preserved from original)
// ---------------------------------------------------------------------------

describe('i18n', () => {
  describe('locale files', () => {
    it('should have en, es, and pt locale files', () => {
      const localeDir = path.join(process.cwd(), 'public/locales');
      const files = fs.readdirSync(localeDir);
      expect(files).toContain('en.json');
      expect(files).toContain('es.json');
      expect(files).toContain('pt.json');
    });

    it('should have valid JSON in all locale files', () => {
      const localeDir = path.join(process.cwd(), 'public/locales');
      const locales = ['en', 'es', 'pt'];

      locales.forEach((locale) => {
        const content = fs.readFileSync(
          path.join(localeDir, `${locale}.json`),
          'utf-8',
        );
        expect(() => JSON.parse(content)).not.toThrow();
      });
    });

    it('should have matching keys across all locale files', () => {
      const localeDir = path.join(process.cwd(), 'public/locales');
      const locales = ['en', 'es', 'pt'];
      const messages: Record<string, unknown> = {};

      locales.forEach((locale) => {
        const content = fs.readFileSync(
          path.join(localeDir, `${locale}.json`),
          'utf-8',
        );
        messages[locale] = JSON.parse(content);
      });

      const enKeys = new Set(flattenKeys(messages.en));
      const esKeys = new Set(flattenKeys(messages.es));
      const ptKeys = new Set(flattenKeys(messages.pt));

      const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
      const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));

      expect(missingInEs).toHaveLength(0);
      expect(missingInPt).toHaveLength(0);
    });
  });

  describe('locale parity with Action', () => {
    it('should support en, es, pt locales matching GitHub Action', () => {
      const localeDir = path.join(process.cwd(), 'public/locales');
      const files = fs.readdirSync(localeDir);
      const requiredLocales = ['en.json', 'es.json', 'pt.json'];
      requiredLocales.forEach((locale) => {
        expect(files).toContain(locale);
      });
    });
  });
});

function flattenKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  for (const key in obj as Record<string, unknown>) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = (obj as Record<string, unknown>)[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      keys.push(...flattenKeys(val, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}
