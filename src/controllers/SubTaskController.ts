import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { TaskStatus, UserRole } from "../entities/TaskEnums";
import { User } from "../entities/User";
import { SubTask } from "../entities/SubTask";
import { SubTaskComment } from "../entities/SubTaskComment";
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
    const { title, parentSubTaskId }: AddSubTaskDto = req.body;

    if (!title)
      return res.status(400).json({ message: "Subtask title is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((user) => user.id === userId);

      if (
        !isAssigned &&
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        return res
          .status(403)
          .json({ message: "Forbidden: You are not assigned to this task." });
      }

      const subTaskPayload: Partial<SubTask> = { title, task };

      if (parentSubTaskId) {
        const parentSubTask = await subTaskRepository.findOneBy({
          id: parseInt(parentSubTaskId as string),
        });
        if (!parentSubTask)
          return res.status(404).json({ message: "Parent subtask not found" });
        subTaskPayload.parent = parentSubTask;
      }

      const subTask = subTaskRepository.create(subTaskPayload);
      await subTaskRepository.save(subTask);

      const allSubTasks = await fetchSubTasksForTask(task.id);
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      await taskRepository.update(task.id, { progress: avg });

      return res.status(201).json({
        message: "Subtask added",
        subTask,
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      console.error("Add SubTask Error:", error);
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateSubTask = async (req: AuthRequest, res: Response) => {
    const { taskId, subtaskId } = req.params;
    const { title: updateText, status, progress }: UpdateSubTaskDto = req.body;

    console.log("=== updateSubTask called ===", {
      taskId,
      subtaskId,
      updateText,
      progress,
    });

    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const userRepository = AppDataSource.getRepository(User);
      const subTaskCommentRepository =
        AppDataSource.getRepository(SubTaskComment);
      const subTask = await subTaskRepository.findOne({
        where: { id: parseInt(subtaskId as string) },
        relations: ["task"],
      });

      if (!subTask || subTask.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) return res.status(404).json({ message: "User not found" });

      // Capture old progress for history
      const oldProgress = subTask.progress ?? 0;

      // Only update status and progress, NOT the original title
      if (status && Object.values(TaskStatus).includes(status as TaskStatus)) {
        subTask.status = status as TaskStatus;
      }
      if (progress !== undefined) {
        subTask.progress = parseInt(progress as string);
      }

      // Add current state to history with the update text
      const history = subTask.history || [];
      history.unshift({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        title: updateText || `Progress updated to ${progress}%`,
        progress: parseInt(progress as string) || oldProgress,
        authorId: user.id,
        authorName: user.fullName,
      });

      // Keep only the last 10 updates to prevent database bloat
      subTask.history = history.slice(0, 10);

      // Save the subtask
      await subTaskRepository.save(subTask);

      // Create a SubTaskComment for this update so admin can give feedback
      if (updateText) {
        const newComment = subTaskCommentRepository.create({
          commentText: updateText,
          author: user,
          subTask: subTask,
        });
        await subTaskCommentRepository.save(newComment);
      }

      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      const taskRepository = AppDataSource.getRepository(Task);
      await taskRepository.update(parseInt(taskId as string), {
        progress: avg,
      });

      return res.status(200).json({
        message: "Subtask updated",
        subTask,
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteSubTask = async (req: Request, res: Response) => {
    const { taskId, subtaskId } = req.params;
    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const subTask = await subTaskRepository.findOne({
        where: { id: parseInt(subtaskId as string) },
        relations: ["task"],
      });

      if (!subTask || subTask.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      await subTaskRepository.remove(subTask);

      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      const taskRepository = AppDataSource.getRepository(Task);
      await taskRepository.update(parseInt(taskId as string), {
        progress: avg,
      });

      return res.status(200).json({
        message: "Subtask deleted successfully",
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getSubTasks = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    try {
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
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
