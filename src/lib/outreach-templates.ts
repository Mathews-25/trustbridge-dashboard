import { ACTION_DEFAULTS } from "@/lib/constants";

export type TemplateFormat = "email" | "markdown" | "plain";

/**
 * Locale used when a caller does not pick one.
 *
 * Not a claim that English is the default language of the project — it is the
 * language the template prose is written in, so formatting dates in some other
 * locale beside English prose would read worse than leaving them alone.
 * Translating the prose is the separate, larger job.
 */
export const DEFAULT_TEMPLATE_LOCALE = "en-US";

/**
 * Deadlines are calendar dates, not instants.
 *
 * The generator's `<input type="date">` yields "2026-08-01", which `new Date()`
 * reads as **UTC** midnight. Formatting that in the maintainer's local zone
 * moves the deadline to 31 July for everyone west of Greenwich — a contributor
 * in Los Angeles would be told to act a day earlier than the campaign intends.
 * Formatting in UTC keeps the rendered day equal to the day that was picked.
 * Callers with a genuine wall-clock deadline can pass their own `timeZone`.
 */
export const DEFAULT_TEMPLATE_TIME_ZONE = "UTC";

/**
 * Locales offered in the generator UI. Anything BCP 47 works at the library
 * level — this is the shortlist the campaigns actually run in.
 */
export const SUPPORTED_TEMPLATE_LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "es-MX", label: "Español (México)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "ja-JP", label: "日本語" },
] as const;

export type SupportedTemplateLocale =
  (typeof SUPPORTED_TEMPLATE_LOCALES)[number]["value"];

export interface TemplateOptions {
  contributorName?: string;
  waveNumber?: number;
  deadline?: Date;
  minXlmBalance?: number;
  supportEmail?: string;
  assetCode?: string;
  assetIssuer?: string;
  /** BCP 47 tag for dates and numbers. Defaults to `DEFAULT_TEMPLATE_LOCALE`. */
  locale?: string;
  /** IANA zone the deadline is rendered in. Defaults to UTC — see above. */
  timeZone?: string;
}

/**
 * Format a deadline for human prose.
 *
 * Only ever used on the deadline. Machine-readable surfaces — the CSV export
 * (`src/lib/csv.ts`), API payloads, audit records — must keep emitting ISO
 * 8601, because a spreadsheet that receives "1 de agosto de 2026" cannot be
 * parsed back into a date. Use `formatMachineDate()` for those.
 */
export function formatTemplateDate(
  date: Date,
  locale: string = DEFAULT_TEMPLATE_LOCALE,
  timeZone: string = DEFAULT_TEMPLATE_TIME_ZONE
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}

/**
 * Format a quantity for human prose.
 *
 * Applies to the XLM reserve figure only. A German contributor reading
 * "1.5 XLM" can reasonably parse it as one and a half thousand; "1,5 XLM" is
 * the number they expect.
 */
export function formatTemplateNumber(
  value: number,
  locale: string = DEFAULT_TEMPLATE_LOCALE
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 7,
  }).format(value);
}

/**
 * ISO 8601 (YYYY-MM-DD) for machine-readable output. Never locale-dependent.
 */
export function formatMachineDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Values that must survive every locale byte-for-byte.
 *
 * A Stellar G-address is a base-32 identifier: run it through a locale that
 * uses Arabic-Indic digits and it stops resolving on-network. The same goes
 * for the wave number, which is an identifier in a subject line and a
 * filename, not a quantity — "Wave 1.000" would be wrong in de-DE.
 */
function formatIdentifier(value: string | number): string {
  return String(value);
}

export function generateEmailTemplate(options: TemplateOptions): string {
  const {
    contributorName = "Contributor",
    waveNumber = 1,
    deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    minXlmBalance = ACTION_DEFAULTS.minXlmReserve,
    supportEmail = "support@trustbridge.dev",
    assetCode = ACTION_DEFAULTS.assetCode,
    assetIssuer = ACTION_DEFAULTS.assetIssuer,
    locale = DEFAULT_TEMPLATE_LOCALE,
    timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
  } = options;

  const wave = formatIdentifier(waveNumber);
  const deadlineText = formatTemplateDate(deadline, locale, timeZone);
  const minXlm = formatTemplateNumber(minXlmBalance, locale);

  return `Subject: Wave ${wave} Payout Readiness Check

Dear ${contributorName},

Thank you for being part of the TrustBridge Wave ${wave}!

To ensure you receive your payout successfully, please complete the following checklist by ${deadlineText}:

**Step 1: Fund Your Stellar Account**
- Ensure your Stellar G-address has at least ${minXlm} XLM for transaction fees and reserves
- You can purchase XLM from any Stellar-supported exchange

**Step 2: Set Up ${assetCode} Trustline**
- Log into your Stellar wallet (Lobstr, Stellar.Expert, or similar)
- Add a trustline for ${assetCode} from issuer: ${assetIssuer}
- Mark the trustline as authorized if your wallet prompts you

**Step 3: Verify via TrustBridge Dashboard**
- Visit: https://trustbridge.dev/dashboard
- Sign in with your GitHub account
- Check that your status shows "Ready" (✅)

**Wallet Proof (if requested)**
- Screenshot your Stellar account showing:
  - Your public address (G-address)
  - XLM balance ≥ ${minXlm}
  - Active ${assetCode} trustline with authorization status

**Need Help?**
If you encounter any issues, please:
1. Check the TrustBridge docs: https://docs.trustbridge.dev
2. Review common issues: https://docs.trustbridge.dev/troubleshooting
3. Contact support: ${supportEmail}

We look forward to Wave ${wave}!

Best regards,
The TrustBridge Team`;
}

export function generateMarkdownTemplate(options: TemplateOptions): string {
  const {
    contributorName = "Contributor",
    waveNumber = 1,
    deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    minXlmBalance = ACTION_DEFAULTS.minXlmReserve,
    supportEmail = "support@trustbridge.dev",
    assetCode = ACTION_DEFAULTS.assetCode,
    assetIssuer = ACTION_DEFAULTS.assetIssuer,
    locale = DEFAULT_TEMPLATE_LOCALE,
    timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
  } = options;

  const wave = formatIdentifier(waveNumber);
  const deadlineText = formatTemplateDate(deadline, locale, timeZone);
  const minXlm = formatTemplateNumber(minXlmBalance, locale);

  return `# Wave ${wave} Payout Readiness

Hi ${contributorName}! 👋

Thank you for being part of Wave ${wave}. To receive your payout, complete this checklist by **${deadlineText}**:

## ✅ Checklist

### 1. Fund Your Stellar Account
- [ ] Stellar account has ≥ ${minXlm} XLM
- [ ] XLM covers transaction fees and reserves

### 2. Set Up ${assetCode} Trustline
- [ ] Added trustline for ${assetCode}
- [ ] Issuer: \`${assetIssuer}\`
- [ ] Trustline is authorized

### 3. Verify on TrustBridge
- [ ] Open https://trustbridge.dev/dashboard
- [ ] Dashboard shows status: **Ready** ✅
- [ ] Last checked: Today or recent

## 📸 Wallet Proof

If requested, provide a screenshot showing:
- Your Stellar public address
- XLM balance ≥ ${minXlm}
- ${assetCode} trustline (authorized)

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Low XLM balance | Purchase XLM from an exchange |
| Can't add trustline | Check wallet supports ${assetCode} |
| Trustline unauthorized | Contact issuer to authorize |

**Questions?** → ${supportEmail}`;
}

export function generatePlainTemplate(options: TemplateOptions): string {
  const {
    contributorName = "Contributor",
    waveNumber = 1,
    deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    minXlmBalance = ACTION_DEFAULTS.minXlmReserve,
    supportEmail = "support@trustbridge.dev",
    assetCode = ACTION_DEFAULTS.assetCode,
    assetIssuer = ACTION_DEFAULTS.assetIssuer,
    locale = DEFAULT_TEMPLATE_LOCALE,
    timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
  } = options;

  const wave = formatIdentifier(waveNumber);
  const deadlineText = formatTemplateDate(deadline, locale, timeZone);
  const minXlm = formatTemplateNumber(minXlmBalance, locale);

  return `WAVE ${wave} PAYOUT READINESS CHECKLIST
${"=".repeat(50)}

Hello ${contributorName},

To receive your Wave ${wave} payout by ${deadlineText}, complete:

STEP 1: Fund Your Stellar Account
- Ensure at least ${minXlm} XLM in your account
- This covers transaction fees and minimum reserve

STEP 2: Add ${assetCode} Trustline
- Open your Stellar wallet
- Add trustline for ${assetCode}
- Issuer: ${assetIssuer}
- Set trustline authorization to: Authorized

STEP 3: Verify via TrustBridge Dashboard
- Visit: https://trustbridge.dev/dashboard
- Sign in with GitHub
- Confirm status shows: Ready (✅)

WALLET PROOF (if required)
- Screenshot your Stellar account showing:
  - Your public address (starts with G)
  - XLM balance of at least ${minXlm}
  - Active ${assetCode} trustline

NEED HELP?
- Documentation: https://docs.trustbridge.dev
- Common issues: https://docs.trustbridge.dev/troubleshooting
- Email support: ${supportEmail}

Ready for Wave ${wave}!
The TrustBridge Team`;
}

export function generateTemplate(
  format: TemplateFormat,
  options: TemplateOptions
): string {
  switch (format) {
    case "email":
      return generateEmailTemplate(options);
    case "markdown":
      return generateMarkdownTemplate(options);
    case "plain":
      return generatePlainTemplate(options);
    default:
      throw new Error(`Unknown template format: ${format}`);
  }
}
