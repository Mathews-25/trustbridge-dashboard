/**
 * Client-side interpretation of `POST /api/register` failures (issue #146).
 *
 * Pure, and deliberately separate from `RegisterClient` — the optimistic save
 * rolls back differently depending on *why* the server refused, and that
 * decision is worth testing without a DOM.
 *
 * Codes come from `REGISTER_ERROR_CODES` in the route. Status is the fallback
 * for anything older or unexpected, so a deployment where the client is ahead
 * of the server still degrades to a sensible message.
 */

export type RegisterFailureKind =
  | "address_taken"
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "network"
  | "server";

export interface RegisterFailure {
  kind: RegisterFailureKind;
  /** Shown to the contributor. Plain, and says what to do next. */
  message: string;
  /**
   * Whether the address the contributor typed is worth keeping in the form.
   * A taken address is not — they need a different wallet. An expired session
   * is: the address was fine, the session was not.
   */
  keepAddress: boolean;
  /** True when re-authenticating is the only useful next step. */
  requiresSignIn: boolean;
}

interface ErrorBody {
  error?: unknown;
  code?: unknown;
  validationErrors?: unknown;
}

function serverMessage(body: ErrorBody | null): string | null {
  return typeof body?.error === "string" && body.error.trim()
    ? body.error.trim()
    : null;
}

/**
 * Map a failed registration response to something the UI can act on.
 *
 * @param status HTTP status. `0` signals the request never completed.
 * @param body   Parsed JSON body, or null when the response had none.
 */
export function mapRegisterError(
  status: number,
  body: ErrorBody | null = null
): RegisterFailure {
  const code = typeof body?.code === "string" ? body.code : null;

  // 409 and 401 are the two that matter and the two most easily confused:
  // both mean "your save did not happen", but only one is recoverable by
  // editing the form.
  if (code === "ADDRESS_TAKEN" || status === 409) {
    return {
      kind: "address_taken",
      message:
        serverMessage(body) ??
        "That Stellar address is already registered to another contributor. Use a different wallet address, or contact a maintainer if you believe it is yours.",
      keepAddress: false,
      requiresSignIn: false,
    };
  }

  if (code === "UNAUTHORIZED" || status === 401) {
    return {
      kind: "unauthorized",
      message:
        "Your session has expired. Sign in with GitHub again — your address was not saved.",
      keepAddress: true,
      requiresSignIn: true,
    };
  }

  if (code === "FORBIDDEN_ORIGIN" || status === 403) {
    return {
      kind: "forbidden",
      message:
        "This request was blocked for security reasons. Reload the page and try again.",
      keepAddress: true,
      requiresSignIn: false,
    };
  }

  if (code === "VALIDATION_FAILED" || status === 400) {
    return {
      kind: "validation",
      // The server's message names the offending field; ours would not.
      message: serverMessage(body) ?? "That address could not be validated.",
      keepAddress: true,
      requiresSignIn: false,
    };
  }

  if (status === 0) {
    return {
      kind: "network",
      message:
        "Could not reach TrustBridge. Check your connection and try again — nothing was saved.",
      keepAddress: true,
      requiresSignIn: false,
    };
  }

  return {
    kind: "server",
    message:
      serverMessage(body) ??
      "Something went wrong saving your address. Try again in a moment.",
    keepAddress: true,
    requiresSignIn: false,
  };
}
