import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { OrganizationController } from "../controllers/OrganizationController";
import { UserController } from "../controllers/UserController";
import { InviteController } from "../controllers/InviteController";
import { AnnouncementController } from "../controllers/AnnouncementController";
import { PlantReportController } from "../controllers/PlantReportController";
import { PlantReportFieldController } from "../controllers/PlantReportFieldController";
import { PlantReportItemController } from "../controllers/PlantReportItemController";
import { NotificationController } from "../controllers/NotificationController";
import { ProjectController } from "../controllers/ProjectController";
import { ProjectFileController } from "../controllers/ProjectFileController";
import { PurchaseRequestController } from "../controllers/PurchaseRequestController";
import { PurchaseOrderController } from "../controllers/PurchaseOrderController";
import { ProformaInvoiceController } from "../controllers/ProformaInvoiceController";
import { ShipmentController } from "../controllers/ShipmentController";
import { GoodsReceiptController } from "../controllers/GoodsReceiptController";
import { MonthlyPerformanceController } from "../controllers/MonthlyPerformanceController";
import { DailyGenerationController } from "../controllers/DailyGenerationController";
import { InventoryController } from "../controllers/InventoryController";
import { OrganizationFileController } from "../controllers/OrganizationFileController";
import { MyTaskController } from "../controllers/MyTaskController";
import { TaskController } from "../controllers/TaskController";
import { DashboardController } from "../controllers/DashboardController";
import { SubTaskController } from "../controllers/SubTaskController";
import { TaskCommentController } from "../controllers/TaskCommentController";
import { LeaveRequestController } from "../controllers/LeaveRequestController";
import { SiteVisitRequestController } from "../controllers/SiteVisitRequestController";
import { ExpenseRequestController } from "../controllers/ExpenseRequestController";
import { CalendarEventController } from "../controllers/CalendarEventController";
import { HierarchyController } from "../controllers/HierarchyController";
import { ScheduleController } from "../controllers/ScheduleController";
import { ScheduleService } from "../services/schedule.service";
import { PermissionController } from "../controllers/PermissionController";
import { ReportsController } from "../controllers/ReportsController";
import { CatalogItemController } from "../controllers/CatalogItemController";
import { authMiddleware, roleMiddleware, permissionMiddleware, anyPermissionMiddleware } from "../middlewares/auth";
import { loginLimiter, authActionLimiter } from "../middlewares/rateLimit";
import { requireCsrfHeader } from "../middlewares/csrfHeader";
import {
  upload,
  uploadProjectFile,
  uploadOrganizationFile,
  uploadInventoryFile,
  uploadPurchaseRequestFile,
  uploadPurchaseOrderFile,
  uploadProformaInvoiceFile,
  uploadCustomsFile,
  uploadGoodsReceiptFile,
} from "../middlewares/upload";
import { UserRole } from "../types/enums";

const router = Router();

const scheduleController = new ScheduleController(new ScheduleService());

// Auth routes
router.post("/register/start", authActionLimiter, AuthController.registerStart);
router.post("/register/verify", authActionLimiter, AuthController.registerVerify);
router.post("/forgot-password/start", authActionLimiter, AuthController.forgotPasswordStart);
router.post("/forgot-password/reset", authActionLimiter, AuthController.forgotPasswordReset);
router.post("/login", loginLimiter, AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/me", authMiddleware, AuthController.getMe);
router.put("/me", authMiddleware, AuthController.updateMe);
router.put("/me/password", authMiddleware, AuthController.changePassword);
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Organization routes
router.get("/workspaces", authMiddleware, OrganizationController.getAll);
router.post("/workspaces", authMiddleware, OrganizationController.create);
router.post("/workspaces/switch", authMiddleware, OrganizationController.switch);
router.get(
  "/workspaces/current",
  authMiddleware,
  OrganizationController.getCurrent,
);
router.put("/workspaces/:id", authMiddleware, OrganizationController.update);
router.delete("/workspaces/:id", authMiddleware, OrganizationController.remove);

// Cross-organization member access matrix (Settings > Organization tab) — lets a
// caller who belongs to more than one of their own organizations manage which
// of those organizations each employee can access, from one place.
router.get(
  "/workspaces/access-matrix",
  authMiddleware,
  permissionMiddleware("members.manage"),
  OrganizationController.getAccessMatrix,
);
router.put(
  "/workspaces/:id/members/:userId",
  authMiddleware,
  permissionMiddleware("members.manage"),
  OrganizationController.grantMemberAccess,
);
router.delete(
  "/workspaces/:id/members/:userId",
  authMiddleware,
  permissionMiddleware("members.manage"),
  OrganizationController.revokeMemberAccess,
);

// Permission routes — matrix is viewable by anyone, but only a super admin
// can edit it (hardcoded, not itself a toggleable permission).
router.get("/permissions", authMiddleware, PermissionController.getMatrix);
router.put(
  "/permissions",
  authMiddleware,
  roleMiddleware([UserRole.SUPER_ADMIN]),
  PermissionController.updateMatrix,
);

// User routes - Admin only for inviting and deleting users
router.post(
  "/users/invite",
  authMiddleware,
  permissionMiddleware("members.manage"),
  InviteController.sendInvite,
);
router.get("/users", authMiddleware, UserController.getAllUsers);

// Invite accept flow — public, the invitee isn't logged in yet.
router.get("/invites/:token", InviteController.getInvite);
router.post("/invites/:token/accept", InviteController.acceptInvite);
router.delete(
  "/users/:id",
  authMiddleware,
  permissionMiddleware("members.manage"),
  UserController.deleteUser,
);
router.put(
  "/users/:id",
  authMiddleware,
  permissionMiddleware("members.manage"),
  UserController.updateUser,
);

// Announcement routes - Admin only for creating and deleting
router.post(
  "/announcements",
  authMiddleware,
  permissionMiddleware("announcements.manage"),
  AnnouncementController.createAnnouncement,
);
router.get("/announcements", authMiddleware, AnnouncementController.getHistory);
router.delete(
  "/announcements/:id",
  authMiddleware,
  permissionMiddleware("announcements.manage"),
  AnnouncementController.deleteAnnouncement,
);

// Plant daily report routes — any org member can log/view entries; editing
// or deleting someone else's entry is gated inside the controller (creator
// or admin/super_admin only), not by role, since it's per-resource.
router.get("/plant-reports", authMiddleware, PlantReportController.getMonth);
router.get("/plant-reports/prefill", authMiddleware, PlantReportController.getPrefill);
router.post("/plant-reports", authMiddleware, PlantReportController.create);
router.put("/plant-reports/:id", authMiddleware, PlantReportController.update);
router.delete("/plant-reports/:id", authMiddleware, PlantReportController.remove);

// Plant report custom fields — any org member can read them (needed to
// render the daily entry form), but defining/renaming/removing a field is an
// organization-wide schema change, so it's admin-gated.
router.get("/plant-report-fields", authMiddleware, PlantReportFieldController.list);
router.post(
  "/plant-report-fields",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  PlantReportFieldController.create,
);
router.put(
  "/plant-report-fields/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  PlantReportFieldController.update,
);
router.delete(
  "/plant-report-fields/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  PlantReportFieldController.remove,
);

// Plant report items — any org member can read them (needed to render the
// daily entry form's item rows), but defining/renaming/removing an item is
// an organization-wide schema change, so it's admin-gated. Same pattern as
// plant-report-fields above.
router.get("/plant-report-items", authMiddleware, PlantReportItemController.list);
router.post(
  "/plant-report-items",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  PlantReportItemController.create,
);
router.put(
  "/plant-report-items/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  PlantReportItemController.update,
);
router.delete(
  "/plant-report-items/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  PlantReportItemController.remove,
);

// Notification routes — every authenticated user reads/manages only their own.
router.get("/notifications", authMiddleware, NotificationController.list);
router.get(
  "/notifications/unread-count",
  authMiddleware,
  NotificationController.unreadCount,
);
router.patch(
  "/notifications/:id/read",
  authMiddleware,
  NotificationController.markRead,
);
router.patch(
  "/notifications/read-all",
  authMiddleware,
  NotificationController.markAllRead,
);

// Project routes
router.post(
  "/projects",
  authMiddleware,
  permissionMiddleware("projects.manage"),
  ProjectController.createProject,
);
router.get("/projects", authMiddleware, ProjectController.getAllProjects);
router.get("/projects/:id", authMiddleware, ProjectController.getProjectById);
router.put(
  "/projects/:id",
  authMiddleware,
  permissionMiddleware("projects.manage"),
  ProjectController.updateProject,
);
router.delete(
  "/projects/:id",
  authMiddleware,
  permissionMiddleware("projects.manage"),
  ProjectController.deleteProject,
);

// Project task routes
router.post(
  "/projects/:projectId/tasks",
  authMiddleware,
  permissionMiddleware("projects.manage"),
  ProjectController.addProjectTask,
);
router.put(
  "/projects/tasks/:taskId",
  authMiddleware,
  permissionMiddleware("projects.manage"),
  ProjectController.updateProjectTask,
);
router.delete(
  "/projects/tasks/:taskId",
  authMiddleware,
  permissionMiddleware("projects.manage"),
  ProjectController.deleteProjectTask,
);
router.get(
  "/projects/:projectId/tasks",
  authMiddleware,
  TaskController.getTasksByProject,
);

// Project heading routes
router.post(
  "/projects/:projectId/headings",
  authMiddleware,
  permissionMiddleware("projects.manage"),
  ProjectController.addProjectHeading,
);

// Project file routes (Documents tab)
router.get(
  "/projects/:projectId/files",
  authMiddleware,
  ProjectFileController.getProjectFiles,
);
// Folder/file create, rename, delete are no longer gated here by the blanket
// "projects.documents" permission — per-node FileAccess grants now decide
// write access (see ProjectFileController), since a role that lacks
// projects.documents can still have been handed explicit write access to one
// folder. Root-level creation (no parentId to check a grant against) re-checks
// projects.documents inline in the controller instead.
router.post(
  "/projects/:projectId/folders",
  authMiddleware,
  ProjectFileController.addProjectFolder,
);
router.post(
  "/projects/:projectId/files",
  authMiddleware,
  requireCsrfHeader,
  ...uploadProjectFile,
  ProjectFileController.addProjectFile,
);
router.get(
  "/projects/files/:fileId/download",
  authMiddleware,
  ProjectFileController.downloadProjectFile,
);
router.get(
  "/projects/files/:fileId/view",
  authMiddleware,
  ProjectFileController.viewProjectFile,
);
// Issues a short-lived signed Supabase Storage URL for this file — used by
// the Office-document preview flow (Microsoft's Office Online viewer fetches
// that URL directly, so it needs no session cookie / no separate public route).
router.get(
  "/projects/files/:fileId/view-token",
  authMiddleware,
  ProjectFileController.getFileViewToken,
);
router.put(
  "/projects/files/:fileId",
  authMiddleware,
  ProjectFileController.renameProjectFile,
);
router.delete(
  "/projects/files/:fileId",
  authMiddleware,
  ProjectFileController.deleteProjectFile,
);
// File/folder access management — who can read/write a given node. Deliberately
// admin/super_admin only (not gated by the broader "projects.documents"
// permission finance can also hold), since granting access is a narrower
// capability than just using Documents.
router.get(
  "/projects/files/:fileId/access",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  ProjectFileController.getFileAccess,
);
router.put(
  "/projects/files/:fileId/access",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  ProjectFileController.setFileAccess,
);

// Procurement pipeline v2 (Purchase Request -> Vendor Selection -> Purchase Order ->
// Proforma Invoice -> Shipment/Insurance/Customs -> Cost Sheet -> Goods Receipt -> Inventory).
// Replaces the old flat "Procurement" routes below — ProcurementController's underlying data
// (procurement_item/procurement_attachment/procurement_status_history) is intentionally kept
// in the DB for historical integrity but is no longer routed to; see
// src/utils/migrate-procurement-to-pr-po.ts for the one-off migration into the new tables.
// View endpoints are open to any organization member with project access; mutations are gated
// on the existing "projects.procurement" permission key (no new permission key was introduced),
// except creating/editing/submitting a Purchase Request itself, which any authenticated member
// can do (see the "Purchase Requests + Vendor Selection" section below) — raising a request is
// meant to be self-service, only approving it and everything downstream is admin territory.
// The Purchase Orders and Vendors *pages* are additionally hidden from non-admins in the
// frontend (nav + route guard) since browsing PO/vendor pricing is admin-only by design; the
// underlying read APIs stay open like every other view endpoint here.

// Purchase Requests + Vendor Selection
// Creating/editing/submitting a draft PR is open to any authenticated organization member
// (any employee can raise a purchase request) — approving/rejecting it, and everything from
// vendor selection onward, stays gated on "projects.procurement" (see changeStatus's inline
// check and the vendor-quote/generate-po routes below).
router.get("/workspace/purchase-requests", authMiddleware, PurchaseRequestController.getOrganizationPurchaseRequests);
router.get("/projects/:projectId/purchase-requests", authMiddleware, PurchaseRequestController.getPurchaseRequests);
router.post(
  "/projects/:projectId/purchase-requests",
  authMiddleware,
  PurchaseRequestController.addPurchaseRequest,
);
router.put(
  "/purchase-requests/:id",
  authMiddleware,
  PurchaseRequestController.updatePurchaseRequest,
);
router.delete(
  "/purchase-requests/:id",
  authMiddleware,
  PurchaseRequestController.deletePurchaseRequest,
);
router.get("/purchase-requests/:id/detail", authMiddleware, PurchaseRequestController.getPurchaseRequestDetail);
router.post(
  "/purchase-requests/:id/status",
  authMiddleware,
  PurchaseRequestController.changeStatus,
);
router.post(
  "/purchase-requests/:id/vendor-quotes",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseRequestController.addVendorQuote,
);
router.put(
  "/purchase-requests/:id/vendor-quotes/:quoteId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseRequestController.updateVendorQuote,
);
router.delete(
  "/purchase-requests/:id/vendor-quotes/:quoteId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseRequestController.deleteVendorQuote,
);
router.post(
  "/purchase-requests/:id/vendor-quotes/:quoteId/select",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseRequestController.selectVendorQuote,
);
router.post(
  "/purchase-requests/:id/generate-po",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseRequestController.generatePurchaseOrder,
);
router.post(
  "/purchase-requests/:itemId/attachments",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  requireCsrfHeader,
  ...uploadPurchaseRequestFile,
  PurchaseRequestController.addAttachment,
);
router.delete(
  "/purchase-requests/:itemId/attachments/:attachmentId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseRequestController.deleteAttachment,
);

// Purchase Orders + Cost Sheet
router.get("/workspace/purchase-orders", authMiddleware, PurchaseOrderController.getOrganizationPurchaseOrders);
router.get("/projects/:projectId/purchase-orders", authMiddleware, PurchaseOrderController.getPurchaseOrders);
router.get("/purchase-orders/:id/detail", authMiddleware, PurchaseOrderController.getPurchaseOrderDetail);
router.put(
  "/purchase-orders/:id",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseOrderController.updatePurchaseOrder,
);
router.get("/purchase-orders/:id/cost-sheet", authMiddleware, PurchaseOrderController.getCostSheet);
router.get("/purchase-orders/:id/pdf", authMiddleware, PurchaseOrderController.downloadPdf);
router.post(
  "/purchase-orders/:itemId/attachments",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  requireCsrfHeader,
  ...uploadPurchaseOrderFile,
  PurchaseOrderController.addAttachment,
);
router.delete(
  "/purchase-orders/:itemId/attachments/:attachmentId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  PurchaseOrderController.deleteAttachment,
);

// Proforma Invoices
router.get("/workspace/proforma-invoices", authMiddleware, ProformaInvoiceController.getAllProformaInvoices);
router.post(
  "/purchase-orders/:id/proforma-invoices",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProformaInvoiceController.addProformaInvoice,
);
router.put(
  "/proforma-invoices/:id",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProformaInvoiceController.updateProformaInvoice,
);
router.delete(
  "/proforma-invoices/:id",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProformaInvoiceController.deleteProformaInvoice,
);
router.put(
  "/proforma-invoices/:id/status",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProformaInvoiceController.changeStatus,
);
router.post(
  "/proforma-invoices/:itemId/attachment",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  requireCsrfHeader,
  ...uploadProformaInvoiceFile,
  ProformaInvoiceController.addAttachment,
);

// Shipment (Local + International) + Insurance + Customs
router.post(
  "/purchase-orders/:id/shipment",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ShipmentController.addShipment,
);
router.put(
  "/shipments/:id",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ShipmentController.updateShipment,
);
router.post(
  "/shipments/:id/insurance",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ShipmentController.addInsurance,
);
router.put(
  "/insurance/:id",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ShipmentController.updateInsurance,
);
router.post(
  "/shipments/:id/customs",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ShipmentController.addCustoms,
);
router.put(
  "/customs/:id",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ShipmentController.updateCustoms,
);
router.post(
  "/customs/:itemId/documents",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  requireCsrfHeader,
  ...uploadCustomsFile,
  ShipmentController.addCustomsDocument,
);
router.delete(
  "/customs/:itemId/documents/:documentId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ShipmentController.deleteCustomsDocument,
);

// Goods Receipt (GRN) — accepting/partially-accepting is the only action in this whole
// pipeline that increments real Inventory stock (see GoodsReceiptController.updateStatus).
router.get(
  "/workspace/goods-receipts",
  authMiddleware,
  GoodsReceiptController.getOrganizationGoodsReceipts,
);
router.post(
  "/purchase-orders/:id/goods-receipts",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  GoodsReceiptController.addGoodsReceipt,
);
router.put(
  "/goods-receipts/:id/status",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  GoodsReceiptController.updateStatus,
);
router.post(
  "/goods-receipts/:itemId/photos",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  requireCsrfHeader,
  ...uploadGoodsReceiptFile,
  GoodsReceiptController.addPhoto,
);
router.delete(
  "/goods-receipts/:itemId/photos/:photoId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  GoodsReceiptController.deletePhoto,
);

// Project energy performance routes (Energy Performance tab) — view is open to
// any organization member with project access; upsert is admin-gated.
router.get(
  "/projects/:projectId/performance",
  authMiddleware,
  MonthlyPerformanceController.getMonthlyPerformance,
);
router.put(
  "/projects/:projectId/performance",
  authMiddleware,
  permissionMiddleware("projects.performance"),
  MonthlyPerformanceController.upsertMonthlyPerformance,
);
router.get(
  "/projects/:projectId/performance/daily",
  authMiddleware,
  DailyGenerationController.getDaily,
);
router.put(
  "/projects/:projectId/performance/daily",
  authMiddleware,
  permissionMiddleware("projects.performance"),
  DailyGenerationController.upsertDaily,
);
router.get(
  "/projects/:projectId/performance/summary",
  authMiddleware,
  DailyGenerationController.getSummary,
);

// Project inventory routes (Inventory tab) — view is open to any organization
// member with project access; add/edit/delete are admin-gated.
router.get(
  "/workspace/inventory",
  authMiddleware,
  InventoryController.getOrganizationInventory,
);
router.get(
  "/projects/:projectId/inventory",
  authMiddleware,
  InventoryController.getInventoryItems,
);
router.post(
  "/projects/:projectId/inventory",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.addInventoryItem,
);
router.put(
  "/projects/inventory/:itemId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.updateInventoryItem,
);
router.delete(
  "/projects/inventory/:itemId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.deleteInventoryItem,
);
router.get(
  "/projects/inventory/:itemId/detail",
  authMiddleware,
  InventoryController.getInventoryItemDetail,
);
router.post(
  "/projects/inventory/:itemId/adjust",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.adjustStock,
);
router.post(
  "/projects/inventory/:itemId/transfers",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.createTransfer,
);
router.put(
  "/projects/inventory/:itemId/transfers/:transferId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.updateTransferStatus,
);
router.post(
  "/projects/inventory/:itemId/batches",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.addBatch,
);
router.delete(
  "/projects/inventory/:itemId/batches/:batchId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.deleteBatch,
);
router.post(
  "/projects/inventory/:itemId/serials",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.addSerial,
);
router.delete(
  "/projects/inventory/:itemId/serials/:serialId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.deleteSerial,
);
router.post(
  "/projects/inventory/:itemId/attachments",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  requireCsrfHeader,
  ...uploadInventoryFile,
  InventoryController.addAttachment,
);
router.delete(
  "/projects/inventory/:itemId/attachments/:attachmentId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.deleteAttachment,
);
router.get(
  "/workspace/inventory/transfers",
  authMiddleware,
  InventoryController.getOrganizationPendingTransfers,
);
router.get(
  "/workspace/inventory/transactions",
  authMiddleware,
  InventoryController.getOrganizationInventoryTransactions,
);
router.get(
  "/workspace/warehouses",
  authMiddleware,
  InventoryController.getOrganizationWarehouses,
);
router.post(
  "/workspace/warehouses",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.createWarehouse,
);
router.delete(
  "/workspace/warehouses/:warehouseId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.deleteWarehouse,
);
router.get(
  "/workspace/vendors",
  authMiddleware,
  InventoryController.getOrganizationVendors,
);
router.post(
  "/workspace/vendors",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.createVendor,
);
router.put(
  "/workspace/vendors/:vendorId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.updateVendor,
);
router.delete(
  "/workspace/vendors/:vendorId",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.deleteVendor,
);

// Shared item catalog (name + code) — keeps item naming consistent between
// the Inventory and Procurement "Add item" forms.
router.get("/workspace/items", authMiddleware, CatalogItemController.getOrganizationItems);
router.post(
  "/workspace/items",
  authMiddleware,
  anyPermissionMiddleware(["projects.inventory", "projects.procurement"]),
  CatalogItemController.createItem,
);

// Reports dashboard
router.get("/workspace/reports/summary", authMiddleware, ReportsController.getSummary);
router.get("/workspace/reports/activity", authMiddleware, ReportsController.getReportActivity);
router.post(
  "/workspace/reports/activity",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  ReportsController.logReportActivity,
);
router.get("/workspace/reports/comments", authMiddleware, ReportsController.getReportComments);
router.post(
  "/workspace/reports/comments",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  ReportsController.addReportComment,
);

// Organization-level document routes (sidebar Documents page). Rename/download/delete
// reuse the same /projects/files/:fileId endpoints above — they resolve ownership
// via whichever of project/organization is set on the row.
router.get(
  "/workspace/files",
  authMiddleware,
  OrganizationFileController.getOrganizationFiles,
);
router.post(
  "/workspace/folders",
  authMiddleware,
  OrganizationFileController.addOrganizationFolder,
);
router.post(
  "/workspace/files",
  authMiddleware,
  requireCsrfHeader,
  ...uploadOrganizationFile,
  OrganizationFileController.addOrganizationFile,
);

// Personal task routes
router.post("/mytasks", authMiddleware, MyTaskController.createMyTask);
router.get("/mytasks", authMiddleware, MyTaskController.getMyTasks);
router.put("/mytasks/:id", authMiddleware, MyTaskController.updateMyTask);
router.delete("/mytasks/:id", authMiddleware, MyTaskController.deleteMyTask);

// Task routes
router.post(
  "/tasks",
  authMiddleware,
  // roleMiddleware([UserRole.ADMIN]),
  requireCsrfHeader,
  ...upload,
  TaskController.createTask,
);
router.get("/tasks", authMiddleware, TaskController.getAllTasks);
router.get("/tasks/:id", authMiddleware, TaskController.getTaskById);
router.get("/dashboard", authMiddleware, DashboardController.getDashboard);
router.put(
  "/tasks/:id/progress",
  authMiddleware,
  TaskController.updateTaskProgress,
);
router.put(
  "/tasks/:id",
  authMiddleware,
  permissionMiddleware("tasks.edit"),
  requireCsrfHeader,
  ...upload,
  TaskController.updateTask,
);
router.put(
  "/tasks/:id/status",
  authMiddleware,
  TaskController.updateTaskStatus,
);
router.delete(
  "/tasks/:id",
  authMiddleware,
  permissionMiddleware("tasks.delete"),
  TaskController.deleteTask,
);

// Subtask routes
router.get(
  "/tasks/:taskId/subtasks",
  authMiddleware,
  SubTaskController.getSubTasks,
);
router.post(
  "/tasks/:taskId/subtasks",
  authMiddleware,
  // roleMiddleware([UserRole.ADMIN]),
  SubTaskController.addSubTask,
);
router.put(
  "/tasks/:taskId/subtasks/:subtaskId",
  authMiddleware,
  // roleMiddleware([UserRole.ADMIN]),
  SubTaskController.updateSubTask,
);
router.delete(
  "/tasks/:taskId/subtasks/:subtaskId",
  authMiddleware,
  SubTaskController.deleteSubTask,
);

// Comment routes
router.post(
  "/tasks/:taskId/comments",
  authMiddleware,
  TaskCommentController.addComment,
);
router.get(
  "/tasks/:taskId/comments",
  authMiddleware,
  TaskCommentController.getTaskComments,
);
router.put(
  "/tasks/:taskId/comments/:commentId/feedback",
  authMiddleware,
  permissionMiddleware("tasks.feedback"),
  TaskCommentController.addFeedback,
);

// Subtask comment routes
router.post(
  "/tasks/:taskId/subtasks/:subtaskId/comments",
  authMiddleware,
  TaskCommentController.addSubTaskComment,
);
router.get(
  "/tasks/:taskId/subtasks/:subtaskId/comments",
  authMiddleware,
  TaskCommentController.getSubTaskComments,
);
router.put(
  "/tasks/:taskId/subtasks/:subtaskId/comments/:commentId/feedback",
  authMiddleware,
  TaskCommentController.addSubTaskFeedback,
);

// Leave request routes
router.post(
  "/leaverequest",
  authMiddleware,
  LeaveRequestController.createLeaveRequest,
);

router.get(
  "/leaverequest",
  authMiddleware,
  LeaveRequestController.getAllLeaveRequests,
);

router.get(
  "/leaverequest/:id",
  authMiddleware,
  LeaveRequestController.getLeaveRequestById,
);

router.put(
  "/leaverequest/:id/status",
  authMiddleware,
  permissionMiddleware("leave.manage"),
  LeaveRequestController.updateStatus,
);

router.put(
  "/leaverequest/:id",
  authMiddleware,
  LeaveRequestController.updateLeaveRequest,
);

router.delete(
  "/leaverequest/:id",
  authMiddleware,
  permissionMiddleware("leave.manage"),
  LeaveRequestController.deleteLeaveRequest,
);

// Site visit request routes
router.post(
  "/sitevisit",
  authMiddleware,
  SiteVisitRequestController.createSiteVisitRequest,
);

router.get(
  "/sitevisit",
  authMiddleware,
  SiteVisitRequestController.getAllSiteVisitRequests,
);

router.get(
  "/sitevisit/:id",
  authMiddleware,
  SiteVisitRequestController.getSiteVisitRequestById,
);

router.put(
  "/sitevisit/:id/status",
  authMiddleware,
  permissionMiddleware("sitevisit.manage"),
  SiteVisitRequestController.updateStatus,
);

router.put(
  "/sitevisit/:id",
  authMiddleware,
  SiteVisitRequestController.updateSiteVisitRequest,
);

router.delete(
  "/sitevisit/:id",
  authMiddleware,
  permissionMiddleware("sitevisit.manage"),
  SiteVisitRequestController.deleteSiteVisitRequest,
);

// Expense request routes
router.post(
  "/expense",
  authMiddleware,
  ExpenseRequestController.createExpenseRequest,
);

router.get(
  "/expense",
  authMiddleware,
  ExpenseRequestController.getAllExpenseRequests,
);

router.get(
  "/expense/:id",
  authMiddleware,
  ExpenseRequestController.getExpenseRequestById,
);

router.put(
  "/expense/:id/status",
  authMiddleware,
  permissionMiddleware("expense.manage"),
  ExpenseRequestController.updateStatus,
);

router.put(
  "/expense/:id",
  authMiddleware,
  ExpenseRequestController.updateExpenseRequest,
);

router.delete(
  "/expense/:id",
  authMiddleware,
  permissionMiddleware("expense.manage"),
  ExpenseRequestController.deleteExpenseRequest,
);

// Calendar Event routes
router.get("/events", authMiddleware, CalendarEventController.getAllEvents);
router.post(
  "/events",
  authMiddleware,
  permissionMiddleware("calendar.manage"),
  CalendarEventController.createEvent,
);
router.delete(
  "/events/:id",
  authMiddleware,
  permissionMiddleware("calendar.manage"),
  CalendarEventController.deleteEvent,
);

// Hierarchy routes
router.get("/hierarchy", authMiddleware, HierarchyController.getHierarchy);
router.put(
  "/hierarchy",
  authMiddleware,
  permissionMiddleware("hierarchy.manage"),
  HierarchyController.saveHierarchy,
);

// Project schedule (Gantt) routes — full replace on save
router.get(
  "/projects/:projectId/schedule",
  authMiddleware,
  scheduleController.getSchedule,
);
router.put(
  "/projects/:projectId/schedule",
  authMiddleware,
  permissionMiddleware("projects.schedule"),
  scheduleController.saveSchedule,
);

// Date conversion is now handled on the frontend; server routes removed.

export default router;
