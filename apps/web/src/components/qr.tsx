"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrCode({ value, className = "", dark = "#0b0d1a", light = "#ffffff" }: { value: string; className?: string; dark?: string; light?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark, light } }).then((markup) => { if (active) setSvg(markup); });
    return () => { active = false; };
  }, [value, dark, light]);
  return <div className={`qr ${className}`} role="img" aria-label={`QR code for ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
