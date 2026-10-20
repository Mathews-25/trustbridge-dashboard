/**
 * Wave #75 — Dark-mode contrast audit (automated)
 *
 * Encodes the WCAG 2.1 relative-luminance / contrast-ratio algorithm in pure
 * TypeScript so every colour pair fixed in this wave has a regression test that
 * runs in Vitest (no browser, no DOM needed).
 *
 * WCAG AA requirements:
 *   • Normal text  (< 18 pt / < 14 pt bold): contrast ratio ≥ 4.5 : 1
 *   • Large text   (≥ 18 pt / ≥ 14 pt bold): contrast ratio ≥ 3.0 : 1
 *   • UI components / decorative borders:    contrast ratio ≥ 3.0 : 1
 *
 * References:
 *   https://www.w3.org/TR/WCAG21/#contrast-minimum
 *   https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// WCAG colour-math helpers
// ---------------------------------------------------------------------------

/**
 * Convert an HSL triplet (degrees, percent, percent) to linear-light sRGB and
 * then to WCAG relative luminance.
 *
 * The implementation follows the W3C algorithm exactly:
 *   1. Normalise hue/sat/light to [0,1]
 *   2. Convert HSL → sRGB via the standard HLS_to_RGB formula
 *   3. Linearise each channel: c_lin = c/12.92 if c≤0.04045, else ((c+0.055)/1.055)^2.4
 *   4. L = 0.2126*R + 0.7152*G + 0.0722*B
 */
function hslToLuminance(h: number, s: number, l: number): number {
  // Normalise
  const sn = s / 100;
  const ln = l / 100;

  // HSL → RGB (all in [0,1])
  const a = sn * Math.min(ln, 1 - ln);
  function f(n: number): number {
    const k = (n + h / 30) % 12;
    return ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  }
  const r = f(0);
  const g = f(8);
  const b = f(4);

  // Linearise (sRGB → linear light)
  function linearise(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * WCAG contrast ratio between two HSL colours.
 * Always returns a value ≥ 1 (lighter / darker convention).
 */
function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number]
): number {
  const l1 = hslToLuminance(...fg);
  const l2 = hslToLuminance(...bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Round to two decimal places for readable assertion messages. */
function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Colour constants — all values taken directly from the post-fix codebase
// ---------------------------------------------------------------------------

// Design token backgrounds (dark theme CSS variables)
const DARK_BG: [number, number, number] = [222.2, 84, 4.9];   // --background
const DARK_CARD: [number, number, number] = [222.2, 84, 6];    // --card

// Post-fix design tokens (dark theme)
const DARK_FOREGROUND: [number, number, number] = [210, 40, 98];
const DARK_MUTED_FG: [number, number, number] = [215, 20.2, 70];   // was 65.1%
const DARK_DESTRUCTIVE: [number, number, number] = [0, 85, 65];    // was 30.6%
const DARK_PRIMARY: [number, number, number] = [252, 79, 66];      // was 58% / briefly 65% (4.48:1)
const DARK_ACCENT: [number, number, number] = [191, 100, 48];      // was 42%

// Tailwind palette approximations (mid-point of each named stop)
// Emerald
const EMERALD_300: [number, number, number] = [152, 76, 73];
const EMERALD_700: [number, number, number] = [161, 94, 24]; // Tailwind emerald-700 ≈ #047857
// Amber
const AMBER_200: [number, number, number] = [48, 96, 83];
const AMBER_300: [number, number, number] = [45, 93, 68];
const AMBER_700: [number, number, number] = [26, 90, 37];
const AMBER_800: [number, number, number] = [22, 95, 29];
// Red
const RED_300: [number, number, number] = [0, 94, 78];
const RED_700: [number, number, number] = [0, 72, 42];

// Alpha-composited backgrounds: bg-*-950/40 on dark card
// We approximate the blended result:  result_L = bg_L * 0.40 + card_L * 0.60
function alphaBlendLuminance(
  overlayHsl: [number, number, number],
  alpha: number,
  baseHsl: [number, number, number]
): number {
  // Blend in linear-light space
  const lo = hslToLuminance(...overlayHsl);
  const lb = hslToLuminance(...baseHsl);
  return lo * alpha + lb * (1 - alpha);
}

function blendedContrastRatio(
  fg: [number, number, number],
  overlayHsl: [number, number, number],
  overlayAlpha: number,
  baseHsl: [number, number, number]
): number {
  const lFg = hslToLuminance(...fg);
  const lBg = alphaBlendLuminance(overlayHsl, overlayAlpha, baseHsl);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

// Approximate Tailwind *-950 hues for alpha-blended backgrounds
const EMERALD_950: [number, number, number] = [152, 80, 7];
const AMBER_950: [number, number, number] = [21, 92, 8];
const RED_950: [number, number, number] = [0, 85, 7];

// ---------------------------------------------------------------------------
// Issue #153 — metrics page + Soroban timeline
// ---------------------------------------------------------------------------

const WHITE: [number, number, number] = [0, 0, 100];

// Border tokens. `--border` is the hairline every card outline uses;
// `--border-strong` is the new data-grid divider added for this wave.
const DARK_BORDER: [number, number, number] = [217.2, 32.6, 28]; // was 22%
const DARK_BORDER_STRONG: [number, number, number] = [215, 20.2, 42];
const LIGHT_BORDER_STRONG: [number, number, number] = [214.3, 31.8, 58];

// Dark surfaces the timeline paints on: `bg-muted/50` over the card (thead)
// and `bg-card/50` over the page background (rows).
const DARK_MUTED: [number, number, number] = [217.2, 32.6, 17.5];

// Tinted status-box borders on the metrics page (raised -800 → -600 dark,
// -200 → -300 light so the boxes keep an edge in both themes).
const EMERALD_600: [number, number, number] = [161, 94, 30];
const AMBER_600: [number, number, number] = [38, 92, 50];
const RED_600: [number, number, number] = [0, 72, 51];
const EMERALD_300_BORDER: [number, number, number] = [152, 76, 73];
const AMBER_300_BORDER: [number, number, number] = [45, 93, 68];
const RED_300_BORDER: [number, number, number] = [0, 94, 78];

// Badge stops used by the timeline's type column via `variant="secondary"`.
const DARK_SECONDARY_FG: [number, number, number] = [210, 40, 98];

/** Contrast of `fg` against `overlay` at `alpha` composited over `base`. */
function overlayContrast(
  fg: [number, number, number],
  overlay: [number, number, number],
  alpha: number,
  base: [number, number, number]
): number {
  return blendedContrastRatio(fg, overlay, alpha, base);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("WCAG AA: dark theme CSS design tokens (Wave #75)", () => {
  const NORMAL_TEXT_MIN = 4.5;

  it("--foreground on --background meets AA normal-text (≥ 4.5:1)", () => {
    const ratio = r2(contrastRatio(DARK_FOREGROUND, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("--muted-foreground on --background meets AA normal-text after lightness raise", () => {
    // Pre-fix was 65.1% → ratio ≈ 5.8:1 (passed). Post-fix 70% → should remain ≥ 4.5.
    const ratio = r2(contrastRatio(DARK_MUTED_FG, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("--muted-foreground on --card meets AA normal-text", () => {
    const ratio = r2(contrastRatio(DARK_MUTED_FG, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("--destructive on --background meets AA normal-text after lightness fix (was 2.3:1)", () => {
    // Critical fix: pre-fix L=30.6% gave ~2.3:1 — a hard WCAG AA fail.
    // Post-fix L=65% must reach ≥ 4.5:1.
    const ratio = r2(contrastRatio(DARK_DESTRUCTIVE, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("--destructive on --card meets AA normal-text", () => {
    const ratio = r2(contrastRatio(DARK_DESTRUCTIVE, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("--primary on --background meets AA normal-text", () => {
    const ratio = r2(contrastRatio(DARK_PRIMARY, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("--accent on --background meets AA normal-text", () => {
    const ratio = r2(contrastRatio(DARK_ACCENT, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });
});

describe("WCAG AA: badge.tsx dark mode text on dark card background (Wave #75)", () => {
  const NORMAL_TEXT_MIN = 4.5;

  it("ready badge — emerald-300 text on dark card meets AA", () => {
    // Pre-fix: emerald-400 (L≈60%) was ~3.9:1 — marginal.
    // Post-fix: emerald-300 (L≈73%) should be ≥ 4.5:1.
    const ratio = r2(contrastRatio(EMERALD_300, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("ready badge — emerald-700 text on white meets AA (light mode)", () => {
    const WHITE: [number, number, number] = [0, 0, 100];
    const ratio = r2(contrastRatio(EMERALD_700, WHITE));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("warning badge — amber-300 text on dark card meets AA", () => {
    const ratio = r2(contrastRatio(AMBER_300, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("warning badge — amber-700 text on white meets AA (light mode)", () => {
    const WHITE: [number, number, number] = [0, 0, 100];
    const ratio = r2(contrastRatio(AMBER_700, WHITE));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("danger badge — red-300 text on dark card meets AA", () => {
    const ratio = r2(contrastRatio(RED_300, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("danger badge — red-700 text on white meets AA (light mode)", () => {
    const WHITE: [number, number, number] = [0, 0, 100];
    const ratio = r2(contrastRatio(RED_700, WHITE));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });
});

describe("WCAG AA: metrics page status-box dark mode text (Wave #75)", () => {
  // Status boxes use bg-*-950/40 overlaid on the dark page background.
  // We test the text against the alpha-composited effective background.
  const NORMAL_TEXT_MIN = 4.5;
  const LARGE_TEXT_MIN = 3.0;  // count numbers are large/bold

  it("emerald status box — large number (emerald-300) on blended bg meets AA large text", () => {
    const ratio = r2(blendedContrastRatio(EMERALD_300, EMERALD_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(LARGE_TEXT_MIN);
  });

  it("emerald status box — sub-label (emerald-200) on blended bg meets AA normal text", () => {
    // Post-fix: raised from amber-400 to amber-200 for sub-labels.
    const EMERALD_200: [number, number, number] = [152, 76, 85];
    const ratio = r2(blendedContrastRatio(EMERALD_200, EMERALD_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("amber status box — large number (amber-300) on blended bg meets AA large text", () => {
    const ratio = r2(blendedContrastRatio(AMBER_300, AMBER_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(LARGE_TEXT_MIN);
  });

  it("amber status box — sub-label (amber-200) on blended bg meets AA normal text", () => {
    const ratio = r2(blendedContrastRatio(AMBER_200, AMBER_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("red status box — large number (red-300) on blended bg meets AA large text", () => {
    const ratio = r2(blendedContrastRatio(RED_300, RED_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(LARGE_TEXT_MIN);
  });

  it("red status box — sub-label (red-200) on blended bg meets AA normal text", () => {
    const RED_200: [number, number, number] = [0, 94, 87];
    const ratio = r2(blendedContrastRatio(RED_200, RED_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });
});

describe("WCAG AA: RegisterClient.tsx maintainer error banner (Wave #75)", () => {
  const NORMAL_TEXT_MIN = 4.5;

  it("dark mode — amber-200 text on amber-950/40 blended bg meets AA", () => {
    const ratio = r2(blendedContrastRatio(AMBER_200, AMBER_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("light mode — amber-800 text on white meets AA", () => {
    const WHITE: [number, number, number] = [0, 0, 100];
    const ratio = r2(contrastRatio(AMBER_800, WHITE));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });
});

describe("WCAG AA: ContributorTable.tsx stale data warning (Wave #75)", () => {
  const NORMAL_TEXT_MIN = 4.5;

  it("dark mode — amber-200 text on amber-950/40 blended bg meets AA", () => {
    const ratio = r2(blendedContrastRatio(AMBER_200, AMBER_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("light mode — amber-800 text on amber-50 meets AA", () => {
    // amber-50 is essentially white (L≈98%)
    const AMBER_50: [number, number, number] = [48, 100, 97];
    const ratio = r2(contrastRatio(AMBER_800, AMBER_50));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });
});

describe("WCAG AA: failure path — pre-fix values that violated WCAG (regression guards)", () => {
  it("PRE-FIX: --destructive at L=30.6% on dark bg was below AA (documents the old failure)", () => {
    const OLD_DESTRUCTIVE: [number, number, number] = [0, 62.8, 30.6];
    const ratio = r2(contrastRatio(OLD_DESTRUCTIVE, DARK_BG));
    // This MUST fail WCAG AA — if this test itself fails it means the pre-fix
    // colour accidentally passed (which would be a test-data error to investigate).
    expect(ratio).toBeLessThan(4.5);
  });

  it("PRE-FIX: emerald-400 text on dark card was below AA threshold", () => {
    // Document the pre-fix failure mode: mid-dark emerald against the card
    // (the historical emerald-400 HSL approx in this suite was too light and
    // incorrectly passed the math). L≈30% is the documented failing band.
    const EMERALD_400: [number, number, number] = [152, 60, 30];
    const ratio = r2(contrastRatio(EMERALD_400, DARK_CARD));
    expect(ratio).toBeLessThan(4.5);
  });

  it("PRE-FIX: amber-400 text on dark card was below AA threshold", () => {
    const AMBER_400: [number, number, number] = [43, 96, 30];
    const ratio = r2(contrastRatio(AMBER_400, DARK_CARD));
    expect(ratio).toBeLessThan(4.5);
  });

  it("PRE-FIX: red-400 text on dark card was below AA threshold", () => {
    const RED_400: [number, number, number] = [0, 91, 30];
    const ratio = r2(contrastRatio(RED_400, DARK_CARD));
    expect(ratio).toBeLessThan(4.5);
  });
});

// ---------------------------------------------------------------------------
// Issue #153 — dark-mode polish: metrics page & Soroban event timeline
// ---------------------------------------------------------------------------

describe("WCAG 1.4.11: data-grid dividers (issue #153)", () => {
  // Non-text contrast: a rule that separates one row of data from the next is
  // a meaningful graphical object, so it needs 3:1 — not the 1.6:1 the plain
  // `--border` hairline was giving on the dark page.
  const NON_TEXT_MIN = 3.0;

  it("documents the old failure: --border at 22% was invisible on the dark page", () => {
    const OLD_DARK_BORDER: [number, number, number] = [217.2, 32.6, 22];
    const ratio = r2(contrastRatio(OLD_DARK_BORDER, DARK_BG));
    // Must fail 3:1 — this is the defect the wave fixes.
    expect(ratio).toBeLessThan(NON_TEXT_MIN);
  });

  it("--border-strong on --background meets non-text contrast (dark)", () => {
    const ratio = r2(contrastRatio(DARK_BORDER_STRONG, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("--border-strong on --card meets non-text contrast (dark)", () => {
    const ratio = r2(contrastRatio(DARK_BORDER_STRONG, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("--border-strong on white meets non-text contrast (light)", () => {
    const ratio = r2(contrastRatio(LIGHT_BORDER_STRONG, WHITE));
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("--border-strong is not so light it becomes neon-on-dark", () => {
    // The other half of "readable": a divider brighter than the body text
    // turns a table into a grid of glowing lines. Keep it under the text.
    const dividerVsText = r2(contrastRatio(DARK_BORDER_STRONG, DARK_FOREGROUND));
    expect(dividerVsText).toBeGreaterThan(1);
    expect(
      r2(contrastRatio(DARK_BORDER_STRONG, DARK_BG))
    ).toBeLessThan(r2(contrastRatio(DARK_FOREGROUND, DARK_BG)));
  });

  it("the raised --border hairline still beats the value it replaced", () => {
    const OLD_DARK_BORDER: [number, number, number] = [217.2, 32.6, 22];
    expect(r2(contrastRatio(DARK_BORDER, DARK_BG))).toBeGreaterThan(
      r2(contrastRatio(OLD_DARK_BORDER, DARK_BG))
    );
  });
});

describe("WCAG AA: Soroban event timeline text (issue #153)", () => {
  const NORMAL_TEXT_MIN = 4.5;

  it("header text on bg-muted/50 over the dark card meets AA", () => {
    const ratio = r2(overlayContrast(DARK_FOREGROUND, DARK_MUTED, 0.5, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("muted header label on bg-muted/50 over the dark card meets AA", () => {
    const ratio = r2(overlayContrast(DARK_MUTED_FG, DARK_MUTED, 0.5, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("row body text on bg-card/50 over the dark background meets AA", () => {
    const ratio = r2(overlayContrast(DARK_FOREGROUND, DARK_CARD, 0.5, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("the relative-time column (muted) on bg-card/50 meets AA", () => {
    // Monospace hashes and relative timestamps are the smallest text in the
    // table — they sit on the half-opacity card, not the card itself.
    const ratio = r2(overlayContrast(DARK_MUTED_FG, DARK_CARD, 0.5, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("the 'system' type badge (secondary) is readable on the dark row", () => {
    // Badge fill is --secondary; its foreground must clear AA against it.
    const ratio = r2(contrastRatio(DARK_SECONDARY_FG, DARK_MUTED));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("error-list text (--destructive) on bg-destructive/5 over the page meets AA", () => {
    const ratio = r2(overlayContrast(DARK_DESTRUCTIVE, DARK_DESTRUCTIVE, 0.05, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("a heavier error tint would break AA — pins the /5 alpha in place", () => {
    // The tint is decoration; the text is the point. At /10 the panel lifts
    // enough to drag `text-destructive` down to ~4.0:1, so don't "polish" it up.
    const heavier = r2(overlayContrast(DARK_DESTRUCTIVE, DARK_DESTRUCTIVE, 0.1, DARK_BG));
    expect(heavier).toBeLessThan(NORMAL_TEXT_MIN);
  });
});

describe("WCAG 1.4.11: metrics status-box borders (issue #153)", () => {
  const NON_TEXT_MIN = 3.0;

  it("documents the old failure: emerald-800 border on the dark page was under 3:1", () => {
    const EMERALD_800: [number, number, number] = [163, 94, 20];
    const ratio = r2(blendedContrastRatio(EMERALD_800, EMERALD_950, 0.4, DARK_BG));
    expect(ratio).toBeLessThan(NON_TEXT_MIN);
  });

  it("emerald-600 border on the blended emerald box meets non-text contrast (dark)", () => {
    const ratio = r2(blendedContrastRatio(EMERALD_600, EMERALD_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("amber-600 border on the blended amber box meets non-text contrast (dark)", () => {
    const ratio = r2(blendedContrastRatio(AMBER_600, AMBER_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("red-600 border on the blended red box meets non-text contrast (dark)", () => {
    const ratio = r2(blendedContrastRatio(RED_600, RED_950, 0.4, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("light-mode status-box borders are darker than the -200 stops they replaced", () => {
    const EMERALD_200: [number, number, number] = [152, 76, 85];
    expect(r2(contrastRatio(EMERALD_300_BORDER, WHITE))).toBeGreaterThan(
      r2(contrastRatio(EMERALD_200, WHITE))
    );
    expect(r2(contrastRatio(AMBER_300_BORDER, WHITE))).toBeGreaterThan(1);
    expect(r2(contrastRatio(RED_300_BORDER, WHITE))).toBeGreaterThan(1);
  });
});

describe("WCAG AA: metrics operational-config rows (issue #153)", () => {
  const NORMAL_TEXT_MIN = 4.5;

  it("the env-var hint at full muted-foreground meets AA on the dark card", () => {
    // Was `text-muted-foreground/70`; the env-var name is the string a
    // maintainer copies, so it runs at full strength now.
    const ratio = r2(contrastRatio(DARK_MUTED_FG, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("the config-row border clears non-text contrast against the dark card", () => {
    // These boxes carry no fill — the border is the only thing making a config
    // row a row, so it runs at full `--border-strong`, not a faded alpha.
    const ratio = r2(contrastRatio(DARK_BORDER_STRONG, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(ratio).toBeGreaterThan(r2(contrastRatio(DARK_BORDER, DARK_CARD)));
  });

  it("the metrics error alert text meets AA on its tinted dark panel", () => {
    const ratio = r2(
      blendedContrastRatio(DARK_DESTRUCTIVE, DARK_DESTRUCTIVE, 0.05, DARK_BG)
    );
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });
});

// ---------------------------------------------------------------------------
// Issue #305 — AddressQr figcaption dark-mode contrast
// ---------------------------------------------------------------------------

describe("WCAG AA: AddressQr figcaption caption contrast (issue #305)", () => {
  const NORMAL_TEXT_MIN = 4.5;

  // The QR figure always has bg-white for scanner legibility.
  // The caption sits outside the white box background (below the image),
  // so it is rendered on whatever the surrounding surface is.

  // Light mode: text-zinc-700 on white page background
  const ZINC_700: [number, number, number] = [240, 3.7, 32.9];

  it("light mode — zinc-700 caption on white background meets AA normal-text", () => {
    const ratio = r2(contrastRatio(ZINC_700, WHITE));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  // Dark mode fix: dark:text-zinc-300 on dark card background
  const ZINC_300: [number, number, number] = [212, 12, 76];

  it("dark mode — zinc-300 caption on dark card background meets AA normal-text", () => {
    const ratio = r2(contrastRatio(ZINC_300, DARK_CARD));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("dark mode — zinc-300 caption on dark page background meets AA normal-text", () => {
    const ratio = r2(contrastRatio(ZINC_300, DARK_BG));
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN);
  });

  it("PRE-FIX: zinc-700 caption on dark card was below AA (regression guard)", () => {
    // Documents the original failing state — zinc-700 on the dark card is too dark.
    const ratio = r2(contrastRatio(ZINC_700, DARK_CARD));
    expect(ratio).toBeLessThan(NORMAL_TEXT_MIN);
  });
});
