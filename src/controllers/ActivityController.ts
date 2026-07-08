import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Activity, ActivityType } from "../entities/Activity";
import { AuthRequest } from "../middlewares/auth";
import { Workspace } from "../entities/Workspace";

export class ActivityController {

  static getAllActivities = async (req: AuthRequest, res: Response) => {
    try {
      const activityRepository = AppDataSource.getRepository(Activity);
      const workspace = req.workspace!;
      const activities = await activityRepository.find({
        where: { workspace: { id: workspace.id } },
        relations: ["user", "task"],
        order: { createdAt: "DESC" },
      });
      // `relations: ["user"]` pulls the full User row — strip the password
      // hash before sending activities to the client.
      activities.forEach((a) => {
        if (a.user) {
          const { id, fullName, email } = a.user;
          a.user = { id, fullName, email } as any;
        }
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
    workspace?: Workspace,
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
      
      if (workspace !== undefined) {
        activityData.workspace = workspace;
      }
      
      const activity = activityRepository.create(activityData);
      await activityRepository.save(activity);
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  };
}
