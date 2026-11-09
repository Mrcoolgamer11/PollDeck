import { redis } from "../lib/redis.js";

const key = (sessionId: string) => `pd:online:${sessionId}`;

/** Zählt offene Verbindungen pro Teilnehmer (mehrere Tabs = ein Teilnehmer). */
export async function markOnline(sessionId: string, participantId: string): Promise<number> {
  const k = key(sessionId);
  await redis.multi().hincrby(k, participantId, 1).expire(k, 86400).exec();
  return redis.hlen(k);
}

export async function markOffline(sessionId: string, participantId: string): Promise<number> {
  const k = key(sessionId);
  const left = await redis.hincrby(k, participantId, -1);
  if (left <= 0) await redis.hdel(k, participantId);
  return redis.hlen(k);
}

export async function forceOffline(sessionId: string, participantId: string): Promise<number> {
  await redis.hdel(key(sessionId), participantId);
  return redis.hlen(key(sessionId));
}

export const onlineCount = (sessionId: string) => redis.hlen(key(sessionId)).catch(() => 0);
export const clearPresence = (sessionId: string) => redis.del(key(sessionId));
