"use client";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

export function QrCode({ value, className = "", dark = "#0b0d1a", light = "#ffffff" }: { value: string; className?: string; dark?: string; light?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark, light } }).then((markup) => { if (active) setSvg(markup); });
    return () => { active = false; };
  }, [value, dark, light]);
  const inner = useMemo(() => ({ __html: svg }), [svg]); // stable object, so re-renders don't rebuild the SVG
  return <div className={`qr ${className}`} role="img" aria-label={`QR code for ${value}`} dangerouslySetInnerHTML={inner} />;
}
