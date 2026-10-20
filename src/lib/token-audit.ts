import "server-only";

import { prisma } from "@/lib/prisma";
import { StructuredLogger } from "@/lib/logger";

export type TokenAuditAction =
  | "token_encrypted_at_signin"
  | "token_encryption_skipped"
  | "token_decrypted"
  | "token_decrypt_failed";

const logger = new StructuredLogger("token-audit");

/**
 * Best-effort audit trail for access-token lifecycle events (encrypt/decrypt).
 * Never throws — a logging failure must not block sign-in or token reads.
 *
 * Write failures are routed through StructuredLogger so they share the same
 * log correlation fields as the rest of the application and are picked up by
 * any log-shipping / redaction pipeline. Raw error objects and token values
 * are never forwarded — only the error message string is included.
 */
export async function recordTokenAudit(
  userId: string,
  action: TokenAuditAction,
  success: boolean,
  detail?: string
): Promise<void> {
  try {
    await prisma.tokenAuditLog.create({
      data: { userId, action, success, detail },
    });
  } catch (error) {
    logger.error("token_audit_write_failed", {
      userId,
      action,
      success,
      // Only forward the message string — the full Error object can embed
      // stack frames and interpolated values that may contain secrets.
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
