"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuthController_1 = require("../controllers/AuthController");
const OrganizationController_1 = require("../controllers/OrganizationController");
const UserController_1 = require("../controllers/UserController");
const InviteController_1 = require("../controllers/InviteController");
const AnnouncementController_1 = require("../controllers/AnnouncementController");
const PlantReportController_1 = require("../controllers/PlantReportController");
const PlantReportFieldController_1 = require("../controllers/PlantReportFieldController");
const NotificationController_1 = require("../controllers/NotificationController");
const ProjectController_1 = require("../controllers/ProjectController");
const ProjectFileController_1 = require("../controllers/ProjectFileController");
const PurchaseOrderController_1 = require("../controllers/PurchaseOrderController");
const ProformaInvoiceController_1 = require("../controllers/ProformaInvoiceController");
const ShipmentController_1 = require("../controllers/ShipmentController");
const GoodsReceiptController_1 = require("../controllers/GoodsReceiptController");
const MonthlyPerformanceController_1 = require("../controllers/MonthlyPerformanceController");
const DailyGenerationController_1 = require("../controllers/DailyGenerationController");
const InventoryController_1 = require("../controllers/InventoryController");
const OrganizationFileController_1 = require("../controllers/OrganizationFileController");
const MyTaskController_1 = require("../controllers/MyTaskController");
const TaskController_1 = require("../controllers/TaskController");
const DashboardController_1 = require("../controllers/DashboardController");
const SubTaskController_1 = require("../controllers/SubTaskController");
const TaskCommentController_1 = require("../controllers/TaskCommentController");
const LeaveRequestController_1 = require("../controllers/LeaveRequestController");
const SiteVisitRequestController_1 = require("../controllers/SiteVisitRequestController");
const ExpenseRequestController_1 = require("../controllers/ExpenseRequestController");
const CalendarEventController_1 = require("../controllers/CalendarEventController");
const HierarchyController_1 = require("../controllers/HierarchyController");
const ScheduleController_1 = require("../controllers/ScheduleController");
const schedule_service_1 = require("../services/schedule.service");
const PermissionController_1 = require("../controllers/PermissionController");
const ReportsController_1 = require("../controllers/ReportsController");
const CatalogItemController_1 = require("../controllers/CatalogItemController");
const auth_1 = require("../middlewares/auth");
const rateLimit_1 = require("../middlewares/rateLimit");
const csrfHeader_1 = require("../middlewares/csrfHeader");
const upload_1 = require("../middlewares/upload");
const enums_1 = require("../types/enums");
const router = (0, express_1.Router)();
const scheduleController = new ScheduleController_1.ScheduleController(new schedule_service_1.ScheduleService());
// Auth routes
router.post("/register/start", rateLimit_1.authActionLimiter, AuthController_1.AuthController.registerStart);
router.post("/register/verify", rateLimit_1.authActionLimiter, AuthController_1.AuthController.registerVerify);
router.post("/forgot-password/start", rateLimit_1.authActionLimiter, AuthController_1.AuthController.forgotPasswordStart);
router.post("/forgot-password/reset", rateLimit_1.authActionLimiter, AuthController_1.AuthController.forgotPasswordReset);
router.post("/login", rateLimit_1.loginLimiter, AuthController_1.AuthController.login);
router.post("/logout", AuthController_1.AuthController.logout);
router.get("/me", auth_1.authMiddleware, AuthController_1.AuthController.getMe);
router.put("/me", auth_1.authMiddleware, AuthController_1.AuthController.updateMe);
router.put("/me/password", auth_1.authMiddleware, AuthController_1.AuthController.changePassword);
router.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
// Organization routes
router.get("/workspaces", auth_1.authMiddleware, OrganizationController_1.OrganizationController.getAll);
router.post("/workspaces", auth_1.authMiddleware, OrganizationController_1.OrganizationController.create);
router.post("/workspaces/switch", auth_1.authMiddleware, OrganizationController_1.OrganizationController.switch);
router.get("/workspaces/current", auth_1.authMiddleware, OrganizationController_1.OrganizationController.getCurrent);
router.put("/workspaces/:id", auth_1.authMiddleware, OrganizationController_1.OrganizationController.update);
router.delete("/workspaces/:id", auth_1.authMiddleware, OrganizationController_1.OrganizationController.remove);
// Letterhead signature/stamp images (Settings > Organization tab), scoped to the caller's
// current organization — used when generating Purchase Order PDFs.
router.post("/workspace/signature", auth_1.authMiddleware, csrfHeader_1.requireCsrfHeader, ...upload_1.uploadOrganizationSignature, OrganizationController_1.OrganizationController.uploadSignature);
router.delete("/workspace/signature", auth_1.authMiddleware, OrganizationController_1.OrganizationController.deleteSignature);
router.post("/workspace/stamp", auth_1.authMiddleware, csrfHeader_1.requireCsrfHeader, ...upload_1.uploadOrganizationStamp, OrganizationController_1.OrganizationController.uploadStamp);
router.delete("/workspace/stamp", auth_1.authMiddleware, OrganizationController_1.OrganizationController.deleteStamp);
// Cross-organization member access matrix (Settings > Organization tab) — lets a
// caller who belongs to more than one of their own organizations manage which
// of those organizations each employee can access, from one place.
router.get("/workspaces/access-matrix", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("members.manage"), OrganizationController_1.OrganizationController.getAccessMatrix);
router.put("/workspaces/:id/members/:userId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("members.manage"), OrganizationController_1.OrganizationController.grantMemberAccess);
router.delete("/workspaces/:id/members/:userId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("members.manage"), OrganizationController_1.OrganizationController.revokeMemberAccess);
// Permission routes — matrix is viewable by anyone, but only a super admin
// can edit it (hardcoded, not itself a toggleable permission).
router.get("/permissions", auth_1.authMiddleware, PermissionController_1.PermissionController.getMatrix);
router.put("/permissions", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.SUPER_ADMIN]), PermissionController_1.PermissionController.updateMatrix);
// User routes - Admin only for inviting and deleting users
router.post("/users/invite", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("members.manage"), InviteController_1.InviteController.sendInvite);
router.get("/users", auth_1.authMiddleware, UserController_1.UserController.getAllUsers);
// Invite accept flow — public, the invitee isn't logged in yet.
router.get("/invites/:token", InviteController_1.InviteController.getInvite);
router.post("/invites/:token/accept", InviteController_1.InviteController.acceptInvite);
router.delete("/users/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("members.manage"), UserController_1.UserController.deleteUser);
router.put("/users/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("members.manage"), UserController_1.UserController.updateUser);
// Announcement routes - Admin only for creating and deleting
router.post("/announcements", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("announcements.manage"), AnnouncementController_1.AnnouncementController.createAnnouncement);
router.get("/announcements", auth_1.authMiddleware, AnnouncementController_1.AnnouncementController.getHistory);
router.delete("/announcements/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("announcements.manage"), AnnouncementController_1.AnnouncementController.deleteAnnouncement);
// Plant daily report routes — any org member can log/view entries; editing
// or deleting someone else's entry is gated inside the controller (creator
// or admin/super_admin only), not by role, since it's per-resource.
router.get("/plant-reports", auth_1.authMiddleware, PlantReportController_1.PlantReportController.getMonth);
router.get("/plant-reports/prefill", auth_1.authMiddleware, PlantReportController_1.PlantReportController.getPrefill);
router.post("/plant-reports", auth_1.authMiddleware, PlantReportController_1.PlantReportController.create);
router.put("/plant-reports/:id", auth_1.authMiddleware, PlantReportController_1.PlantReportController.update);
router.delete("/plant-reports/:id", auth_1.authMiddleware, PlantReportController_1.PlantReportController.remove);
// Plant report custom fields — any org member can read them (needed to
// render the daily entry form), but defining/renaming/removing a field is an
// organization-wide schema change, so it's admin-gated.
router.get("/plant-report-fields", auth_1.authMiddleware, PlantReportFieldController_1.PlantReportFieldController.list);
router.post("/plant-report-fields", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN]), PlantReportFieldController_1.PlantReportFieldController.create);
router.put("/plant-report-fields/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN]), PlantReportFieldController_1.PlantReportFieldController.update);
router.delete("/plant-report-fields/:id", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN]), PlantReportFieldController_1.PlantReportFieldController.remove);
// Notification routes — every authenticated user reads/manages only their own.
router.get("/notifications", auth_1.authMiddleware, NotificationController_1.NotificationController.list);
router.get("/notifications/unread-count", auth_1.authMiddleware, NotificationController_1.NotificationController.unreadCount);
router.patch("/notifications/:id/read", auth_1.authMiddleware, NotificationController_1.NotificationController.markRead);
router.patch("/notifications/read-all", auth_1.authMiddleware, NotificationController_1.NotificationController.markAllRead);
// Project routes
router.post("/projects", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.manage"), ProjectController_1.ProjectController.createProject);
router.get("/projects", auth_1.authMiddleware, ProjectController_1.ProjectController.getAllProjects);
router.get("/projects/:id", auth_1.authMiddleware, ProjectController_1.ProjectController.getProjectById);
router.put("/projects/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.manage"), ProjectController_1.ProjectController.updateProject);
router.delete("/projects/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.manage"), ProjectController_1.ProjectController.deleteProject);
// Project task routes
router.post("/projects/:projectId/tasks", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.manage"), ProjectController_1.ProjectController.addProjectTask);
router.put("/projects/tasks/:taskId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.manage"), ProjectController_1.ProjectController.updateProjectTask);
router.delete("/projects/tasks/:taskId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.manage"), ProjectController_1.ProjectController.deleteProjectTask);
router.get("/projects/:projectId/tasks", auth_1.authMiddleware, TaskController_1.TaskController.getTasksByProject);
// Project heading routes
router.post("/projects/:projectId/headings", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.manage"), ProjectController_1.ProjectController.addProjectHeading);
// Project file routes (Documents tab)
router.get("/projects/:projectId/files", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.getProjectFiles);
// Folder/file create, rename, delete are no longer gated here by the blanket
// "projects.documents" permission — per-node FileAccess grants now decide
// write access (see ProjectFileController), since a role that lacks
// projects.documents can still have been handed explicit write access to one
// folder. Root-level creation (no parentId to check a grant against) re-checks
// projects.documents inline in the controller instead.
router.post("/projects/:projectId/folders", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.addProjectFolder);
router.post("/projects/:projectId/files", auth_1.authMiddleware, csrfHeader_1.requireCsrfHeader, ...upload_1.uploadProjectFile, ProjectFileController_1.ProjectFileController.addProjectFile);
router.get("/projects/files/:fileId/download", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.downloadProjectFile);
router.get("/projects/files/:fileId/view", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.viewProjectFile);
// Issues a short-lived signed Supabase Storage URL for this file — used by
// the Office-document preview flow (Microsoft's Office Online viewer fetches
// that URL directly, so it needs no session cookie / no separate public route).
router.get("/projects/files/:fileId/view-token", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.getFileViewToken);
router.put("/projects/files/:fileId", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.renameProjectFile);
router.delete("/projects/files/:fileId", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.deleteProjectFile);
// File/folder access management — who can read/write a given node. Deliberately
// admin/super_admin only (not gated by the broader "projects.documents"
// permission finance can also hold), since granting access is a narrower
// capability than just using Documents.
router.get("/projects/files/:fileId/access", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN]), ProjectFileController_1.ProjectFileController.getFileAccess);
router.put("/projects/files/:fileId/access", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN]), ProjectFileController_1.ProjectFileController.setFileAccess);
// Procurement pipeline v2 (Purchase Order -> Proforma Invoice ->
// Shipment/Insurance/Customs -> Cost Sheet -> Goods Receipt -> Inventory).
// Replaces the old flat "Procurement" routes below — ProcurementController's underlying data
// (procurement_item/procurement_attachment/procurement_status_history) is intentionally kept
// in the DB for historical integrity but is no longer routed to.
// View endpoints are open to any organization member with project access; mutations (including
// creating a Purchase Order) are gated on the existing "projects.procurement" permission key.
// The Purchase Orders and Vendors *pages* are additionally hidden from non-admins in the
// frontend (nav + route guard) since browsing PO/vendor pricing is admin-only by design; the
// underlying read APIs stay open like every other view endpoint here.
// Purchase Orders + Cost Sheet
router.get("/workspace/purchase-orders", auth_1.authMiddleware, PurchaseOrderController_1.PurchaseOrderController.getOrganizationPurchaseOrders);
router.get("/projects/:projectId/purchase-orders", auth_1.authMiddleware, PurchaseOrderController_1.PurchaseOrderController.getPurchaseOrders);
router.post("/projects/:projectId/purchase-orders", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), PurchaseOrderController_1.PurchaseOrderController.createPurchaseOrder);
router.get("/purchase-orders/:id/detail", auth_1.authMiddleware, PurchaseOrderController_1.PurchaseOrderController.getPurchaseOrderDetail);
router.put("/purchase-orders/:id", auth_1.authMiddleware, PurchaseOrderController_1.PurchaseOrderController.updatePurchaseOrder);
router.post("/purchase-orders/:id/approval", auth_1.authMiddleware, PurchaseOrderController_1.PurchaseOrderController.decidePurchaseOrderApproval);
router.get("/purchase-orders/:id/cost-sheet", auth_1.authMiddleware, PurchaseOrderController_1.PurchaseOrderController.getCostSheet);
router.get("/purchase-orders/:id/pdf", auth_1.authMiddleware, PurchaseOrderController_1.PurchaseOrderController.downloadPdf);
// Proforma Invoices
router.get("/workspace/proforma-invoices", auth_1.authMiddleware, ProformaInvoiceController_1.ProformaInvoiceController.getAllProformaInvoices);
router.post("/purchase-orders/:id/proforma-invoices", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProformaInvoiceController_1.ProformaInvoiceController.addProformaInvoice);
router.put("/proforma-invoices/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProformaInvoiceController_1.ProformaInvoiceController.updateProformaInvoice);
router.delete("/proforma-invoices/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProformaInvoiceController_1.ProformaInvoiceController.deleteProformaInvoice);
router.put("/proforma-invoices/:id/status", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProformaInvoiceController_1.ProformaInvoiceController.changeStatus);
router.post("/proforma-invoices/:itemId/attachment", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), csrfHeader_1.requireCsrfHeader, ...upload_1.uploadProformaInvoiceFile, ProformaInvoiceController_1.ProformaInvoiceController.addAttachment);
// Shipment (Local + International) + Insurance + Customs
router.post("/purchase-orders/:id/shipment", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ShipmentController_1.ShipmentController.addShipment);
router.put("/shipments/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ShipmentController_1.ShipmentController.updateShipment);
router.post("/shipments/:id/insurance", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ShipmentController_1.ShipmentController.addInsurance);
router.put("/insurance/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ShipmentController_1.ShipmentController.updateInsurance);
router.post("/shipments/:id/customs", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ShipmentController_1.ShipmentController.addCustoms);
router.put("/customs/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ShipmentController_1.ShipmentController.updateCustoms);
router.post("/customs/:itemId/documents", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), csrfHeader_1.requireCsrfHeader, ...upload_1.uploadCustomsFile, ShipmentController_1.ShipmentController.addCustomsDocument);
router.delete("/customs/:itemId/documents/:documentId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ShipmentController_1.ShipmentController.deleteCustomsDocument);
// Goods Receipt (GRN) — accepting/partially-accepting is the only action in this whole
// pipeline that increments real Inventory stock (see GoodsReceiptController.updateStatus).
router.get("/workspace/goods-receipts", auth_1.authMiddleware, GoodsReceiptController_1.GoodsReceiptController.getOrganizationGoodsReceipts);
router.post("/purchase-orders/:id/goods-receipts", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), GoodsReceiptController_1.GoodsReceiptController.addGoodsReceipt);
router.put("/goods-receipts/:id/status", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), GoodsReceiptController_1.GoodsReceiptController.updateStatus);
router.post("/goods-receipts/:itemId/photos", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), csrfHeader_1.requireCsrfHeader, ...upload_1.uploadGoodsReceiptFile, GoodsReceiptController_1.GoodsReceiptController.addPhoto);
router.delete("/goods-receipts/:itemId/photos/:photoId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), GoodsReceiptController_1.GoodsReceiptController.deletePhoto);
// Project energy performance routes (Energy Performance tab) — view is open to
// any organization member with project access; upsert is admin-gated.
router.get("/projects/:projectId/performance", auth_1.authMiddleware, MonthlyPerformanceController_1.MonthlyPerformanceController.getMonthlyPerformance);
router.put("/projects/:projectId/performance", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.performance"), MonthlyPerformanceController_1.MonthlyPerformanceController.upsertMonthlyPerformance);
router.get("/projects/:projectId/performance/daily", auth_1.authMiddleware, DailyGenerationController_1.DailyGenerationController.getDaily);
router.put("/projects/:projectId/performance/daily", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.performance"), DailyGenerationController_1.DailyGenerationController.upsertDaily);
router.delete("/projects/:projectId/performance/daily", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.performance"), DailyGenerationController_1.DailyGenerationController.deleteDaily);
router.post("/projects/:projectId/performance/summary", auth_1.authMiddleware, DailyGenerationController_1.DailyGenerationController.getSummary);
// Project inventory routes (Inventory tab) — view is open to any organization
// member with project access; add/edit/delete are admin-gated.
router.get("/workspace/inventory", auth_1.authMiddleware, InventoryController_1.InventoryController.getOrganizationInventory);
router.get("/projects/:projectId/inventory", auth_1.authMiddleware, InventoryController_1.InventoryController.getInventoryItems);
router.post("/projects/:projectId/inventory", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.addInventoryItem);
router.put("/projects/inventory/:itemId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.updateInventoryItem);
router.delete("/projects/inventory/:itemId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.deleteInventoryItem);
router.get("/projects/inventory/:itemId/detail", auth_1.authMiddleware, InventoryController_1.InventoryController.getInventoryItemDetail);
router.post("/projects/inventory/:itemId/adjust", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.adjustStock);
router.post("/projects/inventory/:itemId/transfers", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.createTransfer);
router.put("/projects/inventory/:itemId/transfers/:transferId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.updateTransferStatus);
router.post("/projects/inventory/:itemId/batches", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.addBatch);
router.delete("/projects/inventory/:itemId/batches/:batchId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.deleteBatch);
router.post("/projects/inventory/:itemId/serials", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.addSerial);
router.delete("/projects/inventory/:itemId/serials/:serialId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.deleteSerial);
router.post("/projects/inventory/:itemId/attachments", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), csrfHeader_1.requireCsrfHeader, ...upload_1.uploadInventoryFile, InventoryController_1.InventoryController.addAttachment);
router.delete("/projects/inventory/:itemId/attachments/:attachmentId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.deleteAttachment);
router.get("/workspace/inventory/transfers", auth_1.authMiddleware, InventoryController_1.InventoryController.getOrganizationPendingTransfers);
router.get("/workspace/inventory/transactions", auth_1.authMiddleware, InventoryController_1.InventoryController.getOrganizationInventoryTransactions);
router.get("/workspace/warehouses", auth_1.authMiddleware, InventoryController_1.InventoryController.getOrganizationWarehouses);
router.post("/workspace/warehouses", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.createWarehouse);
router.delete("/workspace/warehouses/:warehouseId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.deleteWarehouse);
router.get("/workspace/vendors", auth_1.authMiddleware, InventoryController_1.InventoryController.getOrganizationVendors);
router.post("/workspace/vendors", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.createVendor);
router.put("/workspace/vendors/:vendorId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.updateVendor);
router.delete("/workspace/vendors/:vendorId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), InventoryController_1.InventoryController.deleteVendor);
// Shared item catalog (name + code) — keeps item naming consistent between
// the Inventory and Procurement "Add item" forms.
router.get("/workspace/items", auth_1.authMiddleware, CatalogItemController_1.CatalogItemController.getOrganizationItems);
router.post("/workspace/items", auth_1.authMiddleware, (0, auth_1.anyPermissionMiddleware)(["projects.inventory", "projects.procurement"]), CatalogItemController_1.CatalogItemController.createItem);
// Reports dashboard
router.get("/workspace/reports/summary", auth_1.authMiddleware, ReportsController_1.ReportsController.getSummary);
router.get("/workspace/reports/activity", auth_1.authMiddleware, ReportsController_1.ReportsController.getReportActivity);
router.post("/workspace/reports/activity", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), ReportsController_1.ReportsController.logReportActivity);
router.get("/workspace/reports/comments", auth_1.authMiddleware, ReportsController_1.ReportsController.getReportComments);
router.post("/workspace/reports/comments", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), ReportsController_1.ReportsController.addReportComment);
// Organization-level document routes (sidebar Documents page). Rename/download/delete
// reuse the same /projects/files/:fileId endpoints above — they resolve ownership
// via whichever of project/organization is set on the row.
router.get("/workspace/files", auth_1.authMiddleware, OrganizationFileController_1.OrganizationFileController.getOrganizationFiles);
router.post("/workspace/folders", auth_1.authMiddleware, OrganizationFileController_1.OrganizationFileController.addOrganizationFolder);
router.post("/workspace/files", auth_1.authMiddleware, csrfHeader_1.requireCsrfHeader, ...upload_1.uploadOrganizationFile, OrganizationFileController_1.OrganizationFileController.addOrganizationFile);
// Personal task routes
router.post("/mytasks", auth_1.authMiddleware, MyTaskController_1.MyTaskController.createMyTask);
router.get("/mytasks", auth_1.authMiddleware, MyTaskController_1.MyTaskController.getMyTasks);
router.put("/mytasks/:id", auth_1.authMiddleware, MyTaskController_1.MyTaskController.updateMyTask);
router.delete("/mytasks/:id", auth_1.authMiddleware, MyTaskController_1.MyTaskController.deleteMyTask);
// Task routes
router.post("/tasks", auth_1.authMiddleware, 
// roleMiddleware([UserRole.ADMIN]),
csrfHeader_1.requireCsrfHeader, ...upload_1.upload, TaskController_1.TaskController.createTask);
router.get("/tasks", auth_1.authMiddleware, TaskController_1.TaskController.getAllTasks);
router.get("/tasks/:id", auth_1.authMiddleware, TaskController_1.TaskController.getTaskById);
router.get("/dashboard", auth_1.authMiddleware, DashboardController_1.DashboardController.getDashboard);
router.put("/tasks/:id/progress", auth_1.authMiddleware, TaskController_1.TaskController.updateTaskProgress);
router.put("/tasks/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("tasks.edit"), csrfHeader_1.requireCsrfHeader, ...upload_1.upload, TaskController_1.TaskController.updateTask);
router.put("/tasks/:id/status", auth_1.authMiddleware, TaskController_1.TaskController.updateTaskStatus);
router.delete("/tasks/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("tasks.delete"), TaskController_1.TaskController.deleteTask);
// Subtask routes
router.get("/tasks/:taskId/subtasks", auth_1.authMiddleware, SubTaskController_1.SubTaskController.getSubTasks);
router.post("/tasks/:taskId/subtasks", auth_1.authMiddleware, 
// roleMiddleware([UserRole.ADMIN]),
SubTaskController_1.SubTaskController.addSubTask);
router.put("/tasks/:taskId/subtasks/:subtaskId", auth_1.authMiddleware, 
// roleMiddleware([UserRole.ADMIN]),
SubTaskController_1.SubTaskController.updateSubTask);
router.delete("/tasks/:taskId/subtasks/:subtaskId", auth_1.authMiddleware, SubTaskController_1.SubTaskController.deleteSubTask);
// Comment routes
router.post("/tasks/:taskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.addComment);
router.get("/tasks/:taskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.getTaskComments);
router.put("/tasks/:taskId/comments/:commentId/feedback", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("tasks.feedback"), TaskCommentController_1.TaskCommentController.addFeedback);
// Subtask comment routes
router.post("/tasks/:taskId/subtasks/:subtaskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.addSubTaskComment);
router.get("/tasks/:taskId/subtasks/:subtaskId/comments", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.getSubTaskComments);
router.put("/tasks/:taskId/subtasks/:subtaskId/comments/:commentId/feedback", auth_1.authMiddleware, TaskCommentController_1.TaskCommentController.addSubTaskFeedback);
// Leave request routes
router.post("/leaverequest", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.createLeaveRequest);
router.get("/leaverequest", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.getAllLeaveRequests);
router.get("/leaverequest/:id", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.getLeaveRequestById);
router.put("/leaverequest/:id/status", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("leave.manage"), LeaveRequestController_1.LeaveRequestController.updateStatus);
router.put("/leaverequest/:id", auth_1.authMiddleware, LeaveRequestController_1.LeaveRequestController.updateLeaveRequest);
router.delete("/leaverequest/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("leave.manage"), LeaveRequestController_1.LeaveRequestController.deleteLeaveRequest);
// Site visit request routes
router.post("/sitevisit", auth_1.authMiddleware, SiteVisitRequestController_1.SiteVisitRequestController.createSiteVisitRequest);
router.get("/sitevisit", auth_1.authMiddleware, SiteVisitRequestController_1.SiteVisitRequestController.getAllSiteVisitRequests);
router.get("/sitevisit/:id", auth_1.authMiddleware, SiteVisitRequestController_1.SiteVisitRequestController.getSiteVisitRequestById);
router.put("/sitevisit/:id/status", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("sitevisit.manage"), SiteVisitRequestController_1.SiteVisitRequestController.updateStatus);
router.put("/sitevisit/:id", auth_1.authMiddleware, SiteVisitRequestController_1.SiteVisitRequestController.updateSiteVisitRequest);
router.delete("/sitevisit/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("sitevisit.manage"), SiteVisitRequestController_1.SiteVisitRequestController.deleteSiteVisitRequest);
// Expense request routes
router.post("/expense", auth_1.authMiddleware, ExpenseRequestController_1.ExpenseRequestController.createExpenseRequest);
router.get("/expense", auth_1.authMiddleware, ExpenseRequestController_1.ExpenseRequestController.getAllExpenseRequests);
router.get("/expense/:id", auth_1.authMiddleware, ExpenseRequestController_1.ExpenseRequestController.getExpenseRequestById);
router.put("/expense/:id/status", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("expense.manage"), ExpenseRequestController_1.ExpenseRequestController.updateStatus);
router.put("/expense/:id", auth_1.authMiddleware, ExpenseRequestController_1.ExpenseRequestController.updateExpenseRequest);
router.delete("/expense/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("expense.manage"), ExpenseRequestController_1.ExpenseRequestController.deleteExpenseRequest);
// Calendar Event routes
router.get("/events", auth_1.authMiddleware, CalendarEventController_1.CalendarEventController.getAllEvents);
router.post("/events", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("calendar.manage"), CalendarEventController_1.CalendarEventController.createEvent);
router.delete("/events/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("calendar.manage"), CalendarEventController_1.CalendarEventController.deleteEvent);
// Hierarchy routes
router.get("/hierarchy", auth_1.authMiddleware, HierarchyController_1.HierarchyController.getHierarchy);
router.put("/hierarchy", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("hierarchy.manage"), HierarchyController_1.HierarchyController.saveHierarchy);
// Project schedule (Gantt) routes — full replace on save
router.get("/projects/:projectId/schedule", auth_1.authMiddleware, scheduleController.getSchedule);
router.put("/projects/:projectId/schedule", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.schedule"), scheduleController.saveSchedule);
// Date conversion is now handled on the frontend; server routes removed.
exports.default = router;
//# sourceMappingURL=routes.js.map