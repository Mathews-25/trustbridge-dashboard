/**
 * Time-boxed axe-core baseline for issue #142.
 *
 * Rule ids listed here are excluded from the `/register` and `/dashboard`
 * axe gates in `tests/e2e/register.spec.ts` and `tests/e2e/maintainer.spec.ts`.
 * This list should stay short — it is a temporary allowance, not a permanent
 * suppression. Re-audit and shrink it; do not add a rule here just because a
 * test is inconvenient to fix right now.
 *
 * - "color-contrast": already covered by the from-scratch WCAG luminance
 *   calculator in `src/lib/dark-mode-contrast-audit.test.ts` (25 assertions
 *   across light/dark and every badge/status color combination). axe-core's
 *   own contrast heuristic duplicates that coverage poorly in a live browser
 *   — it flags text inside elements that are transitioning, off-screen, or
 *   rendered against a gradient background it cannot sample correctly — so
 *   it is excluded here rather than fought from scratch. See issue #142's
 *   "Watch for: color contrast already tested in unit — don't duplicate
 *   poorly" guidance.
 *
 * Added 2026-08-28.
 */
export const AXE_BASELINE_RULE_IDS: readonly string[] = ["color-contrast"];

interface AxeViolationLike {
  id: string;
}

/** Drop baseline rule ids from a set of axe-core violations. */
export function filterBaselineViolations<T extends AxeViolationLike>(
  violations: readonly T[]
): T[] {
  return violations.filter(
    (violation) => !AXE_BASELINE_RULE_IDS.includes(violation.id)
  );
}
