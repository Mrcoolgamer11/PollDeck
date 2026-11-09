/**
 * Kürzt IP-Adressen für Logs (Datenminimierung): IPv4 → letztes Oktett 0,
 * IPv6 → nur die ersten 3 Blöcke (/48).
 */
export function anonymizeIp(ip: string | undefined | null): string {
  if (!ip) return "";
  const v4 = ip.replace(/^::ffff:/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4.replace(/\.\d{1,3}$/, ".0");
  if (ip.includes(":")) {
    const parts = ip.split("::")[0].split(":").filter(Boolean);
    return `${parts.slice(0, 3).join(":")}::`;
  }
  return "";
}

/** Findet referenzierte Upload-Dateinamen (z. B. "/api/uploads/abc-123.png") in beliebigem Text/JSON. */
export function findUploadRefs(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\/api\/uploads\/([\w-]+\.(?:png|jpg|gif|webp))/g)) out.add(m[1]);
  return out;
}
