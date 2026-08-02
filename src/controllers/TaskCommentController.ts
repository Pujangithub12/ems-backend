import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { AddCommentDto, AddFeedbackDto } from "../dto/task-comment.dto";

// `author` was an eager relation on TaskComment/SubTaskComment under TypeORM
// (always populated regardless of the `relations` option), so every
// TypeORM `find`/`findOne` implicitly returned it too. Prisma has no eager
// relations — every place below that needs `.author` in the response now
// explicitly `include`s it (or attaches an already-loaded `user`) before
// this helper trims it down to the public fields.
const sanitizeAuthor = (comment: any) => {
  if (comment.author) {
    const { id, fullName, email } = comment.author;
    comment.author = { id, fullName, email };
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
      const task = await prisma.task.findUnique({
        where: { id: parseInt(taskId as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      // Only the assigner (creator) and the assignees may view/comment on a task.
      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.userId === user.id,
      );
      const isCreator = task.createdById === user.id;
      if (!isAssigned && !isCreator && req.user?.role !== "super_admin")
        return res.status(403).json({ message: "Forbidden" });

      const created = await prisma.taskComment.create({
        data: { commentText, authorId: user.id, taskId: task.id },
      });
      const comment: any = { ...created, author: user };
      sanitizeAuthor(comment);

      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getTaskComments = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;

    try {
      const task = await prisma.task.findUnique({
        where: { id: parseInt(taskId as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      // Only the assigner (creator) and the assignees may view a task's comments.
      if (req.user?.role !== "super_admin") {
        const isAssigned = task.assignedUsers.some(
          (assigned) => assigned.userId === req.user?.id,
        );
        const isCreator = task.createdById === req.user?.id;
        if (!isAssigned && !isCreator)
          return res.status(403).json({ message: "Forbidden" });
      }

      const comments = await prisma.taskComment.findMany({
        where: { taskId: task.id },
        include: { author: true },
        orderBy: { createdAt: "asc" },
      });
      comments.forEach(sanitizeAuthor);

      return res.status(200).json(comments);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static addFeedback = async (req: Request, res: Response) => {
    const { taskId, commentId } = req.params;
    const { feedback }: AddFeedbackDto = req.body;

    if (!feedback)
      return res.status(400).json({ message: "Feedback is required" });

    try {
      const comment = await prisma.taskComment.findUnique({
        where: { id: parseInt(commentId as string) },
        include: { author: true },
      });

      if (!comment || comment.taskId !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Comment not found" });
      }

      const updated = await prisma.taskComment.update({
        where: { id: comment.id },
        data: { feedback },
      });
      const responseComment: any = { ...updated, author: comment.author };
      sanitizeAuthor(responseComment);

      return res
        .status(200)
        .json({ message: "Feedback added", comment: responseComment });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
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
      const task = await prisma.task.findUnique({
        where: { id: parseInt(taskId as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const subTask = await prisma.subTask.findFirst({
        where: {
          id: parseInt(subtaskId as string),
          taskId: parseInt(taskId as string),
        },
      });

      if (!subTask)
        return res.status(404).json({ message: "Subtask not found" });

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.userId === user.id,
      );
      // Writing a subtask update is the assignee's job — the assigner reviews
      // it and gives feedback instead (see addSubTaskFeedback below).
      if (!isAssigned && req.user?.role !== "super_admin")
        return res.status(403).json({ message: "Forbidden" });

      const created = await prisma.subTaskComment.create({
        data: { commentText, authorId: user.id, subTaskId: subTask.id },
      });
      const comment: any = { ...created, author: user };
      sanitizeAuthor(comment);

      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getSubTaskComments = async (req: AuthRequest, res: Response) => {
    console.log("=== getSubTaskComments CALLED ===");
    console.log("Params:", req.params);
    const { taskId, subtaskId } = req.params;

    try {
      const task = await prisma.task.findUnique({
        where: { id: parseInt(taskId as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const subTask = await prisma.subTask.findFirst({
        where: {
          id: parseInt(subtaskId as string),
          taskId: parseInt(taskId as string),
        },
      });

      if (!subTask)
        return res.status(404).json({ message: "Subtask not found" });

      // Viewable by the assignee (who wrote the update) and the assigner (who
      // reviews it and gives feedback), plus super_admin as a fallback.
      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.userId === req.user?.id,
      );
      const isAssigner = task.createdById === req.user?.id;
      if (!isAssigned && !isAssigner && req.user?.role !== "super_admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const comments = await prisma.subTaskComment.findMany({
        where: { subTaskId: subTask.id },
        include: { author: true },
        orderBy: { createdAt: "asc" },
      });
      comments.forEach(sanitizeAuthor);

      return res.status(200).json(comments);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static addSubTaskFeedback = async (req: AuthRequest, res: Response) => {
    const { taskId, subtaskId, commentId } = req.params;
    const { feedback }: AddFeedbackDto = req.body;

    if (!feedback)
      return res.status(400).json({ message: "Feedback is required" });

    try {
      const comment = await prisma.subTaskComment.findUnique({
        where: { id: parseInt(commentId as string) },
        include: {
          author: true,
          subTask: { include: { task: { include: { createdBy: true } } } },
        },
      });

      if (
        !comment ||
        comment.subTaskId !== parseInt(subtaskId as string) ||
        comment.subTask?.taskId !== parseInt(taskId as string)
      ) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Only the person who assigned this task may give feedback on the
      // assignee's update — a super_admin can too, as a fallback in case the
      // original assigner's account was removed.
      const isAssigner = comment.subTask?.task?.createdById === req.user?.id;
      if (!isAssigner && req.user?.role !== "super_admin")
        return res.status(403).json({ message: "Forbidden" });

      const updated = await prisma.subTaskComment.update({
        where: { id: comment.id },
        data: { feedback },
      });
      const responseComment: any = { ...updated, author: comment.author };
      sanitizeAuthor(responseComment);

      return res
        .status(200)
        .json({ message: "Feedback added", comment: responseComment });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
