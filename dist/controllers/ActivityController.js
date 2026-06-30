"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityController = void 0;
const data_source_1 = require("../config/data-source");
const Activity_1 = require("../entities/Activity");
class ActivityController {
    static getAllActivities = async (req, res) => {
        try {
            const activityRepository = data_source_1.AppDataSource.getRepository(Activity_1.Activity);
            const workspace = req.workspace;
            const activities = await activityRepository.find({
                where: { workspace: { id: workspace.id } },
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
    static logActivity = async (type, description, taskId, userId, workspace) => {
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
            if (workspace !== undefined) {
                activityData.workspace = workspace;
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