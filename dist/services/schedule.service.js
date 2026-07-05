"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleService = void 0;
const data_source_1 = require("../config/data-source");
const ScheduleTask_1 = require("../entities/ScheduleTask");
const schedule_dto_1 = require("../dto/schedule.dto");
function toProjectId(projectId) {
    const n = Number(projectId);
    if (!Number.isInteger(n) || n <= 0) {
        throw new schedule_dto_1.ValidationError("Invalid project id.");
    }
    return n;
}
function toDto(row) {
    return {
        id: row.taskId,
        taskName: row.taskName,
        duration: row.duration ?? null,
        startDate: row.startDate ?? null,
        parentId: row.parentId ?? null,
        predecessorId: row.predecessorId ?? null,
    };
}
class ScheduleService {
    get repo() {
        return data_source_1.AppDataSource.getRepository(ScheduleTask_1.ScheduleTask);
    }
    /** Returns the saved schedule rows for a project, in their saved order. */
    async getSchedule(projectId) {
        const numericProjectId = toProjectId(projectId);
        const rows = await this.repo.find({
            where: { projectId: numericProjectId },
            order: { orderIndex: "ASC" },
        });
        return rows.map(toDto);
    }
    /**
     * Full replace: deletes whatever schedule previously existed for this
     * project and writes the new set of rows in the order provided. Runs
     * inside a transaction so a failed insert can't leave the project with a
     * half-deleted schedule.
     */
    async saveSchedule(projectId, tasks) {
        const numericProjectId = toProjectId(projectId);
        const saved = await data_source_1.AppDataSource.transaction(async (manager) => {
            const repo = manager.getRepository(ScheduleTask_1.ScheduleTask);
            await repo.delete({ projectId: numericProjectId });
            if (tasks.length === 0) {
                return [];
            }
            const entities = tasks.map((task, index) => repo.create({
                projectId: numericProjectId,
                taskId: task.id,
                taskName: task.taskName,
                duration: task.duration,
                startDate: task.startDate,
                parentId: task.parentId,
                predecessorId: task.predecessorId,
                orderIndex: index,
            }));
            return repo.save(entities);
        });
        return saved
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map(toDto);
    }
}
exports.ScheduleService = ScheduleService;
//# sourceMappingURL=schedule.service.js.map