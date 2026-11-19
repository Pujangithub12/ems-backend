import { prisma } from "../config/prisma";
import type { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";

/**
 * Page-level access for the Purchase Orders and Proforma Invoices pages.
 *
 * Rule: every admin and finance member can VIEW every PO / PI of the organization. Finance and super admins can
 * always EDIT them. An admin can edit only the records they created themselves, unless a super admin gave them
 * edit access to the whole page through the `procurement_page_access` table (one "edit" row per organization +
 * page + user). Only a super admin manages the grants.
 */
export type AccessLevel = "view" | "edit";
export type AccessKind = "purchaseOrder" | "proformaInvoice";
type OwnedRecord = { id: number; createdById: number | null };

/** Roles whose edit access is governed by page grants. Finance and super admin always edit; other roles only read. */
export const GRANTABLE_ROLES: string[] = [UserRole.ADMIN];

/** Value stored in procurement_page_access.page for each kind. */
export const PAGE_OF: Record<AccessKind, string> = {
  purchaseOrder: "purchase_orders",
  proformaInvoice: "proforma_invoices",
};

/** The caller's page-wide access: "edit" for super admins and finance, "edit" for admins with an edit grant, otherwise "view". */
export async function pageAccessLevel(kind: AccessKind, req: AuthRequest): Promise<AccessLevel> {
  const { id: userId, role } = req.user!;
  if (role === UserRole.SUPER_ADMIN || role === UserRole.FINANCE) return "edit";
  if (!GRANTABLE_ROLES.includes(role)) return "view";
  const grant = await prisma.procurementPageAccess.findUnique({
    where: { organizationId_page_userId: { organizationId: req.organization!.id, page: PAGE_OF[kind], userId } },
    select: { level: true },
  });
  return grant?.level === "edit" ? "edit" : "view";
}

/** The caller's access to one record. Everyone can view; creators and page-level editors can edit. */
export async function accessLevelFor(kind: AccessKind, record: OwnedRecord, req: AuthRequest): Promise<AccessLevel> {
  if (req.user!.role === UserRole.SUPER_ADMIN || req.user!.role === UserRole.FINANCE || (record.createdById != null && record.createdById === req.user!.id)) return "edit";
  return pageAccessLevel(kind, req);
}

/** Only a super admin may change who has access to a page. */
export function canManagePageAccess(req: AuthRequest): boolean {
  return req.user!.role === UserRole.SUPER_ADMIN;
}

/** Prisma `where` fragment for list queries — viewing is open to everyone in the organization, so nothing is filtered. */
export async function visibleToWhere(_kind: AccessKind, _req: AuthRequest) {
  return {};
}

/** Adds `myAccess` ("edit" | "view") to each list row so the UI can hide edit actions on view-only rows. */
export async function withMyAccess<T extends OwnedRecord>(kind: AccessKind, rows: T[], req: AuthRequest): Promise<(T & { myAccess: AccessLevel })[]> {
  const pageLevel = await pageAccessLevel(kind, req);
  const userId = req.user!.id;
  return rows.map((r) => ({ ...r, myAccess: pageLevel === "edit" || (r.createdById != null && r.createdById === userId) ? ("edit" as const) : ("view" as const) }));
}
