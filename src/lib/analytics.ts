/**
 * Analytics adapter for TrustBridge Dashboard.
 *
 * Provides a simple interface for tracking product events.
 * Defaults to a no-op when no analytics key is configured.
 *
 * Supported adapters:
 * - PostHog (if POSTHOG_API_KEY is set)
 * - Console logging (fallback for development)
 * - No-op (default when no key is configured)
 *
 * Environment variables:
 * - NEXT_PUBLIC_POSTHOG_API_KEY — enables PostHog in the browser
 * - NEXT_PUBLIC_POSTHOG_HOST   — optional PostHog ingestion host (browser)
 * - POSTHOG_API_KEY            — enables PostHog on the server (Node.js API routes)
 * - POSTHOG_HOST               — optional PostHog ingestion host (server)
 *
 * When neither key is set the adapter is a no-op; no events are sent and no
 * errors are raised. Set DEBUG=true to see console-logged events in development.
 */

export type EventType =
  | "registration_created"
  | "registration_updated"
  | "recheck_completed"
  | "batch_recheck_started"
  | "csv_exported"
  | "soroban_mirror_completed"
  | "dispute_opened"
  | "dispute_closed";

export interface AnalyticsEvent {
  type: EventType;
  timestamp: number;
  properties?: Record<string, unknown>;
}

interface AnalyticsAdapter {
  track(event: EventType, properties?: Record<string, unknown>): void;
  identify(userId: string, properties?: Record<string, unknown>): void;
  reset(): void;
}

/**
 * No-op adapter — used when no analytics key is configured.
 */
class NoOpAdapter implements AnalyticsAdapter {
  track(): void {
    // No-op
  }
  identify(): void {
    // No-op
  }
  reset(): void {
    // No-op
  }
}

/**
 * Console adapter — logs events to the console for development.
 */
class ConsoleAdapter implements AnalyticsAdapter {
  track(event: EventType, properties?: Record<string, unknown>): void {
    console.log(`[Analytics] ${event}`, properties);
  }
  identify(userId: string, properties?: Record<string, unknown>): void {
    console.log(`[Analytics] identify: ${userId}`, properties);
  }
  reset(): void {
    console.log("[Analytics] reset");
  }
}

/**
 * PostHog adapter — sends events to PostHog.
 * Requires POSTHOG_API_KEY and optionally POSTHOG_HOST.
 */
class PostHogAdapter implements AnalyticsAdapter {
  private apiKey: string;
  private host: string;
  private initialized = false;

  constructor(apiKey: string, host?: string) {
    this.apiKey = apiKey;
    this.host = host || "https://app.posthog.com";
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const posthog = await import("posthog-js").then((m) => m.default);
      posthog.init(this.apiKey, {
        api_host: this.host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
      });
      this.initialized = true;
    } catch {
      console.warn("[Analytics] Failed to initialize PostHog");
    }
  }

  async track(event: EventType, properties?: Record<string, unknown>): Promise<void> {
    await this.init();
    try {
      const posthog = await import("posthog-js").then((m) => m.default);
      posthog.capture(event, properties);
    } catch {
      // Silently ignore — analytics should never block the user
    }
  }

  async identify(userId: string, properties?: Record<string, unknown>): Promise<void> {
    await this.init();
    try {
      const posthog = await import("posthog-js").then((m) => m.default);
      posthog.identify(userId, properties);
    } catch {
      // Silently ignore
    }
  }

  async reset(): Promise<void> {
    try {
      const posthog = await import("posthog-js").then((m) => m.default);
      posthog.reset();
    } catch {
      // Silently ignore
    }
  }
}

/**
 * Get the analytics adapter instance.
 * Returns a no-op adapter when no key is configured.
 */
function getAnalyticsAdapter(): AnalyticsAdapter {
  if (typeof window === "undefined") {
    // Server-side: no-op
    return new NoOpAdapter();
  }

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY?.trim();
  if (posthogKey) {
    return new PostHogAdapter(posthogKey, process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim());
  }

  // Development fallback: console logging
  if (process.env.NODE_ENV === "development") {
    return new ConsoleAdapter();
  }

  return new NoOpAdapter();
}

const adapter = getAnalyticsAdapter();

/**
 * Track a registration event.
 */
export function trackRegistrationCreated(properties?: {
  userId?: string;
  stellarAddress?: string;
}): void {
  adapter.track("registration_created", properties);
}

/**
 * Track a registration update event.
 */
export function trackRegistrationUpdated(properties?: {
  userId?: string;
  stellarAddress?: string;
  fieldsChanged?: string[];
}): void {
  adapter.track("registration_updated", properties);
}

/**
 * Track a recheck completion event.
 */
export function trackRecheckCompleted(properties?: {
  totalChecked?: number;
  changed?: number;
  durationMs?: number;
}): void {
  adapter.track("recheck_completed", properties);
}

/**
 * Track a batch recheck start event.
 */
export function trackBatchRecheckStarted(properties?: {
  totalRegistrations?: number;
}): void {
  adapter.track("batch_recheck_started", properties);
}

/**
 * Track a CSV export event.
 */
export function trackCsvExported(properties?: {
  rowCount?: number;
}): void {
  adapter.track("csv_exported", properties);
}

/**
 * Track a Soroban mirror completion event.
 */
export function trackSorobanMirrorCompleted(properties?: {
  success?: boolean;
  txHash?: string;
  durationMs?: number;
}): void {
  adapter.track("soroban_mirror_completed", properties);
}

/**
 * Identify a user for analytics.
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  adapter.identify(userId, properties);
}

/**
 * Reset analytics state (e.g., on logout).
 */
export function resetAnalytics(): void {
  adapter.reset();
}

// ---------------------------------------------------------------------------
// Server-side analytics
// ---------------------------------------------------------------------------

/**
 * Lightweight server-side adapter.
 *
 * Uses the PostHog Events API (server-to-server) when POSTHOG_API_KEY is set,
 * falls back to console logging in development, and is a no-op otherwise.
 * Never throws — analytics must not affect request latency or correctness.
 *
 * Issue #516 — identify() attaches maintainerOrgId as a PostHog group property
 * when present, enabling org-scoped analytics for multi-tenant deployments.
 * Stellar addresses and access tokens are never sent.
 */
class ServerPostHogAdapter implements AnalyticsAdapter {
  private readonly apiKey: string;
  private readonly host: string;

  constructor(apiKey: string, host?: string) {
    this.apiKey = apiKey;
    this.host = (host ?? "https://app.posthog.com").replace(/\/$/, "");
  }

  track(event: EventType, properties?: Record<string, unknown>): void {
    const body = JSON.stringify({
      api_key: this.apiKey,
      event,
      distinct_id: (properties?.userId as string | undefined) ?? "server",
      properties: { ...properties, $lib: "trustbridge-server" },
      timestamp: new Date().toISOString(),
    });

    // Fire-and-forget — do not await, do not throw
    fetch(`${this.host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {
      // Silently ignore network errors — analytics must never affect the app
    });
  }

  /**
   * Issue #516 — server-side identify with org scope.
   *
   * Sends a PostHog `$identify` event attaching the user to their maintainer
   * org via a `$groups` property so PostHog dashboards can filter by
   * organisation without exposing PII.
   *
   * Rules:
   *   - Anonymous / empty userId → no-op (no pollution of the identify stream)
   *   - Never sends stellarAddress, publicKey, or any access token
   *   - maintainerOrgId attached to both `$set` and `$groups` when present
   */
  identify(userId: string, properties?: Record<string, unknown>): void {
    if (!userId || userId === "anonymous") return;

    const maintainerOrgId = properties?.maintainerOrgId as string | undefined;

    const payload: Record<string, unknown> = {
      api_key: this.apiKey,
      event: "$identify",
      distinct_id: userId,
      $set: {
        // Safe properties only — no tokens, no Stellar addresses.
        ...(maintainerOrgId ? { maintainerOrgId } : {}),
        ...(properties?.githubUsername ? { githubUsername: properties.githubUsername } : {}),
        ...(properties?.role ? { role: properties.role } : {}),
        $lib: "trustbridge-server",
      },
      timestamp: new Date().toISOString(),
    };

    // Attach org group when maintainerOrgId is present so PostHog can
    // aggregate events by organisation in group analytics dashboards.
    if (maintainerOrgId) {
      payload.$groups = { organisation: maintainerOrgId };
    }

    fetch(`${this.host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Never throw — analytics must not block requests
    });
  }

  reset(): void {
    // No-op on the server
  }
}

function getServerAnalyticsAdapter(): AnalyticsAdapter {
  const posthogKey = process.env.POSTHOG_API_KEY?.trim();
  if (posthogKey) {
    return new ServerPostHogAdapter(
      posthogKey,
      process.env.POSTHOG_HOST?.trim()
    );
  }

  if (process.env.NODE_ENV === "development") {
    return new ConsoleAdapter();
  }

  return new NoOpAdapter();
}

// Lazily initialised — only constructed when first used in a server context.
let _serverAdapter: AnalyticsAdapter | null = null;
function serverAdapter(): AnalyticsAdapter {
  if (!_serverAdapter) _serverAdapter = getServerAnalyticsAdapter();
  return _serverAdapter;
}

function trackServerEvent(event: EventType, properties?: Record<string, unknown>): void {
  try {
    serverAdapter().track(event, properties);
  } catch {
    // Analytics must never affect request handling.
  }
}

/**
 * Track a registration event from a server-side API route.
 * No-op when POSTHOG_API_KEY is not set.
 */
export function trackServerRegistrationCreated(properties?: {
  userId?: string;
  stellarAddress?: string;
}): void {
  trackServerEvent("registration_created", properties);
}

/**
 * Track a registration update event from a server-side API route.
 * No-op when POSTHOG_API_KEY is not set.
 */
export function trackServerRegistrationUpdated(properties?: {
  userId?: string;
  stellarAddress?: string;
  fieldsChanged?: string[];
}): void {
  trackServerEvent("registration_updated", properties);
}

/**
 * Track a CSV export event from a server-side API route or cron job.
 * No-op when POSTHOG_API_KEY is not set.
 */
export function trackServerCsvExported(properties?: {
  rowCount?: number;
  triggeredBy?: string;
}): void {
  trackServerEvent("csv_exported", properties);
}

/**
 * Track a batch recheck start from a server-side API route.
 * No-op when POSTHOG_API_KEY is not set.
 */
export function trackServerBatchRecheckStarted(properties?: {
  totalRegistrations?: number;
  initiatedBy?: string;
}): void {
  trackServerEvent("batch_recheck_started", properties);
}

/** Track a dispute opening from a server-side API route. */
export function trackServerDisputeOpened(properties?: {
  userId?: string;
  disputeId?: string;
  registrationId?: string;
  actorRole?: "maintainer" | "contributor";
  hasProof?: boolean;
}): void {
  trackServerEvent("dispute_opened", properties);
}

/** Track the first transition of a dispute from OPEN to a terminal status. */
export function trackServerDisputeClosed(properties?: {
  userId?: string;
  disputeId?: string;
  status?: "VALIDATED" | "REJECTED";
}): void {
  trackServerEvent("dispute_closed", properties);
}

/**
 * Identify a maintainer session on the server with org scope (issue #516).
 *
 * Call this from:
 *   - NextAuth `signIn` / `jwt` callbacks after a successful session is established
 *   - API-key authenticated routes (pass the key's owning org as maintainerOrgId)
 *
 * Safe properties only — never pass Stellar addresses or access tokens.
 * No-op when POSTHOG_API_KEY is not set or when userId is absent/anonymous.
 */
export function identifyServerUser(
  userId: string,
  properties?: {
    maintainerOrgId?: string;
    githubUsername?: string;
    role?: string;
  },
): void {
  serverAdapter().identify(userId, properties);
}
