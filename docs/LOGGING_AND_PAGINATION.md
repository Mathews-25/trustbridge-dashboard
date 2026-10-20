# Logging and Pagination

## Structured Logging (`src/lib/logger.ts`)

TrustBridge Dashboard uses a **server-only** structured logger that emits JSON log lines. This keeps logs machine-parseable for log collectors (Datadog, Papertrail, CloudWatch, etc.) and ensures the logger never lands in client bundles.

### Importing

```ts
// Library code with no request context (e.g. background queue, soroban-register):
import { logger } from "@/lib/logger";

// Per-request context inside a route handler or server action:
import { createRequestLogger } from "@/lib/logger";
const reqLogger = createRequestLogger(crypto.randomUUID());
```

### Log levels

| Method | Destination | When to use |
|--------|------------|-------------|
| `logger.debug(msg, meta?)` | stdout | Verbose detail, only emits when `DEBUG=true` |
| `logger.info(msg, meta?)` | stdout | Normal operational events |
| `logger.warn(msg, meta?)` | stderr | Unexpected but recoverable conditions |
| `logger.error(msg, meta?)` | stderr | Failures that need on-call attention |

### JSON log shape

Every entry contains:

```json
{
  "level": "info",
  "message": "soroban_mirror_attempted",
  "context": "app",
  "timestamp": "2024-10-20T14:00:00.000Z",
  "...additional metadata fields..."
}
```

### `serializeError(error)`

Use `serializeError` to safely turn any thrown value into a plain object for embedding in a log entry:

```ts
import { logger, serializeError } from "@/lib/logger";

try {
  await riskyOperation();
} catch (err) {
  logger.error("operation_failed", { error: serializeError(err) });
}
```

`serializeError` handles:
- `Error` instances → `{ name, message, stack, cause? }`
- Non-`Error` thrown values → `{ raw: String(value) }`
- `cause` chains are serialized one level deep to bound log size.

### Child loggers

Child loggers inherit all parent fields and add their own. Each child is an independent instance — no shared mutable state:

```ts
const sorobanLogger = logger.child({
  subsystem: "soroban-register",
  registrationId: reg.id,
  contractId: process.env.SOROBAN_CONTRACT_ID,
});
sorobanLogger.info("soroban_mirror_attempted", { stellarAddress });
sorobanLogger.error("soroban_mirror_failed", { error: serializeError(err) });
```

### `createRequestLogger(requestId)`

For HTTP route handlers, create a per-request logger so every log line from a single request shares a `requestId` field:

```ts
export async function POST(request: NextRequest) {
  const reqLogger = createRequestLogger(crypto.randomUUID());
  reqLogger.info("register_start", { userId: session.user.id });
  // ... handler logic ...
}
```

### Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `DEBUG` | unset | Set to `"true"` to enable `logger.debug()` output |

### Usage in soroban-register

`src/lib/soroban-register.ts` uses `logger.child(...)` to emit structured logs on every mirror attempt:

```ts
sorobanLogger.info("soroban_mirror_attempted", { githubUsername, stellarAddress });
sorobanLogger.error("soroban_mirror_failed", { error: serializeError(err) });
```

No optional chaining (`logger?.error(...)`) is used — the exported `logger` singleton is always defined.

---

## Pagination

Pagination for list endpoints (e.g. `GET /api/contributors`) is not yet implemented — the current contributor list is returned in full. When contributor counts grow large enough to require pagination, the standard approach for this codebase will be:

- **Cursor-based pagination** (preferred over offset) using `Registration.id` as the cursor — stable under concurrent inserts.
- Query parameters: `?cursor=<last_id>&limit=<n>` (default `limit` capped at 100).
- Response shape: `{ contributors: [...], nextCursor: "<id>" | null }`.
- Prisma query: `prisma.registration.findMany({ take: limit + 1, cursor: { id: cursor }, skip: cursor ? 1 : 0 })`.

This document will be updated when pagination is introduced.
