import { NextResponse } from "next/server";

import type { HorizonCheckResult, ReadinessStatus } from "@/types";

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

export function emptyCheckResult(
  readiness: ReadinessStatus = "not_ready",
  errors: string[] = [],
): HorizonCheckResult {
  return {
    funded: false,
    trustline: false,
    trustline_authorized: false,
    verified: false,
    xlm_balance: "0",
    spendable_xlm_balance: "0",
    usdc_balance: "0",
    errors,
    readiness,
  };
}

/**
 * Read the idempotency key supplied by the check-api client on mutation
 * requests (e.g. recheck). Returns a trimmed key or null when absent/blank so
 * callers can reject malformed input with a stable error.
 */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (raw === null) return null;
  const key = raw.trim();
  return key.length > 0 ? key : null;
}

export function jsonCheckError(
  errors: string[],
  status: number,
  readiness: ReadinessStatus = "not_ready",
) {
  return NextResponse.json(emptyCheckResult(readiness, errors), { status });
}

export function jsonCheckResult(result: HorizonCheckResult, status = 200) {
  return NextResponse.json(result, { status });
}
