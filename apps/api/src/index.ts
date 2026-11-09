import { env } from "./env.js";
import { buildApp } from "./app.js";
import { attachSocketServer, shutdownLive } from "./live/server.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";

async function main() {
  const app = await buildApp();
  attachSocketServer(app.server);
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`${env.APP_NAME} API läuft auf Port ${env.PORT} (${env.APP_URL})`);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Fahre herunter …");
    try {
      await shutdownLive();
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "Start fehlgeschlagen");
  process.exit(1);
});
