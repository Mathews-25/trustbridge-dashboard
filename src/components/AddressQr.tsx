"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { isValidGAddress, normalizeGAddress } from "@/lib/stellar-address";
import { cn } from "@/lib/utils";

interface AddressQrProps {
  address: string;
  className?: string;
}

/**
 * Renders a QR for a checksum-valid G-address only.
 * Uses a data-URL image (no SVG injection) to avoid XSS from QR payload rendering.
 */
export function AddressQr({ address, className }: AddressQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const normalized = normalizeGAddress(address);
  const valid = isValidGAddress(normalized);

  useEffect(() => {
    let cancelled = false;

    if (!valid) {
      setDataUrl(null);
      setFailed(false);
      return;
    }

    setFailed(false);
    QRCode.toDataURL(normalized, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 160,
      color: {
        dark: "#0b0b0f",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalized, valid]);

  if (!valid) return null;

  if (failed) {
    return (
      <p
        className="text-xs text-muted-foreground"
        role="status"
        data-testid="address-qr-error"
      >
        Could not generate a QR code for this address.
      </p>
    );
  }

  if (!dataUrl) {
    return (
      <p
        className="text-xs text-muted-foreground"
        role="status"
        data-testid="address-qr-loading"
      >
        Generating QR code…
      </p>
    );
  }

  return (
    <figure
      className={cn(
        "inline-flex flex-col items-start gap-2 rounded-lg border bg-white p-3 dark:border-border-strong",
        className
      )}
      data-testid="address-qr"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL from qrcode */}
      <img
        src={dataUrl}
        width={160}
        height={160}
        alt={`QR code for Stellar address ${normalized}`}
        className="h-40 w-40"
      />
      <figcaption className="max-w-[10rem] break-all font-mono text-[10px] text-zinc-700 dark:text-zinc-300">
        {normalized}
      </figcaption>
    </figure>
  );
}
