import nodemailer from "nodemailer";
import { env } from "../env.js";
import { logger } from "./logger.js";

const transport = env.mailEnabled
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    })
  : null;

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!transport) {
    logger.warn({ to, subject }, "SMTP nicht konfiguriert – E-Mail wird nicht versendet");
    return false;
  }
  try {
    await transport.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, text });
    return true;
  } catch (err) {
    logger.error({ err, to }, "E-Mail-Versand fehlgeschlagen");
    return false;
  }
}
