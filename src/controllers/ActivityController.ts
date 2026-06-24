import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Activity, ActivityType } from "../entities/Activity";
import { AuthRequest } from "../middlewares/auth";

export class ActivityController {
  
  static getAllActivities = async (req: AuthRequest, res: Response) => {
    try {
      const activityRepository = AppDataSource.getRepository(Activity);
      const activities = await activityRepository.find({
        relations: ["user", "task"],
        order: { createdAt: "DESC" },
      });
      return res.status(200).json(activities);
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Internal server error", error });
    }
  };

  // Helper function to log activities, to be used from other controllers
  static logActivity = async (
    type: ActivityType,
    description: string,
    taskId?: number,
    userId?: number,
  ) => {
    try {
      const activityRepository = AppDataSource.getRepository(Activity);
      const activityData: any = {
        type,
        description,
      };
      
      if (taskId !== undefined) {
        activityData.taskId = taskId;
      }
      
      if (userId !== undefined) {
        activityData.userId = userId;
      }
      
      const activity = activityRepository.create(activityData);
      await activityRepository.save(activity);
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  };
}
