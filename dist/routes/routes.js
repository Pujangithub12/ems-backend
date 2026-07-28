"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuthController_1 = require("../controllers/AuthController");
const OrganizationController_1 = require("../controllers/OrganizationController");
const UserController_1 = require("../controllers/UserController");
const InviteController_1 = require("../controllers/InviteController");
const AnnouncementController_1 = require("../controllers/AnnouncementController");
const ProjectController_1 = require("../controllers/ProjectController");
const ProjectFileController_1 = require("../controllers/ProjectFileController");
const ProcurementController_1 = require("../controllers/ProcurementController");
const MonthlyPerformanceController_1 = require("../controllers/MonthlyPerformanceController");
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
const upload_1 = require("../middlewares/upload");
const enums_1 = require("../types/enums");
const router = (0, express_1.Router)();
const scheduleController = new ScheduleController_1.ScheduleController(new schedule_service_1.ScheduleService());
// Auth routes
router.post("/register/start", AuthController_1.AuthController.registerStart);
router.post("/register/verify", AuthController_1.AuthController.registerVerify);
router.post("/forgot-password/start", AuthController_1.AuthController.forgotPasswordStart);
router.post("/forgot-password/reset", AuthController_1.AuthController.forgotPasswordReset);
router.post("/login", AuthController_1.AuthController.login);
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
router.post("/projects/:projectId/files", auth_1.authMiddleware, upload_1.uploadProjectFile.single("file"), ProjectFileController_1.ProjectFileController.addProjectFile);
router.get("/projects/files/:fileId/download", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.downloadProjectFile);
router.put("/projects/files/:fileId", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.renameProjectFile);
router.delete("/projects/files/:fileId", auth_1.authMiddleware, ProjectFileController_1.ProjectFileController.deleteProjectFile);
// File/folder access management — who can read/write a given node. Deliberately
// admin/super_admin only (not gated by the broader "projects.documents"
// permission finance can also hold), since granting access is a narrower
// capability than just using Documents.
router.get("/projects/files/:fileId/access", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN]), ProjectFileController_1.ProjectFileController.getFileAccess);
router.put("/projects/files/:fileId/access", auth_1.authMiddleware, (0, auth_1.roleMiddleware)([enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN]), ProjectFileController_1.ProjectFileController.setFileAccess);
// Project procurement routes (Procurement tab) — view is open to any organization
// member with project access; add/edit/delete are admin-gated.
router.get("/workspace/procurement", auth_1.authMiddleware, ProcurementController_1.ProcurementController.getOrganizationProcurement);
router.get("/projects/:projectId/procurement", auth_1.authMiddleware, ProcurementController_1.ProcurementController.getProcurementItems);
router.post("/projects/:projectId/procurement", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProcurementController_1.ProcurementController.addProcurementItem);
router.put("/projects/procurement/:itemId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProcurementController_1.ProcurementController.updateProcurementItem);
router.delete("/projects/procurement/:itemId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProcurementController_1.ProcurementController.deleteProcurementItem);
router.get("/projects/procurement/:itemId/detail", auth_1.authMiddleware, ProcurementController_1.ProcurementController.getProcurementItemDetail);
router.post("/projects/procurement/:itemId/attachments", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), upload_1.uploadProcurementFile.single("file"), ProcurementController_1.ProcurementController.addAttachment);
router.delete("/projects/procurement/:itemId/attachments/:attachmentId", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.procurement"), ProcurementController_1.ProcurementController.deleteAttachment);
// Project energy performance routes (Energy Performance tab) — view is open to
// any organization member with project access; upsert is admin-gated.
router.get("/projects/:projectId/performance", auth_1.authMiddleware, MonthlyPerformanceController_1.MonthlyPerformanceController.getMonthlyPerformance);
router.put("/projects/:projectId/performance", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.performance"), MonthlyPerformanceController_1.MonthlyPerformanceController.upsertMonthlyPerformance);
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
router.post("/projects/inventory/:itemId/attachments", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("projects.inventory"), upload_1.uploadInventoryFile.single("file"), InventoryController_1.InventoryController.addAttachment);
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
router.post("/workspace/files", auth_1.authMiddleware, upload_1.uploadOrganizationFile.single("file"), OrganizationFileController_1.OrganizationFileController.addOrganizationFile);
// Personal task routes
router.post("/mytasks", auth_1.authMiddleware, MyTaskController_1.MyTaskController.createMyTask);
router.get("/mytasks", auth_1.authMiddleware, MyTaskController_1.MyTaskController.getMyTasks);
router.put("/mytasks/:id", auth_1.authMiddleware, MyTaskController_1.MyTaskController.updateMyTask);
router.delete("/mytasks/:id", auth_1.authMiddleware, MyTaskController_1.MyTaskController.deleteMyTask);
// Task routes
router.post("/tasks", auth_1.authMiddleware, 
// roleMiddleware([UserRole.ADMIN]),
upload_1.upload.array("files"), TaskController_1.TaskController.createTask);
router.get("/tasks", auth_1.authMiddleware, TaskController_1.TaskController.getAllTasks);
router.get("/tasks/:id", auth_1.authMiddleware, TaskController_1.TaskController.getTaskById);
router.get("/dashboard", auth_1.authMiddleware, DashboardController_1.DashboardController.getDashboard);
router.put("/tasks/:id/progress", auth_1.authMiddleware, TaskController_1.TaskController.updateTaskProgress);
router.put("/tasks/:id", auth_1.authMiddleware, (0, auth_1.permissionMiddleware)("tasks.edit"), upload_1.upload.array("files"), TaskController_1.TaskController.updateTask);
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