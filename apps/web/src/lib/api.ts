/** Kleiner Fetch-Wrapper mit CSRF-Header und Fehlerbehandlung. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)pd_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

let csrfReady: Promise<void> | null = null;
/** Stellt sicher, dass ein CSRF-Cookie existiert (wird bei jedem GET gesetzt). */
async function ensureCsrf() {
  if (csrfToken()) return;
  csrfReady ??= fetch("/api/auth/config", { credentials: "same-origin" }).then(() => undefined);
  await csrfReady;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (method !== "GET") {
    await ensureCsrf();
    headers["x-csrf-token"] = csrfToken();
  }
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  } else if (method !== "GET") {
    headers["content-type"] = "application/json";
    body = "{}";
  }
  const res = await fetch(path.startsWith("/") ? path : `/api/${path}`, { method, headers, body, credentials: "same-origin" });
  if (!res.ok) {
    let data: { error?: string; details?: unknown } = {};
    try {
      data = await res.json();
    } catch {
      /* noop */
    }
    throw new ApiError(res.status, data.error ?? `http_${res.status}`, data.details);
  }
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api<{ url: string }>("/api/uploads", { method: "POST", body: fd });
  return res.url;
}

/** Löst einen Datei-Download über einen GET-Link aus. */
export function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
