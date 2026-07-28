import { Response } from "express";
import { prisma } from "../config/prisma";
import { MyTaskStatus } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import { CreateMyTaskDto, UpdateMyTaskDto } from "../dto/my-task.dto";

export class MyTaskController {
  static createMyTask = async (req: AuthRequest, res: Response) => {
    const { title, description, dueDate }: CreateMyTaskDto = req.body;

    if (!title) {
      return res.status(400).json({ message: "Task title is required" });
    }

    try {
      const organization = req.organization!;

      const user = await prisma.user.findUnique({
        where: { id: req.user?.id as number },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const myTask = await prisma.myTask.create({
        data: {
          title,
          ...(description !== undefined ? { description } : {}),
          status: MyTaskStatus.PENDING,
          userId: user.id,
          organizationId: organization.id,
          ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        },
      });

      return res
        .status(201)
        .json({ message: "Personal task added", task: myTask });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getMyTasks = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const organization = req.organization!;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const tasks = await prisma.myTask.findMany({
        where: { userId, organizationId: organization.id },
        orderBy: { createdAt: "desc" },
      });

      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateMyTask = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, dueDate, status }: UpdateMyTaskDto = req.body;

    try {
      const organization = req.organization!;
      const myTask = await prisma.myTask.findFirst({
        where: {
          id: parseInt(id as string, 10),
          organizationId: organization.id,
        },
      });

      if (!myTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (myTask.userId !== req.user?.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const data: any = {};
      if (title !== undefined) data.title = title;
      if (description !== undefined) data.description = description;
      if (dueDate !== undefined) {
        data.dueDate = dueDate ? new Date(dueDate) : null;
      }
      if (
        status &&
        Object.values(MyTaskStatus).includes(status as MyTaskStatus)
      ) {
        data.status = status as MyTaskStatus;
      }

      const updated = await prisma.myTask.update({
        where: { id: myTask.id },
        data,
      });
      return res.status(200).json({ message: "Task updated", task: updated });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteMyTask = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      const organization = req.organization!;
      const myTask = await prisma.myTask.findFirst({
        where: {
          id: parseInt(id as string, 10),
          organizationId: organization.id,
        },
      });

      if (!myTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (myTask.userId !== req.user?.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await prisma.myTask.delete({ where: { id: myTask.id } });
      return res.status(200).json({ message: "Task deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
