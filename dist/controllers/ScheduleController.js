"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleController = void 0;
const schedule_dto_1 = require("../dto/schedule.dto");
// schedule endpoints (get/save) — schedule tab and task tab share the Task table (see schedule.service.ts)
class ScheduleController {
    scheduleService;
    constructor(scheduleService) {
        this.scheduleService = scheduleService;
    }
    getSchedule = async (req, res) => {
        const projectId = req.params.projectId;
        if (!projectId) {
            res.status(400).json({ message: "projectId is required." });
            return;
        }
        try {
            const { tasks, links } = await this.scheduleService.getSchedule(projectId, req.organization.id);
            res.json({ tasks, links });
        }
        catch (err) {
            if (err instanceof schedule_dto_1.ValidationError) {
                res.status(400).json({ message: err.message });
                return;
            }
            console.error("[schedule] getSchedule failed:", err);
            res.status(500).json({ message: "Failed to load schedule." });
        }
    };
    saveSchedule = async (req, res) => {
        const projectId = req.params.projectId;
        if (!projectId) {
            res.status(400).json({ message: "projectId is required." });
            return;
        }
        try {
            const tasks = (0, schedule_dto_1.validateScheduleTasks)(req.body?.tasks);
            const taskIds = new Set(tasks.map((task) => task.id));
            const links = (0, schedule_dto_1.validateScheduleLinks)(req.body?.links, taskIds);
            const saved = await this.scheduleService.saveSchedule(projectId, req.organization.id, req.user?.id ?? null, tasks, links);
            res.json({ tasks: saved.tasks, links: saved.links });
        }
        catch (err) {
            if (err instanceof schedule_dto_1.ValidationError) {
                res.status(400).json({ message: err.message });
                return;
            }
            console.error("[schedule] saveSchedule failed:", err);
            res.status(500).json({ message: "Failed to save schedule." });
        }
    };
}
exports.ScheduleController = ScheduleController;
//# sourceMappingURL=ScheduleController.js.map