import { describe, it, expect } from "vitest";
import {
  formatMachineDate,
  formatTemplateDate,
  formatTemplateNumber,
  generateEmailTemplate,
  generateMarkdownTemplate,
  generatePlainTemplate,
  generateTemplate,
  SUPPORTED_TEMPLATE_LOCALES,
  type TemplateFormat,
  type TemplateOptions,
} from "./outreach-templates";

describe("outreach-templates", () => {
  const baseOptions: TemplateOptions = {
    contributorName: "Alice",
    waveNumber: 3,
    deadline: new Date("2026-08-01"),
    minXlmBalance: 2,
    supportEmail: "help@example.com",
    assetCode: "USDC",
    assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  };

  describe("generateEmailTemplate", () => {
    it("should generate email template with all options", () => {
      const template = generateEmailTemplate(baseOptions);

      expect(template).toContain("Subject: Wave 3 Payout Readiness Check");
      expect(template).toContain("Dear Alice");
      expect(template).toContain("August 1, 2026");
      expect(template).toContain("2 XLM");
      expect(template).toContain("USDC");
      expect(template).toContain("help@example.com");
    });

    it("should use defaults when options not provided", () => {
      const template = generateEmailTemplate({});

      expect(template).toContain("Wave 1");
      expect(template).toContain("Contributor");
      // Default mirrors trustbridge-action's `min_xlm_reserve` (1.5), so the
      // reserve a contributor is told to fund is the one the Action enforces.
      expect(template).toContain("1.5 XLM");
      expect(template).toContain("support@trustbridge.dev");
    });

    it("should include trustline setup instructions", () => {
      const template = generateEmailTemplate(baseOptions);

      expect(template).toContain("Set Up USDC Trustline");
      expect(template).toContain("authorized");
    });

    it("should include wallet proof instructions", () => {
      const template = generateEmailTemplate(baseOptions);

      expect(template).toContain("Wallet Proof");
      expect(template).toContain("public address");
    });
  });

  describe("generateMarkdownTemplate", () => {
    it("should generate markdown template", () => {
      const template = generateMarkdownTemplate(baseOptions);

      expect(template).toContain("# Wave 3 Payout Readiness");
      expect(template).toContain("Hi Alice!");
      expect(template).toContain("## ✅ Checklist");
      expect(template).toContain("## 📸 Wallet Proof");
    });

    it("should include markdown formatting", () => {
      const template = generateMarkdownTemplate(baseOptions);

      expect(template).toContain("- [ ]"); // checkboxes
      expect(template).toContain("|"); // table
      expect(template).toContain("**"); // bold
    });
  });

  describe("generatePlainTemplate", () => {
    it("should generate plain text template", () => {
      const template = generatePlainTemplate(baseOptions);

      expect(template).toContain("WAVE 3 PAYOUT READINESS CHECKLIST");
      expect(template).toContain("Hello Alice");
      expect(template).toContain("STEP 1:");
      expect(template).toContain("STEP 2:");
      expect(template).toContain("STEP 3:");
    });

    it("should not include markdown formatting", () => {
      const template = generatePlainTemplate(baseOptions);

      expect(template).not.toContain("**");
      expect(template).not.toContain("# ");
      expect(template).not.toContain("- [ ]");
    });
  });

  describe("generateTemplate", () => {
    it("should generate email format", () => {
      const template = generateTemplate("email", baseOptions);
      expect(template).toContain("Subject:");
      expect(template).toContain("Dear Alice");
    });

    it("should generate markdown format", () => {
      const template = generateTemplate("markdown", baseOptions);
      expect(template).toContain("# Wave");
      expect(template).toContain("## ✅");
    });

    it("should generate plain format", () => {
      const template = generateTemplate("plain", baseOptions);
      expect(template).toContain("WAVE");
      expect(template).toContain("STEP");
    });

    it("should throw error on invalid format", () => {
      expect(() => {
        generateTemplate("invalid" as any, baseOptions);
      }).toThrow("Unknown template format");
    });

    it("should use custom contributor name", () => {
      const template = generateTemplate("email", {
        ...baseOptions,
        contributorName: "Bob",
      });
      expect(template).toContain("Dear Bob");
    });

    it("should format dates correctly", () => {
      const template = generateTemplate("email", baseOptions);
      expect(template).toMatch(/August \d{1,2}, 2026/);
    });
  });

  describe("template content consistency", () => {
    it("all formats should mention the asset code", () => {
      const email = generateEmailTemplate(baseOptions);
      const markdown = generateMarkdownTemplate(baseOptions);
      const plain = generatePlainTemplate(baseOptions);

      expect(email).toContain("USDC");
      expect(markdown).toContain("USDC");
      expect(plain).toContain("USDC");
    });

    it("all formats should include minimum XLM requirement", () => {
      const email = generateEmailTemplate(baseOptions);
      const markdown = generateMarkdownTemplate(baseOptions);
      const plain = generatePlainTemplate(baseOptions);

      expect(email).toContain("2 XLM");
      expect(markdown).toContain("2 XLM");
      expect(plain).toContain("2 XLM");
    });

    it("all formats should reference dashboard", () => {
      const email = generateEmailTemplate(baseOptions);
      const markdown = generateMarkdownTemplate(baseOptions);
      const plain = generatePlainTemplate(baseOptions);

      expect(email).toContain("trustbridge.dev");
      expect(markdown).toContain("trustbridge.dev");
      expect(plain).toContain("trustbridge.dev");
    });
  });
});

// ── Issue #150: locale-aware dates and numbers ─────────────────────────────

describe("locale-aware formatting", () => {
  /**
   * Fixed inputs across every locale case. A wave number, a G-address and an
   * asset code are identifiers; a deadline and an XLM amount are the only two
   * values that should ever change shape between locales.
   */
  const localeOptions: TemplateOptions = {
    contributorName: "Alice",
    waveNumber: 3,
    // UTC midnight, exactly what `<input type="date">` produces.
    deadline: new Date("2026-08-01T00:00:00.000Z"),
    minXlmBalance: 1.5,
    supportEmail: "help@example.com",
    assetCode: "USDC",
    assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  };

  const LOCALES = SUPPORTED_TEMPLATE_LOCALES.map((entry) => entry.value);

  describe("formatTemplateDate", () => {
    it.each([
      ["en-US", "August 1, 2026"],
      ["en-GB", "1 August 2026"],
      ["es-ES", "1 de agosto de 2026"],
      ["pt-BR", "1 de agosto de 2026"],
      ["fr-FR", "1 août 2026"],
      ["de-DE", "1. August 2026"],
    ])("renders the deadline for %s", (locale, expected) => {
      expect(
        formatTemplateDate(new Date("2026-08-01T00:00:00.000Z"), locale)
      ).toBe(expected);
    });

    it("defaults to en-US when no locale is given", () => {
      expect(formatTemplateDate(new Date("2026-08-01T00:00:00.000Z"))).toBe(
        "August 1, 2026"
      );
    });

    it("renders the calendar day that was picked, not the reader's local day", () => {
      // The bug this replaces: `toLocaleDateString` in a zone behind UTC turned
      // a 1 August deadline into 31 July for every reader west of Greenwich.
      const deadline = new Date("2026-08-01T00:00:00.000Z");

      expect(formatTemplateDate(deadline, "en-US")).toBe("August 1, 2026");
      expect(formatTemplateDate(deadline, "en-US", "UTC")).toBe("August 1, 2026");
      // Explicitly asking for a western zone is the caller's choice, and does
      // shift the day — which is why UTC is the default.
      expect(formatTemplateDate(deadline, "en-US", "America/Los_Angeles")).toBe(
        "July 31, 2026"
      );
    });

    it("is stable across zones for a late-evening UTC deadline", () => {
      const deadline = new Date("2026-08-01T23:30:00.000Z");
      expect(formatTemplateDate(deadline, "en-US")).toBe("August 1, 2026");
    });
  });

  describe("formatTemplateNumber", () => {
    it.each([
      ["en-US", 1.5, "1.5"],
      ["de-DE", 1.5, "1,5"],
      ["fr-FR", 1.5, "1,5"],
      ["es-ES", 1.5, "1,5"],
      ["pt-BR", 1.5, "1,5"],
      ["en-US", 2, "2"],
      ["de-DE", 2, "2"],
    ])("formats %s %s as %s", (locale, value, expected) => {
      expect(formatTemplateNumber(value as number, locale as string)).toBe(
        expected
      );
    });

    it("keeps precision for fractional reserves", () => {
      expect(formatTemplateNumber(0.0000001, "en-US")).toBe("0.0000001");
    });

    it("defaults to en-US", () => {
      expect(formatTemplateNumber(1.5)).toBe("1.5");
    });
  });

  describe("formatMachineDate", () => {
    it("stays ISO 8601 regardless of locale", () => {
      // CSV and API payloads must remain parseable — a spreadsheet cannot read
      // "1 de agosto de 2026" back into a date.
      expect(formatMachineDate(new Date("2026-08-01T00:00:00.000Z"))).toBe(
        "2026-08-01"
      );
    });
  });

  describe("templates honour the locale", () => {
    it.each(LOCALES)("email renders a localized deadline for %s", (locale) => {
      const template = generateEmailTemplate({ ...localeOptions, locale });
      expect(template).toContain(
        formatTemplateDate(localeOptions.deadline!, locale)
      );
    });

    it.each(LOCALES)("email renders a localized XLM amount for %s", (locale) => {
      const template = generateEmailTemplate({ ...localeOptions, locale });
      expect(template).toContain(`${formatTemplateNumber(1.5, locale)} XLM`);
    });

    it.each(LOCALES)("markdown honours %s", (locale) => {
      const template = generateMarkdownTemplate({ ...localeOptions, locale });
      expect(template).toContain(
        formatTemplateDate(localeOptions.deadline!, locale)
      );
      expect(template).toContain(`${formatTemplateNumber(1.5, locale)} XLM`);
    });

    it.each(LOCALES)("plain honours %s", (locale) => {
      const template = generatePlainTemplate({ ...localeOptions, locale });
      expect(template).toContain(
        formatTemplateDate(localeOptions.deadline!, locale)
      );
      expect(template).toContain(`${formatTemplateNumber(1.5, locale)} XLM`);
    });

    it("a non-English locale actually changes the output", () => {
      // Guards against the locale being threaded through but never applied.
      const english = generateEmailTemplate({
        ...localeOptions,
        locale: "en-US",
      });
      const german = generateEmailTemplate({ ...localeOptions, locale: "de-DE" });

      expect(german).not.toBe(english);
      expect(german).toContain("1,5 XLM");
      expect(english).toContain("1.5 XLM");
    });
  });

  describe("identifiers are never localized", () => {
    const ARABIC_INDIC = "ar-EG";

    it.each([...LOCALES, ARABIC_INDIC])(
      "the G-address survives %s byte-for-byte",
      (locale) => {
        const template = generateEmailTemplate({ ...localeOptions, locale });
        expect(template).toContain(localeOptions.assetIssuer!);
      }
    );

    it.each([...LOCALES, ARABIC_INDIC])(
      "the asset code survives %s",
      (locale) => {
        const template = generateEmailTemplate({ ...localeOptions, locale });
        expect(template).toContain("USDC");
      }
    );

    it.each([...LOCALES, ARABIC_INDIC])(
      "the wave number stays a plain integer in %s",
      (locale) => {
        // A grouped "Wave 1.000" would be wrong in a subject line and a
        // filename — the wave number identifies a payout round, it is not a
        // quantity.
        const template = generateEmailTemplate({
          ...localeOptions,
          waveNumber: 1000,
          locale,
        });
        expect(template).toContain("Wave 1000 Payout Readiness Check");
      }
    );

    it("the support email survives every locale", () => {
      for (const locale of LOCALES) {
        expect(
          generateEmailTemplate({ ...localeOptions, locale })
        ).toContain("help@example.com");
      }
    });
  });

  // Snapshot keys are explicit and locale-scoped so a new locale appends a
  // record rather than renumbering every existing one.
  describe("locale snapshots", () => {
    const FORMATS: TemplateFormat[] = ["email", "markdown", "plain"];

    for (const format of FORMATS) {
      for (const locale of LOCALES) {
        it(`${format} template renders for ${locale}`, () => {
          const template = generateTemplate(format, {
            ...localeOptions,
            locale,
          });
          expect(template).toMatchSnapshot(`${format}--${locale}`);
        });
      }
    }
  });

  describe("backwards compatibility", () => {
    it("omitting the locale reproduces the previous en-US output", () => {
      const withoutLocale = generateEmailTemplate(localeOptions);
      const withEnUs = generateEmailTemplate({
        ...localeOptions,
        locale: "en-US",
      });

      expect(withoutLocale).toBe(withEnUs);
      expect(withoutLocale).toContain("August 1, 2026");
    });
  });
});
