import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { UserController } from "../controllers/UserController";
import { AnnouncementController } from "../controllers/AnnouncementController";
import { ProjectController } from "../controllers/ProjectController";
import { TaskController } from "../controllers/TaskController";
import { MyTaskController } from "../controllers/MyTaskController";
import { LeaveRequestController } from "../controllers/LeaveRequestController";
import { authMiddleware, roleMiddleware } from "../middlewares/auth";
import { UserRole } from "../entities/User";

const router = Router();

// Auth routes
router.post("/login", AuthController.login);

// User routes - Admin only for adding and deleting users
router.post(
  "/users",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  UserController.addUser,
);
router.get("/users", authMiddleware, UserController.getAllUsers);
router.delete(
  "/users/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  UserController.deleteUser,
);
router.put(
  "/users/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  UserController.updateUser,
);

// Announcement routes - Admin only for creating and deleting
router.post(
  "/announcements",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  AnnouncementController.createAnnouncement,
);
router.get(
  "/announcements",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  AnnouncementController.getHistory,
);
router.delete(
  "/announcements/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  AnnouncementController.deleteAnnouncement,
);

// Project routes
router.post(
  "/projects",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.createProject,
);
router.get("/projects", authMiddleware, ProjectController.getAllProjects);
router.get("/projects/:id", authMiddleware, ProjectController.getProjectById);
router.put(
  "/projects/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.updateProject,
);
router.delete(
  "/projects/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.deleteProject,
);

// Project task routes
router.post(
  "/projects/:projectId/tasks",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.addProjectTask,
);
router.put(
  "/projects/tasks/:taskId",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.updateProjectTask,
);
router.delete(
  "/projects/tasks/:taskId",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
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
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.addProjectHeading,
);

// Project file routes
router.post(
  "/projects/:projectId/files",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.addProjectFile,
);
router.delete(
  "/projects/files/:fileId",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  ProjectController.deleteProjectFile,
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
  roleMiddleware([UserRole.ADMIN]),
  TaskController.createTask,
);
router.get("/tasks", authMiddleware, TaskController.getAllTasks);
router.get("/tasks/:id", authMiddleware, TaskController.getTaskById);
router.get("/dashboard", authMiddleware, TaskController.getDashboard);
router.put(
  "/tasks/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
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
  roleMiddleware([UserRole.ADMIN]),
  TaskController.deleteTask,
);

// Subtask routes
router.post(
  "/tasks/:taskId/subtasks",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  TaskController.addSubTask,
);
router.put(
  "/tasks/:taskId/subtasks/:subtaskId",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  TaskController.updateSubTask,
);

// Comment routes
router.post(
  "/tasks/:taskId/comments",
  authMiddleware,
  TaskController.addComment,
);
router.get(
  "/tasks/:taskId/comments",
  authMiddleware,
  TaskController.getTaskComments,
);
router.put(
  "/tasks/:taskId/comments/:commentId/feedback",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  TaskController.addFeedback,
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
  "/leaverequest/:id",
  authMiddleware,
  LeaveRequestController.updateLeaveRequest,
);

router.delete(
  "/leaverequest/:id",
  authMiddleware,
  roleMiddleware([UserRole.ADMIN]),
  LeaveRequestController.deleteLeaveRequest,
);

// Date conversion is now handled on the frontend; server routes removed.

export default router;
