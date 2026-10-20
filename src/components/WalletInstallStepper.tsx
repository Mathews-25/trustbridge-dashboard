"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FREIGHTER_INSTALL_URLS,
  LOBSTR_INSTALL_URLS,
  LOBSTR_TRUSTLINE_URL,
  STELLAR_LAB_TRUSTLINE_URL,
  XBULL_INSTALL_URLS,
  XBULL_TRUSTLINE_URL,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Step {
  label: string;
  description: React.ReactNode;
}

interface WalletConfig {
  id: string;
  name: string;
  /** One-line summary shown in the tab label area */
  tagline: string;
  /** Heroic icon rendered in the tab and panel header — inline SVG path */
  iconPath: string;
  /** Brand colour used for the active tab accent */
  accentClass: string;
  /** Step-by-step install + trustline instructions */
  steps: Step[];
  /** Primary CTA: deep-link straight into the trustline-add flow */
  trustlineUrl: string;
  trustlineCta: string;
  /** Secondary links e.g. install from stores */
  installLinks: { label: string; href: string }[];
}

// ---------------------------------------------------------------------------
// Wallet definitions
// ---------------------------------------------------------------------------

const WALLETS: WalletConfig[] = [
  {
    id: "freighter",
    name: "Freighter",
    tagline: "Browser extension — Chrome & Firefox",
    iconPath:
      // Rocket / Freighter simplified outline (original SVG © Stellar Development Foundation, MIT)
      "M12 2C8.5 2 5.5 4.5 4.2 8H3a1 1 0 0 0-.7 1.7l2 2c.2 2 1 3.8 2.3 5.1L5 18a1 1 0 0 0 1.4 1.4l1.2-1.2A8 8 0 0 0 12 19.9V22h1v-2.1a8 8 0 0 0 4.4-1.7l1.2 1.2A1 1 0 0 0 20 18l-1.6-1.2A9.8 9.8 0 0 0 20.7 11l2-2A1 1 0 0 0 22 8h-1.2C19.5 4.5 16.5 2 13 2h-1zm1 2h0c2.8 0 5.3 2 6.3 5H5.7C6.7 6 9.2 4 12 4h1zm-1 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
    accentClass: "border-stellar-purple text-stellar-purple",
    steps: [
      {
        label: "Install Freighter",
        description: (
          <>
            Add Freighter from the{" "}
            <a
              href={FREIGHTER_INSTALL_URLS.chrome}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Chrome Web Store
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>{" "}
            or the{" "}
            <a
              href={FREIGHTER_INSTALL_URLS.firefox}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Firefox Add-ons site
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            . Pin the extension so the icon stays visible in your toolbar.
          </>
        ),
      },
      {
        label: "Create or import a wallet",
        description:
          "Open Freighter and follow the prompts to generate a new wallet or import one with a recovery phrase. Write the phrase down somewhere safe — losing it means losing the wallet.",
      },
      {
        label: "Fund with XLM",
        description:
          "Stellar wallets are not active until they hold at least 1 XLM. Buy XLM on any exchange, then send it to your Freighter G-address.",
      },
      {
        label: "Add the USDC trustline",
        description: (
          <>
            Click{" "}
            <strong>Add USDC trustline via Stellar Lab</strong> below. Stellar
            Laboratory will open with the trustline transaction pre-filled.
            Connect Freighter when prompted and approve the transaction.
          </>
        ),
      },
    ],
    trustlineUrl: STELLAR_LAB_TRUSTLINE_URL,
    trustlineCta: "Add USDC trustline via Stellar Lab",
    installLinks: [
      { label: "freighter.app", href: FREIGHTER_INSTALL_URLS.site },
      { label: "Chrome extension", href: FREIGHTER_INSTALL_URLS.chrome },
      { label: "Firefox add-on", href: FREIGHTER_INSTALL_URLS.firefox },
    ],
  },
  {
    id: "lobstr",
    name: "LOBSTR",
    tagline: "Mobile app (Android & iOS) · Browser extension",
    iconPath:
      // Star / LOBSTR simplified star icon
      "M12 2l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 16.3l-5.6 2.9 1.1-6.2L3 8.6l6.2-.9L12 2z",
    accentClass: "border-stellar-cyan text-stellar-cyan",
    steps: [
      {
        label: "Install LOBSTR",
        description: (
          <>
            Download LOBSTR for{" "}
            <a
              href={LOBSTR_INSTALL_URLS.android}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Android
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            {" or "}
            <a
              href={LOBSTR_INSTALL_URLS.ios}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              iOS
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            , or install the{" "}
            <a
              href={LOBSTR_INSTALL_URLS.chrome}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Chrome extension
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            .
          </>
        ),
      },
      {
        label: "Create or import a wallet",
        description:
          'Open LOBSTR and tap "Create account" or "Import with secret key / recovery phrase". Back up your recovery phrase before continuing.',
      },
      {
        label: "Fund with XLM",
        description:
          "Buy or transfer at least 1 XLM to your wallet address. LOBSTR shows your address under the Account tab.",
      },
      {
        label: "Add the USDC trustline",
        description: (
          <>
            Tap{" "}
            <strong>Add USDC trustline in LOBSTR</strong> below. The link opens
            LOBSTR with the USDC asset pre-selected — just tap{" "}
            <em>Trust</em> to confirm.
          </>
        ),
      },
    ],
    trustlineUrl: LOBSTR_TRUSTLINE_URL,
    trustlineCta: "Add USDC trustline in LOBSTR",
    installLinks: [
      { label: "lobstr.co", href: LOBSTR_INSTALL_URLS.site },
      { label: "Android", href: LOBSTR_INSTALL_URLS.android },
      { label: "iOS", href: LOBSTR_INSTALL_URLS.ios },
      { label: "Chrome extension", href: LOBSTR_INSTALL_URLS.chrome },
    ],
  },
  {
    id: "xbull",
    name: "xBull",
    tagline: "Browser extension (Chrome & Firefox) · PWA",
    iconPath:
      // Bull horns simplified path
      "M17 3c-1.1 0-2.1.4-2.8 1.2L12 6.5 9.8 4.2A4 4 0 0 0 7 3C4.8 3 3 4.8 3 7c0 1.6.9 3 2.2 3.7L4 13h2l1-2h10l1 2h2l-1.2-2.3C19.1 10 20 8.6 20 7c0-2.2-1.8-4-3-4zm-5 9a8 8 0 0 0-5.7 2.3L8 16h8l1.7-1.7A8 8 0 0 0 12 12zm-3 6v2h2v-2H9zm4 0v2h2v-2h-2z",
    accentClass: "border-amber-500 text-amber-600 dark:text-amber-400",
    steps: [
      {
        label: "Install xBull",
        description: (
          <>
            Install xBull from the{" "}
            <a
              href={XBULL_INSTALL_URLS.chrome}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Chrome Web Store
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>{" "}
            or the{" "}
            <a
              href={XBULL_INSTALL_URLS.firefox}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Firefox Add-ons site
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            . You can also use it as a{" "}
            <a
              href={XBULL_INSTALL_URLS.site}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              Progressive Web App
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>{" "}
            without installing anything.
          </>
        ),
      },
      {
        label: "Create or import a wallet",
        description:
          'Open xBull and choose "Create a new wallet" or "Import wallet". Safely record your passphrase before moving on.',
      },
      {
        label: "Fund with XLM",
        description:
          "Send at least 1 XLM to your xBull wallet address to activate it on the Stellar network.",
      },
      {
        label: "Add the USDC trustline",
        description: (
          <>
            Click{" "}
            <strong>Add USDC trustline in xBull</strong> below. xBull will open
            with the USDC asset pre-loaded — confirm the transaction to enable
            receiving payouts.
          </>
        ),
      },
    ],
    trustlineUrl: XBULL_TRUSTLINE_URL,
    trustlineCta: "Add USDC trustline in xBull",
    installLinks: [
      { label: "xbull.app", href: XBULL_INSTALL_URLS.site },
      { label: "Chrome extension", href: XBULL_INSTALL_URLS.chrome },
      { label: "Firefox add-on", href: XBULL_INSTALL_URLS.firefox },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single step row inside a wallet panel. */
function StepRow({
  index,
  step,
}: {
  index: number;
  step: Step;
}) {
  return (
    <li className="flex gap-3">
      {/* Step number bubble */}
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums"
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <div className="space-y-0.5">
        <p className="font-medium leading-snug">{step.label}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {step.description}
        </p>
      </div>
    </li>
  );
}

/** External link row in the "Also available at" footer. */
function InstallLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground hover:no-underline transition-colors"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WalletInstallStepperProps {
  className?: string;
}

/**
 * Accessible wallet install guide with trustline deep links.
 *
 * Renders a `tablist` / `tab` / `tabpanel` ARIA pattern so keyboard users can
 * navigate between Freighter, LOBSTR, and xBull guides with arrow keys, and
 * each panel is reachable as a standalone landmark.
 *
 * Each panel contains:
 * - Numbered step list covering install → fund → add trustline
 * - A primary deep-link CTA that takes the user directly into the wallet's
 *   trustline-add flow (pre-filled with the configured USDC asset)
 * - Secondary install links for all supported platforms
 */
export function WalletInstallStepper({ className }: WalletInstallStepperProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % WALLETS.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + WALLETS.length) % WALLETS.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(WALLETS.length - 1);
    }
  }

  return (
    <div className={className}>
      {/* Tab list */}
      <div
        role="tablist"
        aria-label="Choose a Stellar wallet"
        className="flex gap-1 rounded-lg bg-muted/50 p-1"
      >
        {WALLETS.map((wallet, idx) => {
          const isActive = idx === activeIdx;
          return (
            <button
              key={wallet.id}
              role="tab"
              id={`wallet-tab-${wallet.id}`}
              aria-controls={`wallet-panel-${wallet.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveIdx(idx)}
              onKeyDown={handleKeyDown}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isActive
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Wallet icon */}
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? cn("", wallet.accentClass.split(" ")[1]) : ""
                )}
                aria-hidden="true"
              >
                <path d={wallet.iconPath} />
              </svg>
              <span>{wallet.name}</span>
            </button>
          );
        })}
      </div>

      {/* Tab panels — only the active one is visible, all remain in the DOM
          so keyboard focus order is stable (display:none hides from AT too,
          but hidden attribute + aria-selected is the recommended pattern). */}
      {WALLETS.map((wallet, idx) => {
        const isActive = idx === activeIdx;
        return (
          <div
            key={wallet.id}
            role="tabpanel"
            id={`wallet-panel-${wallet.id}`}
            aria-labelledby={`wallet-tab-${wallet.id}`}
            hidden={!isActive}
            tabIndex={0}
            data-testid={`wallet-panel-${wallet.id}`}
            className="mt-3 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-md"
          >
            {/* Panel header */}
            <div>
              <p className="font-semibold">{wallet.name}</p>
              <p className="text-xs text-muted-foreground">{wallet.tagline}</p>
            </div>

            {/* Step list */}
            <ol
              className="space-y-3"
              aria-label={`${wallet.name} setup steps`}
            >
              {wallet.steps.map((step, i) => (
                <StepRow key={step.label} index={i} step={step} />
              ))}
            </ol>

            {/* Primary deep-link CTA */}
            <Button
              asChild
              variant="stellar"
              size="sm"
              className="w-full sm:w-auto"
            >
              <a
                href={wallet.trustlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${wallet.trustlineCta} — opens in a new tab`}
              >
                {wallet.trustlineCta}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Button>

            {/* Secondary install links */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              <span className="text-xs text-muted-foreground">
                Also available at:
              </span>
              {wallet.installLinks.map((link) => (
                <InstallLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Keyboard hint — visible only to sighted keyboard users via focus-within */}
      <p
        className="mt-3 text-xs text-muted-foreground/60 select-none"
        aria-hidden="true"
      >
        Use ← → arrow keys to switch wallets
      </p>
    </div>
  );
}
