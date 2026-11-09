/**
 * Seed-Skript: legt (falls nötig) einen Admin an und erstellt die
 * Demo-Präsentation mit jedem Folientyp.
 *
 *   docker compose exec api node dist/seed.js
 *
 * Optional: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
import { DEMO_PRESENTATION } from "@polldeck/shared";
import { prisma } from "./lib/prisma.js";
import { hashPassword } from "./lib/auth.js";
import { createDemoPresentation } from "./lib/demo.js";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@polldeck.local").toLowerCase();
  let admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    const password = process.env.SEED_ADMIN_PASSWORD ?? "polldeck-demo";
    admin = await prisma.user.create({
      data: {
        email,
        name: process.env.SEED_ADMIN_NAME ?? "Admin",
        role: "ADMIN",
        passwordHash: await hashPassword(password),
      },
    });
    console.log(`Admin angelegt: ${email} / ${password}  (bitte Passwort ändern!)`);
  }
  const existing = await prisma.presentation.findFirst({ where: { ownerId: admin.id, title: DEMO_PRESENTATION.title } });
  if (existing) {
    console.log(`Demo-Präsentation existiert bereits (${existing.id}).`);
  } else {
    const id = await createDemoPresentation(admin.id);
    console.log(`Demo-Präsentation angelegt (${id}) für ${admin.email}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
