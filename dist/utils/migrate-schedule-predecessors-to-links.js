"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateSchedulePredecessorsToLinks = migrateSchedulePredecessorsToLinks;
const prisma_1 = require("../config/prisma");
/**
 * One-off, manually-invoked migration (NOT wired into server startup) that
 * converts every project's existing ScheduleTask.predecessorId comma-string
 * data into real ScheduleTaskLink rows, so no historical dependency data is
 * silently lost now that new code no longer writes predecessorId.
 *
 * Every migrated link is created as type "FS" with lagDays 0 — that's the
 * only relationship the old string model could express (implicit
 * Finish-to-Start, no lag). ScheduleTask.predecessorId itself is left
 * untouched (read-only source data for this script, never modified/dropped).
 *
 * DATA SAFETY: read-only against schedule_task, only inserts new rows into
 * schedule_task_link. Idempotent via a whole-table guard (unlike
 * migrate-procurement-to-pr-po.ts's per-row marker column — ScheduleTaskLink
 * has no natural unique-per-source-row field to key an idempotency check on,
 * and this script has no reason to ever run more than once): if any
 * ScheduleTaskLink rows already exist, the script aborts without touching
 * anything, on the assumption a from-scratch backfill has already happened.
 * Invoke manually once after deploying the schema
 * (`npx ts-node src/utils/migrate-schedule-predecessors-to-links.ts`).
 */
async function migrateSchedulePredecessorsToLinks() {
    console.log("Starting schedule predecessorId -> ScheduleTaskLink migration...");
    const existingLinkCount = await prisma_1.prisma.scheduleTaskLink.count();
    if (existingLinkCount > 0) {
        console.log(`Found ${existingLinkCount} existing ScheduleTaskLink row(s) — assuming already migrated, aborting.`);
        return;
    }
    const tasks = await prisma_1.prisma.scheduleTask.findMany({
        where: { predecessorId: { not: null } },
    });
    let projectsTouched = 0;
    let linksCreated = 0;
    let skippedMissingPredecessor = 0;
    let skippedSelfLink = 0;
    const tasksByProject = new Map();
    for (const task of tasks) {
        const list = tasksByProject.get(task.projectId) ?? [];
        list.push(task);
        tasksByProject.set(task.projectId, list);
    }
    for (const [projectId, projectTasks] of tasksByProject) {
        // taskId (client string) -> DB id, scoped to this project — every task
        // in this project, not just ones with a predecessorId, since a
        // predecessor reference can point at any task in the project.
        const allProjectTasks = await prisma_1.prisma.scheduleTask.findMany({ where: { projectId } });
        const taskIdToDbId = new Map(allProjectTasks.map((t) => [t.taskId, t.id]));
        const linksToCreate = [];
        const seenPairs = new Set();
        for (const task of projectTasks) {
            const predecessorIds = (task.predecessorId ?? "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            for (const pid of predecessorIds) {
                const predecessorDbId = taskIdToDbId.get(pid);
                if (predecessorDbId == null) {
                    skippedMissingPredecessor += 1;
                    continue;
                }
                if (predecessorDbId === task.id) {
                    skippedSelfLink += 1;
                    continue;
                }
                const pairKey = `${predecessorDbId}->${task.id}`;
                if (seenPairs.has(pairKey))
                    continue;
                seenPairs.add(pairKey);
                linksToCreate.push({ projectId, predecessorId: predecessorDbId, successorId: task.id });
            }
        }
        if (linksToCreate.length > 0) {
            await prisma_1.prisma.scheduleTaskLink.createMany({
                data: linksToCreate.map((link) => ({ ...link, type: "FS", lagDays: 0 })),
            });
            linksCreated += linksToCreate.length;
            projectsTouched += 1;
        }
    }
    console.log(`Migration complete: ${linksCreated} link(s) created across ${projectsTouched} project(s), ` +
        `${skippedMissingPredecessor} skipped (missing predecessor), ${skippedSelfLink} skipped (self-link).`);
}
if (require.main === module) {
    migrateSchedulePredecessorsToLinks()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error("Migration failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate-schedule-predecessors-to-links.js.map