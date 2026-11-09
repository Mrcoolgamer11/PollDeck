import type { User } from "@prisma/client";
import { prisma } from "./prisma.js";
import { forbidden, notFound } from "./http.js";

export type Access = "owner" | "edit" | "view";

/** Ermittelt die Berechtigung eines Benutzers für eine Präsentation. */
export async function presentationAccess(user: User, presentationId: string): Promise<Access | null> {
  const p = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { ownerId: true, shares: { where: { userId: user.id }, select: { role: true } } },
  });
  if (!p) return null;
  if (p.ownerId === user.id) return "owner";
  const share = p.shares[0];
  if (share) return share.role === "EDIT" ? "edit" : "view";
  return null;
}

export async function assertAccess(user: User, presentationId: string, need: Access): Promise<Access> {
  const access = await presentationAccess(user, presentationId);
  if (!access) throw notFound();
  const rank = { view: 1, edit: 2, owner: 3 } as const;
  if (rank[access] < rank[need]) throw forbidden();
  return access;
}
