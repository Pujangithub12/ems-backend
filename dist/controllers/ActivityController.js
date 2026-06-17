"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityController = void 0;
const data_source_1 = require("../config/data-source");
const Activity_1 = require("../entities/Activity");
class ActivityController {
    // Get all activities (admin can see all, users see their own or related to tasks they're assigned to?)
    // For now, let's fetch all and handle filtering later
    static getAllActivities = async (req, res) => {
        try {
            const activityRepository = data_source_1.AppDataSource.getRepository(Activity_1.Activity);
            const activities = await activityRepository.find({
                relations: ["user", "task"],
                order: { createdAt: "DESC" },
            });
            return res.status(200).json(activities);
        }
        catch (error) {
            return res
                .status(500)
                .json({ message: "Internal server error", error });
        }
    };
    // Helper function to log activities, to be used from other controllers
    static logActivity = async (type, description, taskId, userId) => {
        try {
            const activityRepository = data_source_1.AppDataSource.getRepository(Activity_1.Activity);
            const activityData = {
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
        }
        catch (error) {
            console.error("Failed to log activity:", error);
        }
    };
}
exports.ActivityController = ActivityController;
//# sourceMappingURL=ActivityController.js.map