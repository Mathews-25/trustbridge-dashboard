import "server-only";

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}
import { createHash } from "node:crypto";

import enMessages from "../../public/locales/en.json";
import esMessages from "../../public/locales/es.json";
import ptMessages from "../../public/locales/pt.json";
import { resolveLocale, type SupportedLocale } from "@/lib/i18n-config";
import { withRetry } from "@/lib/retry";
import { recordAuditLog } from "@/lib/audit";

const EMAIL_MESSAGES: Record<SupportedLocale, typeof enMessages.email> = {
  en: enMessages.email,
  es: esMessages.email,
  pt: ptMessages.email,
};

export interface LocalizedEmailTemplate {
  subject: string;
  body: string;
}

export interface InviteEmailDetails {
  inviteCode: string;
  recipientName?: string;
  expiresAt?: Date | string | null;
  locale?: string;
}

export interface BanEmailDetails {
  githubUsername: string;
  reason: string;
  locale?: string;
}

export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  recipientName?: string;
  idempotencyScope?: string;
  attachments?: EmailAttachment[];
}

export interface NotReadyNotification extends EmailNotification {
  contributorUsername: string;
  reason: "unfunded" | "no_trustline" | "low_reserve";
  lastCheckedAt?: Date;
}

export interface ContributorNudgeEmailDetails {
  contributorUsername: string;
  note?: string;
  reason?: "unfunded" | "no_trustline" | "low_reserve";
  lastCheckedAt?: Date | string | null;
  locale?: string;
}

export function buildInviteEmail(
  details: InviteEmailDetails
): LocalizedEmailTemplate {
  const locale = resolveLocale(
    typeof details.locale === "string" ? details.locale : undefined
  );
  const messages = EMAIL_MESSAGES[locale].invite;
  const inviteCode = details.inviteCode.trim();
  if (!inviteCode) throw new Error("Invite code is required");

  const recipientName = details.recipientName?.trim() || messages.greetingFallback;
  const expiryDate = formatEmailDate(details.expiresAt, locale);
  const registrationUrl = getRegistrationUrl();

  return {
    subject: messages.subject,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#212529;">
  <h2>${messages.heading}</h2>
  <p>${interpolateEmailText(messages.greeting, { recipientName })}</p>
  <p>${messages.codeLabel}: <strong><code>${escapeHtml(inviteCode)}</code></strong></p>
  <p>${expiryDate ? interpolateEmailText(messages.expires, { date: expiryDate }) : messages.noExpiry}</p>
  <p>${messages.instructions}</p>
  <p><a href="${escapeHtml(registrationUrl)}">${messages.action}</a></p>
</div>`.trim(),
  };
}

export function buildBanEmail(details: BanEmailDetails): LocalizedEmailTemplate {
  const locale = resolveLocale(
    typeof details.locale === "string" ? details.locale : undefined
  );
  const messages = EMAIL_MESSAGES[locale].ban;
  const githubUsername = details.githubUsername.trim();
  const reason = details.reason.trim();
  if (!githubUsername) throw new Error("GitHub username is required");
  if (!reason) throw new Error("Ban reason is required");

  return {
    subject: messages.subject,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#212529;">
  <h2>${messages.heading}</h2>
  <p>${interpolateEmailText(messages.greeting, { githubUsername })}</p>
  <p><strong>${messages.reasonLabel}:</strong> ${escapeHtml(reason)}</p>
  <p>${messages.nextSteps}</p>
</div>`.trim(),
  };
}

/**
 * Build a contributor nudge email. All interpolated user-controlled values
 * (username, note) are HTML-escaped before being placed into the template so
 * that malicious fixtures cannot inject markup or break out of attributes.
 *
 * Safe template variables: `{contributorUsername}`, `{note}`, `{reason}`,
 * `{lastCheckedAt}`. Unknown placeholders resolve to an empty string.
 */
export function buildContributorNudgeEmail(
  details: ContributorNudgeEmailDetails
): LocalizedEmailTemplate {
  const locale = resolveLocale(
    typeof details.locale === "string" ? details.locale : undefined
  );
  const messages = EMAIL_MESSAGES[locale].nudge;
  const contributorUsername = details.contributorUsername.trim();
  if (!contributorUsername) throw new Error("Contributor username is required");

  const note = details.note?.trim() || messages.noteFallback;
  const reason = details.reason
    ? messages.reasons[details.reason]
    : messages.reasons.unfunded;
  const lastCheckedAt = formatEmailDate(details.lastCheckedAt, locale);

  return {
    subject: messages.subject,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#212529;">
  <h2>${messages.heading}</h2>
  <p>${interpolateEmailText(messages.greeting, { contributorUsername })}</p>
  <p><strong>${messages.reasonLabel}:</strong> ${escapeHtml(reason)}</p>
  <p>${interpolateEmailText(messages.note, { note })}</p>
  ${lastCheckedAt ? `<p>${interpolateEmailText(messages.lastChecked, { lastCheckedAt })}</p>` : ""}
  <p>${messages.nextSteps}</p>
</div>`.trim(),
  };
}

function formatEmailDate(
  value: Date | string | null | undefined,
  locale: SupportedLocale
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

function getRegistrationUrl(): string {
  try {
    const url = new URL(
      "/register",
      process.env.NEXTAUTH_URL?.trim() || "https://trustbridge.dev"
    );
    if (url.protocol === "https:" || url.hostname === "localhost") {
      return url.toString();
    }
  } catch {
    // Fall back to the canonical registration page for malformed configuration.
  }
  return "https://trustbridge.dev/register";
}

function interpolateEmailText(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    escapeHtml(values[key] ?? "")
  );
}

/**
 * Escape a value for safe interpolation into HTML text and attribute
 * contexts. Escapes `&`, `<`, `>`, `"`, `'` so malicious fixtures cannot
 * inject tags, scripts, or break out of quoted attributes.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Maximum number of send attempts (including the first).
 * Configurable via EMAIL_MAX_ATTEMPTS env var, capped at 5.
 */
function getMaxAttempts(): number {
  const raw = Number.parseInt(process.env.EMAIL_MAX_ATTEMPTS ?? "3", 10);
  return Math.min(Math.max(1, Number.isFinite(raw) ? raw : 3), 5);
}

/**
 * Deterministic idempotency key derived from recipient + subject.
 * Prevents duplicate emails when Resend retries a 429 and the first
 * request actually succeeded (network timeout, etc.).
 */
function buildIdempotencyKey(
  to: string,
  subject: string,
  scope?: string
): string {
  const payload = scope ? `${to}:${subject}:${scope}` : `${to}:${subject}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export async function sendEmailNotification(
  notification: EmailNotification
): Promise<boolean> {
  const emailService = process.env.EMAIL_SERVICE || "console";

  if (emailService === "console") {
    return sendViaConsole(notification);
  }

  if (emailService === "resend") {
    return sendViaResend(notification);
  }

  console.warn(`Unknown EMAIL_SERVICE: ${emailService}, falling back to console`);
  return sendViaConsole(notification);
}

async function sendViaConsole(
  notification: EmailNotification
): Promise<boolean> {
  console.log(`[EMAIL] To: ${notification.to}`);
  console.log(`[EMAIL] Subject: ${notification.subject}`);
  console.log(`[EMAIL] Body:\n${notification.body}`);
  if (notification.attachments && notification.attachments.length > 0) {
    console.log(
      `[EMAIL] Attachments: ${notification.attachments
        .map((a) => `${a.filename} (${a.content.length} bytes)`)
        .join(", ")}`
    );
  }
  return true;
}

/**
 * Retryable HTTP error from Resend (429 = rate limit, 5xx = transient).
 * 4xx except 429 are permanent failures — don't retry.
 */
function isRetryableResendError(error: unknown): boolean {
  if (error instanceof ResendApiError) {
    if (error.status === 429) return true;
    if (error.status >= 500) return true;
    return false;
  }
  // Network errors, timeouts, etc. — retry
  return true;
}

class ResendApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ResendApiError";
  }
}

async function sendViaResend(
  notification: EmailNotification
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, email not sent");
    return false;
  }

  const maxAttempts = getMaxAttempts();
  const idempotencyKey = buildIdempotencyKey(
    notification.to,
    notification.subject,
    notification.idempotencyScope
  );

  try {
    const payload: Record<string, unknown> = {
      from: process.env.EMAIL_FROM || "noreply@trustbridge.dev",
      to: notification.to,
      subject: notification.subject,
      html: notification.body,
    };

    if (notification.attachments && notification.attachments.length > 0) {
      payload.attachments = notification.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
      }));
    }

    await withRetry(
      async () => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new ResendApiError(
            `Resend API error: ${response.status} ${response.statusText} ${body}`.trim(),
            response.status
          );
        }
      },
      {
        maxAttempts,
        shouldRetry: isRetryableResendError,
      }
    );

    await recordAuditLog({
      action: "email.sent",
      actor: "system",
      metadata: {
        to: notification.to,
        subject: notification.subject,
        idempotencyKey,
      },
    }).catch(() => undefined);

    return true;
  } catch (error) {
    console.error(
      `[EMAIL] Failed to send to ${notification.to}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
