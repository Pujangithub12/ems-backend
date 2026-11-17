import { prisma } from "../config/prisma";
import { ScheduleLinkType, ScheduleTaskInput, ScheduleTaskLinkInput, ValidationError } from "../dto/schedule.dto";
import type { ScheduleTaskModel as ScheduleTask } from "../generated/prisma/models";

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

/** ScheduleTask.taskId is the client-assigned row id the Gantt/frontend code uses (WBS-style, or a `temp-…`
 * id for a brand-new row) and is what parentId and dependency links refer to, so it is the wire `id`. */
function toDto(row: ScheduleTask): ScheduleTaskDto {
  return {
    id: row.taskId,
    taskName: row.taskName,
    duration: row.duration ?? null,
    startDate: formatDate(row.startDate),
    parentId: row.parentId ?? null,
    // Deprecated column — real dependency data lives in ScheduleTaskLink, surfaced via the top-level `links`.
    predecessorId: null,
    progress: row.progress ?? null,
    status: row.status,
  };
}

async function assertProjectInOrganization(projectId: number, organizationId: number): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  if (!project) {
    throw new ValidationError("Project not found.");
  }
}

/**
 * The project Schedule (Gantt) tab. It has its own storage (ScheduleTask / ScheduleTaskLink) and is
 * deliberately independent of the Task table: rows written here never appear on the Tasks tab / Kanban
 * board / task pages, and tasks created there never appear in the schedule.
 */
export class ScheduleService {
  /** Returns the project's schedule rows (in their saved order) plus their dependency links. */
  async getSchedule(projectId: string, organizationId: number): Promise<ScheduleDto> {
    const numericProjectId = toProjectId(projectId);
    await assertProjectInOrganization(numericProjectId, organizationId);

    const rows = await prisma.scheduleTask.findMany({
      where: { projectId: numericProjectId },
      orderBy: { orderIndex: "asc" },
    });

    const linkRows = rows.length ? await prisma.scheduleTaskLink.findMany({ where: { projectId: numericProjectId } }) : [];
    const clientIdByDbId = new Map(rows.map((row) => [row.id, row.taskId] as const));
    const links: ScheduleTaskLinkDto[] = linkRows.flatMap((link) => {
      const predecessorId = clientIdByDbId.get(link.predecessorId);
      const successorId = clientIdByDbId.get(link.successorId);
      return predecessorId !== undefined && successorId !== undefined
        ? [{ predecessorId, successorId, type: link.type as ScheduleLinkType, lag: link.lagDays }]
        : [];
    });

    return { tasks: rows.map(toDto), links };
  }

  /** Full replace of the project's schedule (rows + links) inside one transaction. Nothing outside the schedule tables is touched. */
  async saveSchedule(
    projectId: string,
    organizationId: number,
    tasks: ScheduleTaskInput[],
    links: ScheduleTaskLinkInput[],
  ): Promise<ScheduleDto> {
    const numericProjectId = toProjectId(projectId);
    await assertProjectInOrganization(numericProjectId, organizationId);

    await prisma.$transaction(async (tx) => {
      // Links reference rows by FK, so they go first (they'd also cascade with the rows).
      await tx.scheduleTaskLink.deleteMany({ where: { projectId: numericProjectId } });
      await tx.scheduleTask.deleteMany({ where: { projectId: numericProjectId } });

      if (tasks.length > 0) {
        await tx.scheduleTask.createMany({
          data: tasks.map((task, index) => ({
            projectId: numericProjectId,
            taskId: task.id,
            taskName: task.taskName,
            duration: task.duration,
            startDate: task.startDate ? new Date(task.startDate) : null,
            parentId: task.parentId,
            orderIndex: index,
            progress: task.progress ?? 0,
            status: task.status,
          })),
        });
      }

      if (links.length > 0) {
        const created = await tx.scheduleTask.findMany({
          where: { projectId: numericProjectId },
          select: { id: true, taskId: true },
        });
        const dbIdByClientId = new Map(created.map((row) => [row.taskId, row.id] as const));
        const data = links.flatMap((link) => {
          const predecessorId = dbIdByClientId.get(link.predecessorId);
          const successorId = dbIdByClientId.get(link.successorId);
          return predecessorId !== undefined && successorId !== undefined
            ? [{ projectId: numericProjectId, predecessorId, successorId, type: link.type, lagDays: link.lag }]
            : [];
        });
        if (data.length > 0) await tx.scheduleTaskLink.createMany({ data });
      }
    });

    return this.getSchedule(projectId, organizationId);
  }
}
