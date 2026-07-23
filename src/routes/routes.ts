import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { WorkspaceController } from "../controllers/WorkspaceController";
import { UserController } from "../controllers/UserController";
import { InviteController } from "../controllers/InviteController";
import { AnnouncementController } from "../controllers/AnnouncementController";
import { ProjectController } from "../controllers/ProjectController";
import { ProjectFileController } from "../controllers/ProjectFileController";
import { ProcurementController } from "../controllers/ProcurementController";
import { MonthlyPerformanceController } from "../controllers/MonthlyPerformanceController";
import { InventoryController } from "../controllers/InventoryController";
import { WorkspaceFileController } from "../controllers/WorkspaceFileController";
import { MyTaskController } from "../controllers/MyTaskController";
import { TaskController } from "../controllers/TaskController";
import { DashboardController } from "../controllers/DashboardController";
import { SubTaskController } from "../controllers/SubTaskController";
import { TaskCommentController } from "../controllers/TaskCommentController";
import { LeaveRequestController } from "../controllers/LeaveRequestController";
import { SiteVisitRequestController } from "../controllers/SiteVisitRequestController";
import { ExpenseRequestController } from "../controllers/ExpenseRequestController";
import { CalendarEventController } from "../controllers/CalendarEventController";
import { ActivityController } from "../controllers/ActivityController";
import { HierarchyController } from "../controllers/HierarchyController";
import { ScheduleController } from "../controllers/ScheduleController";
import { ScheduleService } from "../services/schedule.service";
import { PermissionController } from "../controllers/PermissionController";
import { ReportsController } from "../controllers/ReportsController";
import { CatalogItemController } from "../controllers/CatalogItemController";
import { authMiddleware, roleMiddleware, permissionMiddleware, anyPermissionMiddleware } from "../middlewares/auth";
import {
  upload,
  uploadProjectFile,
  uploadWorkspaceFile,
  uploadInventoryFile,
  uploadProcurementFile,
} from "../middlewares/upload";
import { UserRole } from "../entities/User";

const router = Router();

const scheduleController = new ScheduleController(new ScheduleService());

// Auth routes
router.post("/register/start", AuthController.registerStart);
router.post("/register/verify", AuthController.registerVerify);
router.post("/forgot-password/start", AuthController.forgotPasswordStart);
router.post("/forgot-password/reset", AuthController.forgotPasswordReset);
router.post("/login", AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/me", authMiddleware, AuthController.getMe);
router.put("/me", authMiddleware, AuthController.updateMe);
router.put("/me/password", authMiddleware, AuthController.changePassword);
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Workspace routes
router.get("/workspaces", authMiddleware, WorkspaceController.getAll);
router.post("/workspaces", authMiddleware, WorkspaceController.create);
router.post("/workspaces/switch", authMiddleware, WorkspaceController.switch);
router.get(
  "/workspaces/current",
  authMiddleware,
  WorkspaceController.getCurrent,
);
router.put("/workspaces/:id", authMiddleware, WorkspaceController.update);
router.delete("/workspaces/:id", authMiddleware, WorkspaceController.remove);

// Cross-workspace member access matrix (Settings > Workspace tab) — lets a
// caller who belongs to more than one of their own workspaces manage which
// of those workspaces each employee can access, from one place.
router.get(
  "/workspaces/access-matrix",
  authMiddleware,
  permissionMiddleware("members.manage"),
  WorkspaceController.getAccessMatrix,
);
router.put(
  "/workspaces/:id/members/:userId",
  authMiddleware,
  permissionMiddleware("members.manage"),
  WorkspaceController.grantMemberAccess,
);
router.delete(
  "/workspaces/:id/members/:userId",
  authMiddleware,
  permissionMiddleware("members.manage"),
  WorkspaceController.revokeMemberAccess,
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
router.post(
  "/projects/:projectId/folders",
  authMiddleware,
  permissionMiddleware("projects.documents"),
  ProjectFileController.addProjectFolder,
);
router.post(
  "/projects/:projectId/files",
  authMiddleware,
  permissionMiddleware("projects.documents"),
  uploadProjectFile.single("file"),
  ProjectFileController.addProjectFile,
);
router.get(
  "/projects/files/:fileId/download",
  authMiddleware,
  ProjectFileController.downloadProjectFile,
);
router.put(
  "/projects/files/:fileId",
  authMiddleware,
  permissionMiddleware("projects.documents"),
  ProjectFileController.renameProjectFile,
);
router.delete(
  "/projects/files/:fileId",
  authMiddleware,
  permissionMiddleware("projects.documents"),
  ProjectFileController.deleteProjectFile,
);

// Project procurement routes (Procurement tab) — view is open to any workspace
// member with project access; add/edit/delete are admin-gated.
router.get(
  "/workspace/procurement",
  authMiddleware,
  ProcurementController.getWorkspaceProcurement,
);
router.get(
  "/projects/:projectId/procurement",
  authMiddleware,
  ProcurementController.getProcurementItems,
);
router.post(
  "/projects/:projectId/procurement",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProcurementController.addProcurementItem,
);
router.put(
  "/projects/procurement/:itemId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProcurementController.updateProcurementItem,
);
router.delete(
  "/projects/procurement/:itemId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProcurementController.deleteProcurementItem,
);
router.get(
  "/projects/procurement/:itemId/detail",
  authMiddleware,
  ProcurementController.getProcurementItemDetail,
);
router.post(
  "/projects/procurement/:itemId/attachments",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  uploadProcurementFile.single("file"),
  ProcurementController.addAttachment,
);
router.delete(
  "/projects/procurement/:itemId/attachments/:attachmentId",
  authMiddleware,
  permissionMiddleware("projects.procurement"),
  ProcurementController.deleteAttachment,
);

// Project energy performance routes (Energy Performance tab) — view is open to
// any workspace member with project access; upsert is admin-gated.
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

// Project inventory routes (Inventory tab) — view is open to any workspace
// member with project access; add/edit/delete are admin-gated.
router.get(
  "/workspace/inventory",
  authMiddleware,
  InventoryController.getWorkspaceInventory,
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
  uploadInventoryFile.single("file"),
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
  InventoryController.getWorkspacePendingTransfers,
);
router.get(
  "/workspace/inventory/transactions",
  authMiddleware,
  InventoryController.getWorkspaceInventoryTransactions,
);
router.get(
  "/workspace/warehouses",
  authMiddleware,
  InventoryController.getWorkspaceWarehouses,
);
router.post(
  "/workspace/warehouses",
  authMiddleware,
  permissionMiddleware("projects.inventory"),
  InventoryController.createWarehouse,
);
router.get(
  "/workspace/vendors",
  authMiddleware,
  InventoryController.getWorkspaceVendors,
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

// Shared item catalog (name + code) — keeps item naming consistent between
// the Inventory and Procurement "Add item" forms.
router.get("/workspace/items", authMiddleware, CatalogItemController.getWorkspaceItems);
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

// Workspace-level document routes (sidebar Documents page). Rename/download/delete
// reuse the same /projects/files/:fileId endpoints above — they resolve ownership
// via whichever of project/workspace is set on the row.
router.get(
  "/workspace/files",
  authMiddleware,
  WorkspaceFileController.getWorkspaceFiles,
);
router.post(
  "/workspace/folders",
  authMiddleware,
  permissionMiddleware("projects.documents"),
  WorkspaceFileController.addWorkspaceFolder,
);
router.post(
  "/workspace/files",
  authMiddleware,
  permissionMiddleware("projects.documents"),
  uploadWorkspaceFile.single("file"),
  WorkspaceFileController.addWorkspaceFile,
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
  upload.array("files"),
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
  upload.array("files"),
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

// Activity routes
router.get("/activities", authMiddleware, ActivityController.getAllActivities);

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
