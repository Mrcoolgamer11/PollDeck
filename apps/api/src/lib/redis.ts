import { Redis } from "ioredis";
import { env } from "../env.js";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
export const createRedis = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
