import { prisma } from "../config/prisma";

/**
 * One-off, manually-invoked migration (NOT wired into server startup) for separating the Schedule tab
 * from the Task tab again. Until now the Schedule tab read/wrote the shared `task` table, so every
 * Gantt row was also a task; the schedule now has its own storage (schedule_task / schedule_task_link,
 * see schedule.service.ts). Without this, projects with an existing schedule would show an EMPTY
 * schedule after deploying, because their rows still live in `task`.
 *
 * What it does, per project: finds the Task rows that belong to the schedule — rows that carry Gantt
 * data (startDate, duration, parentTaskId), rows that came from the legacy schedule migration
 * (migratedFromScheduleTaskId), rows used in a TaskLink, and their parents — and COPIES them into
 * schedule_task / schedule_task_link (row ids become 1, 2, 3… in saved order; parents and dependency
 * links are remapped). Plain Kanban tasks (no Gantt data) are not copied.
 *
 * DATA SAFETY: never modifies or deletes any Task/TaskLink row — the copies in the Tasks tab stay
 * exactly as they are, so nothing disappears from there; from now on the two simply don't affect each
 * other. The only thing it overwrites is a project's schedule_task / schedule_task_link rows, and only
 * stale ones: a project is SKIPPED when it already has a schedule row created after its newest
 * schedule-like Task (i.e. it was already converted by an earlier run, or edited in the new Schedule
 * tab), so a re-run never clobbers new work.
 *
 * Dry run by default (prints what it would do). Run once, right after deploying and before anyone saves a
 * schedule:
 *   npx ts-node src/utils/migrate-task-to-schedule.ts            # preview
 *   npx ts-node src/utils/migrate-task-to-schedule.ts --apply    # do it
 */
export async function migrateTaskToSchedule(apply: boolean) {
  console.log(`Starting task -> schedule migration (${apply ? "APPLY" : "dry run"})...`);

  const tasks = await prisma.task.findMany({
    where: { projectId: { not: null } },
    select: {
      id: true,
      projectId: true,
      title: true,
      startDate: true,
      duration: true,
      progress: true,
      status: true,
      orderIndex: true,
      parentTaskId: true,
      migratedFromScheduleTaskId: true,
      createdAt: true,
    },
    orderBy: [{ projectId: "asc" }, { orderIndex: "asc" }, { id: "asc" }],
  });
  const taskLinks = await prisma.taskLink.findMany();
  const linkedTaskIds = new Set<number>();
  for (const link of taskLinks) {
    linkedTaskIds.add(link.predecessorTaskId);
    linkedTaskIds.add(link.successorTaskId);
  }

  const tasksByProject = new Map<number, typeof tasks>();
  for (const task of tasks) {
    const list = tasksByProject.get(task.projectId!) ?? [];
    list.push(task);
    tasksByProject.set(task.projectId!, list);
  }

  let projectsMigrated = 0;
  let projectsSkipped = 0;
  let rowsCopied = 0;
  let linksCopied = 0;

  for (const [projectId, projectTasks] of tasksByProject) {
    const byId = new Map(projectTasks.map((t) => [t.id, t] as const));
    const selected = new Set<number>(
      projectTasks
        .filter(
          (t) =>
            t.startDate != null ||
            t.duration != null ||
            t.parentTaskId != null ||
            t.migratedFromScheduleTaskId != null ||
            linkedTaskIds.has(t.id),
        )
        .map((t) => t.id),
    );
    // Pull in parents too, so no copied row points at a parent that wasn't copied.
    for (const id of Array.from(selected)) {
      let parent = byId.get(id)?.parentTaskId ?? null;
      while (parent != null && !selected.has(parent) && byId.has(parent)) {
        selected.add(parent);
        parent = byId.get(parent)!.parentTaskId;
      }
    }
    if (selected.size === 0) continue;

    const rows = projectTasks.filter((t) => selected.has(t.id)); // already in saved order
    const newestScheduleTask = rows.reduce((max, t) => (t.createdAt > max ? t.createdAt : max), rows[0]!.createdAt);
    const alreadyConverted = await prisma.scheduleTask.findFirst({
      where: { projectId, createdAt: { gt: newestScheduleTask } },
    });
    if (alreadyConverted) {
      projectsSkipped += 1;
      continue;
    }

    const clientIdByTaskId = new Map(rows.map((t, i) => [t.id, String(i + 1)] as const));
    const links = taskLinks.filter((l) => selected.has(l.predecessorTaskId) && selected.has(l.successorTaskId));
    const existingCount = await prisma.scheduleTask.count({ where: { projectId } });
    console.log(
      `  project ${projectId}: ${rows.length} schedule row(s), ${links.length} link(s)` +
        (existingCount ? ` — replaces ${existingCount} older schedule row(s) in schedule_task` : ""),
    );
    rowsCopied += rows.length;
    linksCopied += links.length;
    projectsMigrated += 1;
    if (!apply) continue;

    await prisma.$transaction(
      async (tx) => {
        await tx.scheduleTaskLink.deleteMany({ where: { projectId } });
        await tx.scheduleTask.deleteMany({ where: { projectId } });
        await tx.scheduleTask.createMany({
          data: rows.map((t, index) => ({
            projectId,
            taskId: clientIdByTaskId.get(t.id)!,
            taskName: t.title,
            duration: t.duration,
            startDate: t.startDate,
            parentId: t.parentTaskId != null ? clientIdByTaskId.get(t.parentTaskId) ?? null : null,
            orderIndex: index,
            progress: t.progress,
            status: t.status,
          })),
        });
        if (links.length > 0) {
          const created = await tx.scheduleTask.findMany({ where: { projectId }, select: { id: true, taskId: true } });
          const dbIdByClientId = new Map(created.map((r) => [r.taskId, r.id] as const));
          await tx.scheduleTaskLink.createMany({
            data: links.map((l) => ({
              projectId,
              predecessorId: dbIdByClientId.get(clientIdByTaskId.get(l.predecessorTaskId)!)!,
              successorId: dbIdByClientId.get(clientIdByTaskId.get(l.successorTaskId)!)!,
              type: l.type,
              lagDays: l.lagDays,
            })),
          });
        }
      },
      // Generous timeout: a remote (pooled) database makes every query a WAN round-trip. One-off script.
      { timeout: 120_000, maxWait: 30_000 },
    );
  }

  console.log(
    `${apply ? "Migration complete" : "Dry run complete — nothing was written"}: ${projectsMigrated} project(s) ${
      apply ? "migrated" : "would be migrated"
    } (${rowsCopied} schedule rows, ${linksCopied} links), ${projectsSkipped} project(s) skipped (already converted).`,
  );
}

if (require.main === module) {
  migrateTaskToSchedule(process.argv.includes("--apply"))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
