export type RegistryMode = "live" | "synced";

const VALID_MODES = new Set<RegistryMode>(["live", "synced"]);

/**
 * Resolves the dashboard's registry mode, shared by every contributor-facing
 * REST endpoint instead of each route re-deriving it independently:
 *
 * - `"live"` (default): reads reflect whatever is currently persisted, and
 *   maintainers are expected to trigger a Horizon recheck (`POST
 *   /api/contributors`, `/api/contributors/[id]`) to refresh it.
 * - `"synced"`: signals that a scheduled contract-to-Postgres sync job
 *   (`src/lib/contract-sync.ts`) is responsible for keeping registration
 *   rows fresh, so read endpoints can trust Postgres without prompting a
 *   maintainer to manually recheck.
 *
 * Reads are identical in both modes (Postgres is always the source of
 * truth) — the mode only changes what a route reports about how fresh that
 * data is expected to be. An unrecognized value falls back to `"live"`
 * rather than failing closed, so a typo'd env var never breaks reads.
 */
export function getRegistryMode(): RegistryMode {
  const raw = process.env.REGISTRY_MODE?.trim().toLowerCase();
  return raw && VALID_MODES.has(raw as RegistryMode)
    ? (raw as RegistryMode)
    : "live";
}
