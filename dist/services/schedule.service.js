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
/** Task.id (a real, stable DB primary key) is serialized as a plain string at
 * the wire boundary — the Gantt/frontend code has always treated schedule row
 * ids as opaque strings (previously ScheduleTask's client-assigned WBS-style
 * ids), so this keeps that contract while the ids underneath are now real. */
function toDto(row) {
    return {
        id: String(row.id),
        taskName: row.title,
        duration: row.duration ?? null,
        startDate: formatDate(row.startDate),
        parentId: row.parentTaskId != null ? String(row.parentTaskId) : null,
        // Dead field on Task the same way it was on ScheduleTask — real
        // dependency data lives in TaskLink, surfaced via the top-level `links`.
        predecessorId: null,
        progress: row.progress,
        status: row.status,
    };
}
async function assertProjectInOrganization(projectId, organizationId) {
    const project = await prisma_1.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) {
        throw new schedule_dto_1.ValidationError("Project not found.");
    }
}
class ScheduleService {
    /** Returns every task for a project (the Gantt now represents the whole task tree, not just previously-scheduled rows) plus its dependency links, tasks in their saved order. */
    async getSchedule(projectId, organizationId) {
        const numericProjectId = toProjectId(projectId);
        await assertProjectInOrganization(numericProjectId, organizationId);
        const rows = await prisma_1.prisma.task.findMany({
            where: { projectId: numericProjectId },
            orderBy: { orderIndex: "asc" },
        });
        const linkRows = rows.length
            ? await prisma_1.prisma.taskLink.findMany({ where: { projectId: numericProjectId } })
            : [];
        const links = linkRows.map((link) => ({
            predecessorId: String(link.predecessorTaskId),
            successorId: String(link.successorTaskId),
            type: link.type,
            lag: link.lagDays,
        }));
        return { tasks: rows.map(toDto), links };
    }
    /**
     * Real diff against the shared `Task` table — NOT a full delete+recreate
     * (unlike the old ScheduleTask-only implementation this replaced). A Task
     * row also carries SubTasks/TaskComments/TaskAssignees/attachments that the
     * Kanban tab owns, so deleting and recreating rows on every Gantt save
     * would silently destroy that data. Instead:
     *   - a row whose id resolves to an existing Task in this project is
     *     UPDATED via an explicit Gantt-owned field allow-list only (title,
     *     startDate, duration, progress, status, orderIndex, parentTaskId) —
     *     description/dueDate/priority/files/projectHeadingId/assignedUsers/
     *     subTasks/comments are never touched here.
     *   - a row whose id doesn't resolve (a client `temp-…` id, or anything
     *     else) is CREATED as a new minimal Task.
     *   - a Task that exists in the DB but is absent from `tasks` is left
     *     completely untouched — this method never deletes a Task row.
     * Dependency links (TaskLink) carry no cross-tab-owned data, so that join
     * table alone is safely full-replaced per save, same as TaskAssignee's
     * existing replace-on-update pattern elsewhere in this codebase.
     */
    async saveSchedule(projectId, organizationId, userId, tasks, links) {
        const numericProjectId = toProjectId(projectId);
        await assertProjectInOrganization(numericProjectId, organizationId);
        await prisma_1.prisma.$transaction(async (tx) => {
            const existingRows = await tx.task.findMany({
                where: { projectId: numericProjectId },
                select: { id: true },
            });
            const existingIds = new Set(existingRows.map((row) => row.id));
            const clientIdToDbId = new Map();
            for (const [index, task] of tasks.entries()) {
                const numericId = Number(task.id);
                const startDate = task.startDate ? new Date(task.startDate) : null;
                const fields = {
                    title: task.taskName,
                    startDate,
                    duration: task.duration,
                    progress: task.progress ?? 0,
                    status: task.status,
                    orderIndex: index,
                };
                if (Number.isInteger(numericId) && existingIds.has(numericId)) {
                    await tx.task.update({ where: { id: numericId }, data: fields });
                    clientIdToDbId.set(task.id, numericId);
                }
                else {
                    const created = await tx.task.create({
                        data: {
                            ...fields,
                            projectId: numericProjectId,
                            organizationId,
                            // Task.dueDate is NOT NULL — default a schedule-originated task's
                            // due date to its Gantt start date (one-time default at creation,
                            // never re-synced afterward; dueDate stays Kanban-owned from here).
                            dueDate: startDate ?? new Date(),
                            createdById: userId ?? null,
                        },
                    });
                    clientIdToDbId.set(task.id, created.id);
                }
            }
            // Second pass, mirroring the tasks-then-links ordering this service has
            // always used: resolve each row's parentId/link endpoints now that
            // every row (existing and freshly-created) has a real DB id.
            for (const task of tasks) {
                const dbId = clientIdToDbId.get(task.id);
                if (dbId == null)
                    continue;
                const parentDbId = task.parentId ? clientIdToDbId.get(task.parentId) ?? null : null;
                await tx.task.update({ where: { id: dbId }, data: { parentTaskId: parentDbId } });
            }
            await tx.taskLink.deleteMany({ where: { projectId: numericProjectId } });
            if (links.length > 0) {
                await tx.taskLink.createMany({
                    data: links.map((link) => ({
                        projectId: numericProjectId,
                        predecessorTaskId: clientIdToDbId.get(link.predecessorId),
                        successorTaskId: clientIdToDbId.get(link.successorId),
                        type: link.type,
                        lagDays: link.lag,
                    })),
                });
            }
        });
        return this.getSchedule(projectId, organizationId);
    }
}
exports.ScheduleService = ScheduleService;
//# sourceMappingURL=schedule.service.js.map