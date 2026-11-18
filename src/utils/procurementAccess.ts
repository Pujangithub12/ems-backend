import { prisma } from "../config/prisma";
import type { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";

/**
 * Page-level access for the Purchase Orders and Proforma Invoices pages.
 *
 * Rule: a plain `admin` (the caller's role in the CURRENT organization) only sees/acts on records they
 * created themselves — unless a super admin granted them access to the whole page through the
 * `procurement_page_access` table ("view" = read every record, "edit" = read and change every record).
 * Finance and super_admin always see and edit everything. Only a super admin manages the grants.
 */
export type AccessLevel = "view" | "edit";
export type AccessKind = "purchaseOrder" | "proformaInvoice";
type OwnedRecord = { id: number; createdById: number | null };

/** Value stored in procurement_page_access.page for each kind. */
export const PAGE_OF: Record<AccessKind, string> = {
  purchaseOrder: "purchase_orders",
  proformaInvoice: "proforma_invoices",
};

/** The caller's page-wide access: "edit" for everyone but plain admins, otherwise whatever a super admin granted (or null). */
export async function pageAccessLevel(kind: AccessKind, req: AuthRequest): Promise<AccessLevel | null> {
  const { id: userId, role } = req.user!;
  if (role !== UserRole.ADMIN) return "edit";
  const grant = await prisma.procurementPageAccess.findUnique({
    where: { organizationId_page_userId: { organizationId: req.organization!.id, page: PAGE_OF[kind], userId } },
    select: { level: true },
  });
  if (!grant) return null;
  return grant.level === "edit" ? "edit" : "view";
}

/** The caller's access to one record: "edit", "view", or null (no access at all). Creators always have "edit". */
export async function accessLevelFor(kind: AccessKind, record: OwnedRecord, req: AuthRequest): Promise<AccessLevel | null> {
  if (req.user!.role !== UserRole.ADMIN || record.createdById === req.user!.id) return "edit";
  return pageAccessLevel(kind, req);
}

/** Only a super admin may change who has access to a page. */
export function canManagePageAccess(req: AuthRequest): boolean {
  return req.user!.role === UserRole.SUPER_ADMIN;
}

/** Prisma `where` fragment for list queries: empty unless the caller is a plain admin without page access. */
export async function visibleToWhere(kind: AccessKind, req: AuthRequest) {
  if (req.user!.role !== UserRole.ADMIN) return {};
  return (await pageAccessLevel(kind, req)) ? {} : { createdById: req.user!.id };
}

/** Adds `myAccess` ("edit" | "view") to each list row so the UI can hide edit actions on view-only access. */
export async function withMyAccess<T extends OwnedRecord>(kind: AccessKind, rows: T[], req: AuthRequest): Promise<(T & { myAccess: AccessLevel })[]> {
  if (req.user!.role !== UserRole.ADMIN) return rows.map((r) => ({ ...r, myAccess: "edit" as const }));
  const pageLevel = await pageAccessLevel(kind, req);
  const userId = req.user!.id;
  return rows.map((r) => ({ ...r, myAccess: r.createdById === userId || pageLevel === "edit" ? ("edit" as const) : ("view" as const) }));
}
