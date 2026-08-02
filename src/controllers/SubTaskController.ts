import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { TaskStatus, UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import {
  buildSubTaskTree,
  computeAverageLeafProgress,
  fetchSubTasksForTask,
} from "../utils/subtaskTree";
import { AddSubTaskDto, UpdateSubTaskDto } from "../dto/subtask.dto";

export class SubTaskController {
  static addSubTask = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    const { title, parentSubTaskId, estimatedDays }: AddSubTaskDto = req.body;

    if (!title)
      return res.status(400).json({ message: "Subtask title is required" });

    let parsedEstimatedDays: number | undefined;
    if (estimatedDays !== undefined && estimatedDays !== null && estimatedDays !== "") {
      const n = Number(estimatedDays);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ message: "Estimated days must be a non-negative number" });
      }
      parsedEstimatedDays = n;
    }

    try {
      const task = await prisma.task.findUnique({
        where: { id: parseInt(taskId as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((a) => a.userId === userId);
      const isCreator = task.createdById === userId;

      if (
        !isAssigned &&
        !isCreator &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        return res
          .status(403)
          .json({ message: "Forbidden: You are not assigned to this task." });
      }

      let parentId: number | undefined;
      if (parentSubTaskId) {
        const parentSubTask = await prisma.subTask.findUnique({
          where: { id: parseInt(parentSubTaskId as string) },
        });
        if (!parentSubTask)
          return res.status(404).json({ message: "Parent subtask not found" });
        parentId = parentSubTask.id;
      }

      const subTask = await prisma.subTask.create({
        data: {
          title,
          taskId: task.id,
          ...(parsedEstimatedDays !== undefined ? { estimatedDays: parsedEstimatedDays } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
        },
      });

      const allSubTasks = await fetchSubTasksForTask(task.id);
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      await prisma.task.update({ where: { id: task.id }, data: { progress: avg } });

      return res.status(201).json({
        message: "Subtask added",
        subTask,
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      console.error("Add SubTask Error:", error);
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateSubTask = async (req: AuthRequest, res: Response) => {
    const { taskId, subtaskId } = req.params;
    const { title: updateText, name, status, progress, estimatedDays }: UpdateSubTaskDto = req.body;

    console.log("=== updateSubTask called ===", {
      taskId,
      subtaskId,
      updateText,
      progress,
    });

    try {
      const subTask = await prisma.subTask.findUnique({
        where: { id: parseInt(subtaskId as string) },
      });

      if (!subTask || subTask.taskId !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      // Capture old progress for history
      const oldProgress = subTask.progress ?? 0;

      const data: any = {};

      // `name` renames the subtask itself; `title` above is a different
      // thing — the free-text note for this particular progress update,
      // logged into history/comments rather than persisted on the subtask.
      if (typeof name === "string") {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return res.status(400).json({ message: "Sub-task name cannot be empty" });
        }
        data.title = trimmedName;
      }
      if (status && Object.values(TaskStatus).includes(status as TaskStatus)) {
        data.status = status as TaskStatus;
      }
      if (progress !== undefined) {
        data.progress = parseInt(progress as string);
      }
      if (estimatedDays !== undefined && estimatedDays !== null && estimatedDays !== "") {
        const n = Number(estimatedDays);
        if (Number.isNaN(n) || n < 0) {
          return res.status(400).json({ message: "Estimated days must be a non-negative number" });
        }
        data.estimatedDays = n;
      }

      // Add current state to history with the update text
      const history = subTask.history ? JSON.parse(subTask.history) : [];
      history.unshift({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        title: updateText || `Progress updated to ${progress}%`,
        progress: parseInt(progress as string) || oldProgress,
        authorId: user.id,
        authorName: user.fullName,
      });

      // Keep only the last 10 updates to prevent database bloat
      data.history = JSON.stringify(history.slice(0, 10));

      // Save the subtask
      const updated = await prisma.subTask.update({ where: { id: subTask.id }, data });

      // Create a SubTaskComment for this update so admin can give feedback
      if (updateText) {
        await prisma.subTaskComment.create({
          data: {
            commentText: updateText,
            authorId: user.id,
            subTaskId: subTask.id,
          },
        });
      }

      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      await prisma.task.update({
        where: { id: parseInt(taskId as string) },
        data: { progress: avg },
      });

      return res.status(200).json({
        message: "Subtask updated",
        subTask: { ...updated, history: JSON.parse(updated.history || "[]") },
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static deleteSubTask = async (req: Request, res: Response) => {
    const { taskId, subtaskId } = req.params;
    try {
      const subTask = await prisma.subTask.findUnique({
        where: { id: parseInt(subtaskId as string) },
      });

      if (!subTask || subTask.taskId !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      await prisma.subTask.delete({ where: { id: subTask.id } });

      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      await prisma.task.update({
        where: { id: parseInt(taskId as string) },
        data: { progress: avg },
      });

      return res.status(200).json({
        message: "Subtask deleted successfully",
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getSubTasks = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    try {
      const task = await prisma.task.findUnique({
        where: { id: parseInt(taskId as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (req.user?.role !== UserRole.SUPER_ADMIN) {
        // Only the assigner (creator) and the assignees may view a task's subtasks.
        const isAssigned = task.assignedUsers.some(
          (a) => a.userId === req.user?.id,
        );
        const isCreator = task.createdById === req.user?.id;
        if (!isAssigned && !isCreator)
          return res.status(403).json({ message: "Forbidden" });
      }

      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      console.log(
        "Raw subtasks from DB:",
        JSON.stringify(
          allSubTasks.map((st) => ({
            id: st.id,
            history: st.history,
            progress: st.progress,
          })),
        ),
      );
      const tree = buildSubTaskTree(allSubTasks);
      return res.status(200).json(tree);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
