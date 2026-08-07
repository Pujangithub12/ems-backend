import { prisma } from "../config/prisma";

/**
 * One-off, manually-invoked follow-up to migrate-schedule-to-task.ts, for
 * production databases where that script already ran (and so already marked
 * every affected project "migrated" via Task.migratedFromScheduleTaskId)
 * BEFORE migrate-schedule-predecessors-to-links.ts backfilled the real
 * ScheduleTaskLink rows those projects' dependencies actually needed.
 * migrate-schedule-to-task.ts's own idempotency guard (skip any project that
 * already has a migrated Task row) means simply rerunning it won't pick up
 * links that didn't exist yet at the time it ran — this script fills that
 * specific gap without touching or re-creating any Task row.
 *
 * DATA SAFETY: read-only against schedule_task_link and task; only inserts
 * new TaskLink rows, and only for a project that currently has zero TaskLink
 * rows (so a project already fully migrated together with its links is left
 * untouched — safe to rerun after `migrate-schedule-predecessors-to-links.ts`
 * finishes finding new links). Invoke manually, after that script has run:
 * `npx ts-node src/utils/backfill-tasklinks-for-migrated-projects.ts`.
 */
export async function backfillTaskLinksForMigratedProjects() {
  console.log("Starting TaskLink backfill for already-migrated projects...");

  const migratedTasks = await prisma.task.findMany({
    where: { migratedFromScheduleTaskId: { not: null } },
    select: { id: true, projectId: true, migratedFromScheduleTaskId: true },
  });

  const projectIds = Array.from(
    new Set(migratedTasks.map((t) => t.projectId).filter((id): id is number => id != null)),
  );

  let projectsTouched = 0;
  let projectsSkipped = 0;
  let linksCreated = 0;

  for (const projectId of projectIds) {
    const existingLinkCount = await prisma.taskLink.count({ where: { projectId } });
    if (existingLinkCount > 0) {
      projectsSkipped += 1;
      continue;
    }

    const legacyLinks = await prisma.scheduleTaskLink.findMany({ where: { projectId } });
    if (legacyLinks.length === 0) continue;

    const legacyIdToNewTaskId = new Map(
      migratedTasks
        .filter((t) => t.projectId === projectId)
        .map((t) => [t.migratedFromScheduleTaskId as number, t.id]),
    );

    const linksToCreate = legacyLinks
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
      .filter((data): data is NonNullable<typeof data> => data != null);

    if (linksToCreate.length > 0) {
      await prisma.taskLink.createMany({ data: linksToCreate });
      linksCreated += linksToCreate.length;
      projectsTouched += 1;
    }
  }

  console.log(
    `Backfill complete: ${linksCreated} link(s) created across ${projectsTouched} project(s), ${projectsSkipped} project(s) skipped (already had links).`,
  );
}

if (require.main === module) {
  backfillTaskLinksForMigratedProjects()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exit(1);
    });
}
