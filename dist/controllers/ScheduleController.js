"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleController = void 0;
const schedule_dto_1 = require("../dto/schedule.dto");
// schedule endpoints (get/save) — full-replace persistence
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
            const tasks = await this.scheduleService.getSchedule(projectId);
            res.json({ tasks });
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
            const saved = await this.scheduleService.saveSchedule(projectId, tasks);
            res.json({ tasks: saved });
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