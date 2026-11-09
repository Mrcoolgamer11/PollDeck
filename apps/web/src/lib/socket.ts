import { io, type Socket } from "socket.io-client";

export type AckResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export function connect(auth: Record<string, unknown>): Socket {
  return io({
    path: "/socket.io",
    auth,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 15000,
  });
}

/** emit mit Ack als Promise (mit Timeout). */
export function request<T = unknown>(socket: Socket, event: string, payload?: unknown, timeoutMs = 10000): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload ?? {}, (err: unknown, res: AckResult<T>) => {
      if (err) resolve({ ok: false, error: "timeout" });
      else resolve(res ?? { ok: false, error: "no_response" });
    });
  });
}
