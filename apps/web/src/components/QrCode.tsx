import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Lokal erzeugter QR-Code (keine externen Dienste). */
export function QrCode({ value, size = 160, dark = "#000000", light = "#ffffff", label }: { value: string; size?: number; dark?: string; light?: string; label?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(value, { type: "svg", margin: 1, color: { dark, light }, errorCorrectionLevel: "M" })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [value, dark, light]);
  return (
    <div
      role="img"
      aria-label={label ?? value}
      style={{ width: size, height: size }}
      className="[&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
