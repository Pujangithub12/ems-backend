import { prisma } from "../config/prisma";

/**
 * One-off, manually-invoked migration (NOT wired into server startup, same as
 * migrate-procurement-to-pr-po.ts) that copies every legacy ScheduleTask row
 * (plus its ScheduleTaskLink dependencies) into the shared Task table, now
 * that the Task tab and Schedule tab both read/write Task directly (see
 * schedule.service.ts). Without this, projects with an existing Gantt
 * schedule would appear empty on both tabs after deploying the schema change.
 *
 * DATA SAFETY: only reads schedule_task/schedule_task_link (never modifies or
 * deletes them — they stay in the schema, deprecated) and only inserts new
 * Task/TaskLink rows. Does NOT touch any pre-existing Task row.
 *
 * Does NOT attempt to fuzzy-match/dedupe against a pre-existing Task with a
 * similar title in the same project. If a user had previously hand-mirrored
 * the same task name into both the Kanban board and the Gantt chart, they
 * will end up with two separate Task rows after this migration — there's no
 * reliable way to auto-merge those without risking merging two genuinely
 * different tasks that just happen to share a name.
 *
 * Idempotent per project via Task.migratedFromScheduleTaskId (unique) — a
 * project that already has at least one migrated Task row is skipped
 * entirely on a re-run. Invoke manually once after deploying the schema:
 * `npx ts-node src/utils/migrate-schedule-to-task.ts`.
 */
export async function migrateScheduleToTask() {
  console.log("Starting schedule_task -> task migration...");

  const legacyRows = await prisma.scheduleTask.findMany({
    include: { project: true },
    orderBy: [{ projectId: "asc" }, { orderIndex: "asc" }],
  });

  const rowsByProject = new Map<number, typeof legacyRows>();
  for (const row of legacyRows) {
    const list = rowsByProject.get(row.projectId) ?? [];
    list.push(row);
    rowsByProject.set(row.projectId, list);
  }

  let projectsMigrated = 0;
  let projectsSkipped = 0;
  let tasksMigrated = 0;
  let linksMigrated = 0;

  for (const [projectId, rows] of rowsByProject) {
    const alreadyMigrated = await prisma.task.findFirst({
      where: { projectId, migratedFromScheduleTaskId: { not: null } },
    });
    if (alreadyMigrated) {
      projectsSkipped += 1;
      continue;
    }

    const organizationId = rows[0]!.project.organizationId;

    await prisma.$transaction(async (tx) => {
      // Pass 1: create a Task per legacy row, no parentTaskId yet.
      const legacyIdToNewTaskId = new Map<number, number>();
      for (const legacy of rows) {
        const created = await tx.task.create({
          data: {
            projectId,
            organizationId,
            title: legacy.taskName,
            startDate: legacy.startDate,
            duration: legacy.duration,
            progress: legacy.progress != null ? Math.round(legacy.progress) : 0,
            status: legacy.status,
            orderIndex: legacy.orderIndex,
            dueDate: legacy.startDate ?? new Date(),
            createdById: null,
            migratedFromScheduleTaskId: legacy.id,
          },
        });
        legacyIdToNewTaskId.set(legacy.id, created.id);
        tasksMigrated += 1;
      }

      // Pass 2: resolve each legacy row's string parentId (a sibling
      // legacy.taskId within the same project) to the new Task id.
      const legacyByTaskId = new Map(rows.map((legacy) => [legacy.taskId, legacy]));
      for (const legacy of rows) {
        if (!legacy.parentId) continue;
        const parentLegacy = legacyByTaskId.get(legacy.parentId);
        if (!parentLegacy) continue; // dangling reference in legacy data — leave unparented
        const newTaskId = legacyIdToNewTaskId.get(legacy.id)!;
        const newParentTaskId = legacyIdToNewTaskId.get(parentLegacy.id);
        if (newParentTaskId == null) continue;
        await tx.task.update({ where: { id: newTaskId }, data: { parentTaskId: newParentTaskId } });
      }

      // Pass 3: migrate ScheduleTaskLink rows for this project into TaskLink.
      const legacyLinks = await tx.scheduleTaskLink.findMany({ where: { projectId } });
      if (legacyLinks.length > 0) {
        await tx.taskLink.createMany({
          data: legacyLinks
            .map((link) => {
              const predecessorTaskId = legacyIdToNewTaskId.get(link.predecessorId);
              const successorTaskId = legacyIdToNewTaskId.get(link.successorId);
              if (predecessorTaskId == null || successorTaskId == null) return null;
              return {
                projectId,
                predecessorTaskId,
                successorTaskId,
                type: link.type,
                lagDays: link.lagDays,
              };
            })
            .filter((data): data is NonNullable<typeof data> => data != null),
        });
        linksMigrated += legacyLinks.length;
      }
    });

    projectsMigrated += 1;
  }

  console.log(
    `Migration complete: ${projectsMigrated} project(s) migrated (${tasksMigrated} tasks, ${linksMigrated} links), ${projectsSkipped} project(s) skipped (already migrated).`,
  );
}

if (require.main === module) {
  migrateScheduleToTask()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
