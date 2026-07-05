import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { SubTask } from "../entities/SubTask";
import { TaskComment } from "../entities/TaskComment";
import { SubTaskComment } from "../entities/SubTaskComment";
import { User } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";
import { AddCommentDto, AddFeedbackDto } from "../dto/task-comment.dto";

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
      if (
        !isAssigned &&
        req.user?.role !== "admin" &&
        req.user?.role !== "super_admin"
      )
        return res.status(403).json({ message: "Forbidden" });

      const comment = commentRepository.create({
        commentText,
        author: user,
        subTask,
      });
      await commentRepository.save(comment);

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

      if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        const isAssigned = task.assignedUsers.some(
          (assigned) => assigned.id === req.user?.id,
        );
        if (!isAssigned) return res.status(403).json({ message: "Forbidden" });
      }

      const comments = await commentRepository.find({
        where: { subTask: { id: subTask.id } },
        relations: ["author"],
        order: { createdAt: "ASC" },
      });

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
        relations: ["subTask", "subTask.task", "subTask.task.assignedUsers"],
      });

      if (
        !comment ||
        comment.subTask.id !== parseInt(subtaskId as string) ||
        comment.subTask.task.id !== parseInt(taskId as string)
      ) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Only allow admin/super_admin to add feedback
      if (req.user?.role !== "admin" && req.user?.role !== "super_admin")
        return res.status(403).json({ message: "Forbidden" });

      comment.feedback = feedback;
      await commentRepository.save(comment);

      return res.status(200).json({ message: "Feedback added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
