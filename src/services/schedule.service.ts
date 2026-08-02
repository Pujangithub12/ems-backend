import { prisma } from "../config/prisma";
import { ScheduleLinkType, ScheduleTaskInput, ScheduleTaskLinkInput, ValidationError } from "../dto/schedule.dto";
import type { TaskModel as Task } from "../generated/prisma/models";

export interface ScheduleTaskDto {
  id: string;
  taskName: string;
  duration: number | null;
  startDate: string | null;
  parentId: string | null;
  predecessorId: string | null;
  progress: number | null;
  status: string;
}

/** Wire shape for a single dependency link — predecessor/successor are the client-visible task ids (ScheduleTaskDto.id, i.e. Task.id serialized as a string), not raw DB internals. */
export interface ScheduleTaskLinkDto {
  predecessorId: string;
  successorId: string;
  type: ScheduleLinkType;
  lag: number;
}

export interface ScheduleDto {
  tasks: ScheduleTaskDto[];
  links: ScheduleTaskLinkDto[];
}

function toProjectId(projectId: string): number {
  const n = Number(projectId);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError("Invalid project id.");
  }
  return n;
}

/** TypeORM's `type: "date"` columns read back as a plain "YYYY-MM-DD" string;
 * Prisma always returns a Date object for @db.Date columns, so this
 * reformats it back to the same string shape the frontend has always received. */
function formatDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Task.id (a real, stable DB primary key) is serialized as a plain string at
 * the wire boundary — the Gantt/frontend code has always treated schedule row
 * ids as opaque strings (previously ScheduleTask's client-assigned WBS-style
 * ids), so this keeps that contract while the ids underneath are now real. */
function toDto(row: Task): ScheduleTaskDto {
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

async function assertProjectInOrganization(projectId: number, organizationId: number): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  if (!project) {
    throw new ValidationError("Project not found.");
  }
}

export class ScheduleService {
  /** Returns every task for a project (the Gantt now represents the whole task tree, not just previously-scheduled rows) plus its dependency links, tasks in their saved order. */
  async getSchedule(projectId: string, organizationId: number): Promise<ScheduleDto> {
    const numericProjectId = toProjectId(projectId);
    await assertProjectInOrganization(numericProjectId, organizationId);

    const rows = await prisma.task.findMany({
      where: { projectId: numericProjectId },
      orderBy: { orderIndex: "asc" },
    });

    const linkRows = rows.length
      ? await prisma.taskLink.findMany({ where: { projectId: numericProjectId } })
      : [];
    const links: ScheduleTaskLinkDto[] = linkRows.map((link) => ({
      predecessorId: String(link.predecessorTaskId),
      successorId: String(link.successorTaskId),
      type: link.type as ScheduleLinkType,
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
  async saveSchedule(
    projectId: string,
    organizationId: number,
    userId: number | null,
    tasks: ScheduleTaskInput[],
    links: ScheduleTaskLinkInput[],
  ): Promise<ScheduleDto> {
    const numericProjectId = toProjectId(projectId);
    await assertProjectInOrganization(numericProjectId, organizationId);

    await prisma.$transaction(async (tx) => {
      const existingRows = await tx.task.findMany({
        where: { projectId: numericProjectId },
        select: { id: true },
      });
      const existingIds = new Set(existingRows.map((row) => row.id));

      const clientIdToDbId = new Map<string, number>();

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
        } else {
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
        if (dbId == null) continue;
        const parentDbId = task.parentId ? clientIdToDbId.get(task.parentId) ?? null : null;
        await tx.task.update({ where: { id: dbId }, data: { parentTaskId: parentDbId } });
      }

      await tx.taskLink.deleteMany({ where: { projectId: numericProjectId } });
      if (links.length > 0) {
        await tx.taskLink.createMany({
          data: links.map((link) => ({
            projectId: numericProjectId,
            predecessorTaskId: clientIdToDbId.get(link.predecessorId)!,
            successorTaskId: clientIdToDbId.get(link.successorId)!,
            type: link.type,
            lagDays: link.lag,
          })),
        });
      }
    });

    return this.getSchedule(projectId, organizationId);
  }
}
