import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MyTask, MyTaskStatus } from "../entities/MyTask";
import { User } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";

export class MyTaskController {
  static createMyTask = async (req: AuthRequest, res: Response) => {
    const { title, description, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Task title is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const myTaskRepository = AppDataSource.getRepository(MyTask);

      const user = await userRepository.findOneBy({
        id: req.user?.id as number,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const taskPayload: Partial<MyTask> = {
        title,
        description,
        status: MyTaskStatus.PENDING,
        user,
      };

      if (dueDate) {
        taskPayload.dueDate = new Date(dueDate);
      }

      const myTask = myTaskRepository.create(taskPayload);
      await myTaskRepository.save(myTask);

      return res
        .status(201)
        .json({ message: "Personal task added", task: myTask });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getMyTasks = async (req: AuthRequest, res: Response) => {
    try {
      const myTaskRepository = AppDataSource.getRepository(MyTask);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const tasks = await myTaskRepository.find({
        where: { user: { id: userId } },
        order: { createdAt: "DESC" },
      });

      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateMyTask = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, dueDate, status } = req.body;

    try {
      const myTaskRepository = AppDataSource.getRepository(MyTask);
      const myTask = await myTaskRepository.findOne({
        where: { id: parseInt(id as string, 10) },
        relations: ["user"],
      });

      if (!myTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (myTask.user.id !== req.user?.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (title !== undefined) myTask.title = title;
      if (description !== undefined) myTask.description = description;
      if (dueDate !== undefined) {
        myTask.dueDate = dueDate ? new Date(dueDate) : null;
      }
      if (
        status &&
        Object.values(MyTaskStatus).includes(status as MyTaskStatus)
      ) {
        myTask.status = status as MyTaskStatus;
      }

      await myTaskRepository.save(myTask);
      return res.status(200).json({ message: "Task updated", task: myTask });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteMyTask = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      const myTaskRepository = AppDataSource.getRepository(MyTask);
      const myTask = await myTaskRepository.findOne({
        where: { id: parseInt(id as string, 10) },
        relations: ["user"],
      });

      if (!myTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (myTask.user.id !== req.user?.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await myTaskRepository.remove(myTask);
      return res.status(200).json({ message: "Task deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
