import type { ReadinessStatus } from "@/types";

export interface RenderBadgeOptions {
  /** Optional custom left-side label. Defaults to "trustbridge". */
  label?: string;
}

/** Escapes special XML characters to prevent SVG injection. */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface StatusBadgeTheme {
  text: string;
  color: string;
}

const STATUS_THEMES: Record<ReadinessStatus | "unknown", StatusBadgeTheme> = {
  ready: {
    text: "ready",
    color: "#2ea44f",
  },
  low_reserve: {
    text: "low balance",
    color: "#d97706",
  },
  not_ready: {
    text: "not ready",
    color: "#dc2626",
  },
  unknown: {
    text: "unknown",
    color: "#6e7681",
  },
};

/**
 * Generates an SVG readiness badge formatted cleanly for GitHub READMEs.
 *
 * @param status - Readiness status ('ready' | 'low_reserve' | 'not_ready' | 'unknown')
 * @param options - Customization options
 * @returns Clean, self-contained SVG string (contains NO PII or Stellar addresses)
 */
export function renderBadgeSvg(
  status: ReadinessStatus | "unknown" | string,
  options: RenderBadgeOptions = {}
): string {
  const labelText = escapeXml(options.label ?? "trustbridge");
  const theme = STATUS_THEMES[status as ReadinessStatus] ?? STATUS_THEMES.unknown;
  const statusText = escapeXml(theme.text);

  // Approximate character width calculations for pixel-perfect SVG layout
  const labelCharWidth = 7;
  const statusCharWidth = 7;

  const labelPadding = 12;
  const statusPadding = 12;

  const labelWidth = Math.max(40, labelText.length * labelCharWidth + labelPadding * 2);
  const statusWidth = Math.max(40, statusText.length * statusCharWidth + statusPadding * 2);
  const totalWidth = labelWidth + statusWidth;
  const height = 20;

  const labelX = labelWidth / 2;
  const statusX = labelWidth + statusWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="${height}" role="img" aria-label="${labelText}: ${statusText}">
  <title>${labelText}: ${statusText}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${height}" fill="#555"/>
    <rect x="${labelWidth}" width="${statusWidth}" height="${height}" fill="${theme.color}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelX * 10}" y="${150}" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${labelText.length * labelCharWidth * 10}">${labelText}</text>
    <text x="${labelX * 10}" y="${140}" transform="scale(.1)" fill="#fff" textLength="${labelText.length * labelCharWidth * 10}">${labelText}</text>
    <text aria-hidden="true" x="${statusX * 10}" y="${150}" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${statusText.length * statusCharWidth * 10}">${statusText}</text>
    <text x="${statusX * 10}" y="${140}" transform="scale(.1)" fill="#fff" textLength="${statusText.length * statusCharWidth * 10}">${statusText}</text>
  </g>
</svg>`;
}
