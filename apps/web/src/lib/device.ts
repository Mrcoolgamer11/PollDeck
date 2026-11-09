/**
 * Anonyme Geräte-ID gegen Doppelabstimmung. Gespeichert in localStorage und
 * zusätzlich in einem Cookie, damit sie auch bei teilweisem Löschen erhalten bleibt.
 * Es wird kein Tracking betrieben – die ID verlässt nur den Socket-Handshake.
 */
const KEY = "pd_device";

function readCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)pd_device=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? (window as unknown as { msCrypto: Crypto }).msCrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* Privatmodus */
  }
  id = id || readCookie() || randomId();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* noop */
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${KEY}=${id}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  return id;
}

const NAME_KEY = "pd_name";
export const getSavedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
export const saveName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* noop */
  }
};
