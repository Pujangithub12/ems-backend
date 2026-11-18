import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { AccessKind, canManagePageAccess, PAGE_OF, pageAccessLevel } from "../utils/procurementAccess";

type SaveAccessDto = { grants?: { userId?: unknown; level?: unknown }[] };

async function buildPayload(kind: AccessKind, req: AuthRequest) {
  const canManage = canManagePageAccess(req);
  const level = await pageAccessLevel(kind, req);
  if (!canManage) return { canManage, level, grants: [], members: [] };

  const organizationId = req.organization!.id;
  const grants = await prisma.procurementPageAccess.findMany({
    where: { organizationId, page: PAGE_OF[kind] },
    select: { userId: true, level: true },
  });
  // Only plain admins are restricted (finance / super admin already see everything, and regular users
  // can't open the procurement pages at all), so they are the only people worth listing.
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, role: UserRole.ADMIN },
    select: { role: true, user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { user: { fullName: "asc" } },
  });
  return {
    canManage,
    level,
    grants: grants.map((g) => ({ userId: g.userId, level: g.level === "edit" ? "edit" : "view" })),
    members: memberships.map((m) => ({ id: m.user.id, fullName: m.user.fullName, email: m.user.email, role: m.role })),
  };
}

/** Page-level sharing for the Purchase Orders and Proforma Invoices pages — see utils/procurementAccess.ts for the rules. */
export class ProcurementAccessController {
  /** GET /procurement-access/purchase-orders and /procurement-access/proforma-invoices */
  static get = (kind: AccessKind) => async (req: AuthRequest, res: Response) => {
    try {
      if (!canManagePageAccess(req)) return res.status(403).json({ message: "Only a super admin can manage access." });
      return res.status(200).json(await buildPayload(kind, req));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT — full-replace of the page's grant list. Super admin only. */
  static save = (kind: AccessKind) => async (req: AuthRequest, res: Response) => {
    const { grants }: SaveAccessDto = req.body ?? {};
    try {
      if (!canManagePageAccess(req)) return res.status(403).json({ message: "Only a super admin can manage access." });
      if (!Array.isArray(grants)) return res.status(400).json({ message: "grants must be an array" });

      const wanted = new Map<number, "view" | "edit">();
      for (const g of grants) {
        const userId = Number(g?.userId);
        if (!Number.isInteger(userId)) return res.status(400).json({ message: "Every grant needs a userId" });
        if (g.level !== "view" && g.level !== "edit") return res.status(400).json({ message: 'level must be "view" or "edit"' });
        wanted.set(userId, g.level);
      }

      const organizationId = req.organization!.id;
      const members = await prisma.organizationMembership.findMany({
        where: { organizationId, userId: { in: [...wanted.keys()] }, role: UserRole.ADMIN },
        select: { userId: true },
      });
      const allowed = new Set(members.map((m) => m.userId));
      for (const userId of wanted.keys()) {
        if (!allowed.has(userId)) return res.status(400).json({ message: "You can only share with admins of this organization." });
      }

      const page = PAGE_OF[kind];
      await prisma.$transaction([
        prisma.procurementPageAccess.deleteMany({ where: { organizationId, page } }),
        prisma.procurementPageAccess.createMany({
          data: [...wanted].map(([userId, level]) => ({ organizationId, page, userId, level, grantedById: req.user!.id })),
        }),
      ]);
      return res.status(200).json({ message: "Access updated", ...(await buildPayload(kind, req)) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
