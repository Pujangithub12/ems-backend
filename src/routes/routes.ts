import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { WorkspaceController } from "../controllers/WorkspaceController";
import { UserController } from "../controllers/UserController";
import { AnnouncementController } from "../controllers/AnnouncementController";
import { ProjectController } from "../controllers/ProjectController";
import { ProjectFileController } from "../controllers/ProjectFileController";
import { MyTaskController } from "../controllers/MyTaskController";
import { TaskController } from "../controllers/TaskController";
import { DashboardController } from "../controllers/DashboardController";
import { SubTaskController } from "../controllers/SubTaskController";
import { TaskCommentController } from "../controllers/TaskCommentController";
import { LeaveRequestController } from "../controllers/LeaveRequestController";
import { CalendarEventController } from "../controllers/CalendarEventController";
import { ActivityController } from "../controllers/ActivityController";
import { HierarchyController } from "../controllers/HierarchyController";
import { ScheduleController } from "../controllers/ScheduleController";
import { ScheduleService } from "../services/schedule.service";
import { PermissionController } from "../controllers/PermissionController";
import { authMiddleware, roleMiddleware, permissionMiddleware } from "../middlewares/auth";
import { upload, uploadProjectFile } from "../middlewares/upload";
import { UserRole } from "../entities/User";

const router = Router();

const scheduleController = new ScheduleController(new ScheduleService());

// Auth routes
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

// Permission routes — matrix is viewable by anyone, but only a super admin
// can edit it (hardcoded, not itself a toggleable permission).
router.get("/permissions", authMiddleware, PermissionController.getMatrix);
router.put(
  "/permissions",
  authMiddleware,
  roleMiddleware([UserRole.SUPER_ADMIN]),
  PermissionController.updateMatrix,
);

// User routes - Admin only for adding and deleting users
router.post(
  "/users",
  authMiddleware,
  permissionMiddleware("members.manage"),
  UserController.addUser,
);
router.get("/users", authMiddleware, UserController.getAllUsers);
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
