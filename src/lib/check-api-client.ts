import type { HorizonCheckResult } from "@/types";

/**
 * Client-side wrapper around `POST /api/check`.
 *
 * The route itself already encodes several distinct outcomes (see
 * `src/app/api/check/route.ts`), but they arrive over the wire in
 * inconsistent shapes:
 *  - Rate limiting is a genuine HTTP 429 with a `Retry-After` header.
 *  - A circuit-breaker-open / transient Horizon failure is still HTTP 200,
 *    with a normal `HorizonCheckResult` body whose `errors` array contains a
 *    recognizable string (`"...temporarily unavailable..."` or a
 *    `"Horizon error: ..."` prefix). There is no dedicated status code or
 *    field for this today, and changing that is out of scope for this
 *    change — we only need to recognize the existing convention.
 *  - Anything else non-2xx is a generic error.
 *  - The request itself can hang (Horizon retries/circuit breaker can sit
 *    for a while) — there is no client-side timeout today, so we add one
 *    here via `AbortController`.
 *
 * This helper normalizes all of that into a single discriminated union so
 * UI code can `switch` on `outcome.kind` instead of re-deriving these rules.
 */

/** How long to wait for `/api/check` before treating the request as timed out. */
export const CHECK_TIMEOUT_MS = 10_000;

export type CheckOutcome =
  | { kind: "ok"; result: HorizonCheckResult }
  | { kind: "rate_limited"; retryAfterSeconds: number | null; errors: string[] }
  | { kind: "circuit_open"; errors: string[] }
  | { kind: "timeout" }
  | { kind: "network_error" }
  | { kind: "error"; status: number; errors: string[] };

/**
 * True when a successful (HTTP 200) `HorizonCheckResult`'s `errors` match the
 * known transient-Horizon-failure conventions emitted by `src/lib/horizon.ts`
 * (circuit breaker open, or a generic wrapped Horizon error).
 */
function isTransientHorizonError(errors: string[] | undefined): boolean {
  if (!errors || errors.length === 0) return false;
  return errors.some(
    (error) =>
      error.includes("temporarily unavailable") ||
      error.startsWith("Horizon error:")
  );
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * POST an address to `/api/check` and normalize the response into a
 * `CheckOutcome`. Never throws — all failure modes (timeout, network error,
 * non-2xx status, transient Horizon failure) are represented as outcomes.
 */
export async function checkAddressViaApi(
  address: string,
  options: { assetCode?: string; assetIssuer?: string } = {}
): Promise<CheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        asset_code: options.assetCode,
        asset_issuer: options.assetIssuer,
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const body = (await response.json().catch(() => ({}))) as {
        errors?: string[];
      };
      return {
        kind: "rate_limited",
        retryAfterSeconds: parseRetryAfter(response),
        errors: body.errors ?? ["Rate limit exceeded. Please try again later."],
      };
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        errors?: string[];
      };
      return {
        kind: "error",
        status: response.status,
        errors: body.errors ?? ["Failed to check address"],
      };
    }

    const result = (await response.json()) as HorizonCheckResult;

    if (isTransientHorizonError(result.errors)) {
      return { kind: "circuit_open", errors: result.errors };
    }

    return { kind: "ok", result };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "timeout" };
    }
    // A same-shaped abort can also surface as a plain Error in some
    // environments (e.g. jsdom/node-fetch polyfills) rather than a
    // DOMException — treat any "aborted"-named error the same way.
    if (
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message))
    ) {
      return { kind: "timeout" };
    }
    return { kind: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
