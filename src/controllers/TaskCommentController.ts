import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { SubTask } from "../entities/SubTask";
import { TaskComment } from "../entities/TaskComment";
import { SubTaskComment } from "../entities/SubTaskComment";
import { User } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";
import { AddCommentDto, AddFeedbackDto } from "../dto/task-comment.dto";

// `author` is an eager relation on TaskComment/SubTaskComment, so it is always
// populated (and includes the password hash) regardless of the `relations`
// option passed to the query — strip it before sending comments to the client.
const sanitizeAuthor = (comment: TaskComment | SubTaskComment) => {
  if (comment.author) {
    const { id, fullName, email } = comment.author;
    comment.author = { id, fullName, email } as User;
  }
};

/** Comments and admin feedback for both tasks and subtasks. */
export class TaskCommentController {
  static addComment = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    const { commentText }: AddCommentDto = req.body;

    if (!commentText)
      return res.status(400).json({ message: "Comment text is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const commentRepository = AppDataSource.getRepository(TaskComment);
      const userRepository = AppDataSource.getRepository(User);
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) return res.status(404).json({ message: "User not found" });

      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.id === user.id,
      );
      if (
        !isAssigned &&
        req.user?.role !== "admin" &&
        req.user?.role !== "super_admin"
      )
        return res.status(403).json({ message: "Forbidden" });

      const comment = commentRepository.create({
        commentText,
        author: user,
        task,
      });
      await commentRepository.save(comment);
      sanitizeAuthor(comment);

      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTaskComments = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        const isAssigned = task.assignedUsers.some(
          (assigned) => assigned.id === req.user?.id,
        );
        if (!isAssigned) return res.status(403).json({ message: "Forbidden" });
      }

      const commentRepository = AppDataSource.getRepository(TaskComment);
      const comments = await commentRepository.find({
        where: { task: { id: task.id } },
        relations: ["author"],
        order: { createdAt: "ASC" },
      });
      comments.forEach(sanitizeAuthor);

      return res.status(200).json(comments);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addFeedback = async (req: Request, res: Response) => {
    const { taskId, commentId } = req.params;
    const { feedback }: AddFeedbackDto = req.body;

    if (!feedback)
      return res.status(400).json({ message: "Feedback is required" });

    try {
      const commentRepository = AppDataSource.getRepository(TaskComment);
      const comment = await commentRepository.findOne({
        where: { id: parseInt(commentId as string) },
        relations: ["task"],
      });

      if (!comment || comment.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Comment not found" });
      }

      comment.feedback = feedback;
      await commentRepository.save(comment);
      sanitizeAuthor(comment);

      return res.status(200).json({ message: "Feedback added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addSubTaskComment = async (req: AuthRequest, res: Response) => {
    console.log("=== addSubTaskComment CALLED ===");
    console.log("Params:", req.params);
    const { taskId, subtaskId } = req.params;
    const { commentText }: AddCommentDto = req.body;

    if (!commentText)
      return res.status(400).json({ message: "Comment text is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const commentRepository = AppDataSource.getRepository(SubTaskComment);
      const userRepository = AppDataSource.getRepository(User);

      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const subTask = await subTaskRepository.findOne({
        where: {
          id: parseInt(subtaskId as string),
          task: { id: parseInt(taskId as string) },
        },
      });

      if (!subTask)
        return res.status(404).json({ message: "Subtask not found" });

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) return res.status(404).json({ message: "User not found" });

      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.id === user.id,
      );
      // Writing a subtask update is the assignee's job — the assigner reviews
      // it and gives feedback instead (see addSubTaskFeedback below).
      if (!isAssigned && req.user?.role !== "super_admin")
        return res.status(403).json({ message: "Forbidden" });

      const comment = commentRepository.create({
        commentText,
        author: user,
        subTask,
      });
      await commentRepository.save(comment);
      sanitizeAuthor(comment);

      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getSubTaskComments = async (req: AuthRequest, res: Response) => {
    console.log("=== getSubTaskComments CALLED ===");
    console.log("Params:", req.params);
    const { taskId, subtaskId } = req.params;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const commentRepository = AppDataSource.getRepository(SubTaskComment);

      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers", "createdBy"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const subTask = await subTaskRepository.findOne({
        where: {
          id: parseInt(subtaskId as string),
          task: { id: parseInt(taskId as string) },
        },
      });

      if (!subTask)
        return res.status(404).json({ message: "Subtask not found" });

      // Viewable by the assignee (who wrote the update) and the assigner (who
      // reviews it and gives feedback), plus super_admin as a fallback.
      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.id === req.user?.id,
      );
      const isAssigner = task.createdBy?.id === req.user?.id;
      if (!isAssigned && !isAssigner && req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const comments = await commentRepository.find({
        where: { subTask: { id: subTask.id } },
        relations: ["author"],
        order: { createdAt: "ASC" },
      });
      comments.forEach(sanitizeAuthor);

      return res.status(200).json(comments);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addSubTaskFeedback = async (req: AuthRequest, res: Response) => {
    const { taskId, subtaskId, commentId } = req.params;
    const { feedback }: AddFeedbackDto = req.body;

    if (!feedback)
      return res.status(400).json({ message: "Feedback is required" });

    try {
      const commentRepository = AppDataSource.getRepository(SubTaskComment);
      const comment = await commentRepository.findOne({
        where: { id: parseInt(commentId as string) },
        relations: ["subTask", "subTask.task", "subTask.task.createdBy"],
      });

      if (
        !comment ||
        comment.subTask.id !== parseInt(subtaskId as string) ||
        comment.subTask.task.id !== parseInt(taskId as string)
      ) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Only the person who assigned this task may give feedback on the
      // assignee's update — a super_admin can too, as a fallback in case the
      // original assigner's account was removed.
      const isAssigner = comment.subTask.task.createdBy?.id === req.user?.id;
      if (!isAssigner && req.user?.role !== "super_admin")
        return res.status(403).json({ message: "Forbidden" });

      comment.feedback = feedback;
      await commentRepository.save(comment);
      sanitizeAuthor(comment);

      return res.status(200).json({ message: "Feedback added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
