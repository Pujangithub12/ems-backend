"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleService = void 0;
const prisma_1 = require("../config/prisma");
const schedule_dto_1 = require("../dto/schedule.dto");
function toProjectId(projectId) {
    const n = Number(projectId);
    if (!Number.isInteger(n) || n <= 0) {
        throw new schedule_dto_1.ValidationError("Invalid project id.");
    }
    return n;
}
/** TypeORM's `type: "date"` columns read back as a plain "YYYY-MM-DD" string;
 * Prisma always returns a Date object for @db.Date columns, so this
 * reformats it back to the same string shape the frontend has always received. */
function formatDate(d) {
    return d ? d.toISOString().slice(0, 10) : null;
}
function toDto(row) {
    return {
        id: row.taskId,
        taskName: row.taskName,
        duration: row.duration ?? null,
        startDate: formatDate(row.startDate),
        parentId: row.parentId ?? null,
        predecessorId: row.predecessorId ?? null,
        progress: row.progress ?? null,
        status: row.status ?? "pending",
    };
}
class ScheduleService {
    /** Returns the saved schedule rows for a project, in their saved order. */
    async getSchedule(projectId) {
        const numericProjectId = toProjectId(projectId);
        const rows = await prisma_1.prisma.scheduleTask.findMany({
            where: { projectId: numericProjectId },
            orderBy: { orderIndex: "asc" },
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
        const saved = await prisma_1.prisma.$transaction(async (tx) => {
            await tx.scheduleTask.deleteMany({ where: { projectId: numericProjectId } });
            if (tasks.length === 0) {
                return [];
            }
            const rows = [];
            for (const [index, task] of tasks.entries()) {
                const row = await tx.scheduleTask.create({
                    data: {
                        projectId: numericProjectId,
                        taskId: task.id,
                        taskName: task.taskName,
                        duration: task.duration,
                        startDate: task.startDate,
                        parentId: task.parentId,
                        predecessorId: task.predecessorId,
                        progress: task.progress,
                        status: task.status,
                        orderIndex: index,
                    },
                });
                rows.push(row);
            }
            return rows;
        });
        return saved
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map(toDto);
    }
}
exports.ScheduleService = ScheduleService;
//# sourceMappingURL=schedule.service.js.map