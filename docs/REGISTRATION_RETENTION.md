# Registration retention

Registrations use a soft-delete flow. A maintainer can delete a registration with `DELETE /api/registrations/:id`; this sets `deletedAt` and preserves the registration, address history, and audit trail. A maintainer can restore it with `POST /api/registrations/:id/restore`.

Normal contributor queries, dashboard statistics, rechecks, treasury exports, and CSV/JSON exports include only rows where `deletedAt` is `NULL`. A deleted user's next self-service registration reuses the preserved row and clears `deletedAt` after the normal address checks.

The Stellar address uniqueness rule is a PostgreSQL partial unique index on `stellarAddress` where `deletedAt IS NULL`. This allows a deleted address to be registered again while preventing two active registrations from claiming it. Restoring a row can therefore fail with `409` when another active registration has claimed that address.

Soft-delete is not GDPR erasure. A future GDPR/anonymization flow must define how anonymized historical rows interact with restore; anonymized rows must not be restored as if they still represented the original contributor.

## Listing soft-deleted registrations

Maintainers can list soft-deleted registrations via `GET /api/registrations/deleted`. This endpoint:

- Requires maintainer authentication (returns 403 for non-maintainers).
- Returns only registrations where `deletedAt` is not null.
- Supports cursor-based pagination with `limit` (default 25, max 100) and `cursor` query parameters.
- Returns `hasMore` and `nextCursor` fields for subsequent page requests.

Example:

```
GET /api/registrations/deleted?limit=50
```

Response:

```json
{
  "registrations": [
    {
      "id": "reg-1",
      "stellarAddress": "GADDRESS",
      "userId": "user-1",
      "githubUsername": "contributor",
      "deletedAt": "2026-08-28T00:00:00.000Z",
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-28T00:00:00.000Z"
    }
  ],
  "hasMore": true,
  "nextCursor": "base64encodedcursor"
}
```