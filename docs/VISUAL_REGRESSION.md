# Visual Regression Testing Guide

TrustBridge Dashboard uses Playwright to capture visual regression screenshots across key user workflows and component states in both light and dark color schemes.

## Covered Views

### Full-page views
- **Landing Page** (`/`): Light & Dark modes
- **Register Flow** (`/register`): Light & Dark modes (with mocked contributor registration)
- **Dashboard** (`/dashboard`): Light & Dark modes (with mocked contributor table and metrics)

### ContributorTable column states
These tests target the `[data-testid="contributor-table-region"]` element directly so
layout changes outside the table don't cause false positives.

| Snapshot | Description |
|---|---|
| `contributor-table-default-columns-light.png` | Default column set (spendableXlmBalance hidden) — light |
| `contributor-table-default-columns-dark.png` | Default column set — dark |
| `contributor-table-all-columns-light.png` | All columns visible after enabling Spendable XLM via column picker |
| `contributor-table-column-picker-open-light.png` | Column picker panel open |
| `contributor-table-minimal-columns-light.png` | Only GitHub + Status columns visible |
| `contributor-table-all-states-light.png` | All readiness states (ready / low_reserve / not_ready) + banned badge — light |
| `contributor-table-all-states-dark.png` | All readiness states + banned badge — dark |
| `contributor-table-zero-empty-light.png` | Zero-contributors empty state |

## Running Visual Tests

Run the full visual suite:

```bash
npx playwright test tests/e2e/visual.spec.ts
```

Run only the contributor-table column tests:

```bash
npx playwright test tests/e2e/visual.spec.ts --grep "ContributorTable columns"
```

Run with UI mode for debugging:

```bash
npm run test:e2e:ui
```

## Updating Golden Snapshots

When intentional UI design changes or component layouts are updated, golden baseline screenshots must be regenerated:

```bash
# Update all visual snapshots
npx playwright test tests/e2e/visual.spec.ts --update-snapshots

# Update only contributor-table snapshots
npx playwright test tests/e2e/visual.spec.ts --grep "ContributorTable columns" --update-snapshots
```

Commit the generated snapshot image files under `tests/e2e/visual.spec.ts-snapshots/` with your PR.

## Preventing Flakiness
- **Timestamp Masking**: Dynamic timestamps, relative time strings, and Horizon latency metrics are masked using Playwright's `mask` locator array so changing times never fail visual diffs.
- **Deterministic Mock Data**: API responses (`/api/contributors*`, `/api/soroban/events`, `/api/settings/network`, `/api/freeze-status`) are intercepted using `interceptApi` to ensure consistent data and avoid live network delays or Horizon rate limits.
- **Scroll into view**: The contributor-table tests scroll the region into view before capturing so the element is fully painted.
- **Font Rendering Settle**: `waitForLoadState("networkidle")` is asserted before screenshot captures.

## Adding New Column / State Tests

1. Add your fixture rows to `COLUMN_TEST_CONTRIBUTORS` in `tests/e2e/visual.spec.ts` (or pass a custom array to `interceptContributorApis`).
2. Add a new `test()` block inside `test.describe("Visual Regression — ContributorTable columns")`.
3. Run with `--update-snapshots` to generate the golden baseline.
4. Commit the `.png` snapshot alongside the spec change.
