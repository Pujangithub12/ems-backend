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

/** Wire shape for a single dependency link — predecessor/successor are the client-assigned task ids (ScheduleTaskDto.id), not DB primary keys. */
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

function toDto(row: ScheduleTask): ScheduleTaskDto {
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

export class ScheduleService {
  /** Returns the saved schedule (tasks + dependency links) for a project, tasks in their saved order. */
  async getSchedule(projectId: string): Promise<ScheduleDto> {
    const numericProjectId = toProjectId(projectId);
    const rows = await prisma.scheduleTask.findMany({
      where: { projectId: numericProjectId },
      orderBy: { orderIndex: "asc" },
    });

    const idToTaskId = new Map<number, string>(rows.map((row) => [row.id, row.taskId]));
    const linkRows = rows.length
      ? await prisma.scheduleTaskLink.findMany({ where: { projectId: numericProjectId } })
      : [];
    const links: ScheduleTaskLinkDto[] = linkRows.map((link) => ({
      predecessorId: idToTaskId.get(link.predecessorId) ?? "",
      successorId: idToTaskId.get(link.successorId) ?? "",
      type: link.type as ScheduleLinkType,
      lag: link.lagDays,
    }));

    return { tasks: rows.map(toDto), links };
  }

  /**
   * Full replace: deletes whatever schedule (tasks + dependency links)
   * previously existed for this project and writes the new set in the order
   * provided. Runs inside a transaction so a failed insert can't leave the
   * project with a half-deleted schedule. Links are recreated after tasks,
   * resolved from the client-assigned taskId strings to the freshly-created
   * rows' new DB ids (DB ids are never stable across saves — only taskId is).
   */
  async saveSchedule(
    projectId: string,
    tasks: ScheduleTaskInput[],
    links: ScheduleTaskLinkInput[],
  ): Promise<ScheduleDto> {
    const numericProjectId = toProjectId(projectId);

    const saved = await prisma.$transaction(async (tx) => {
      await tx.scheduleTask.deleteMany({ where: { projectId: numericProjectId } });

      if (tasks.length === 0) {
        return [];
      }

      const rows: ScheduleTask[] = [];
      const taskIdToDbId = new Map<string, number>();
      for (const [index, task] of tasks.entries()) {
        const row = await tx.scheduleTask.create({
          data: {
            projectId: numericProjectId,
            taskId: task.id,
            taskName: task.taskName,
            duration: task.duration,
            startDate: task.startDate ? new Date(task.startDate) : null,
            parentId: task.parentId,
            predecessorId: task.predecessorId,
            progress: task.progress,
            status: task.status,
            orderIndex: index,
          },
        });
        rows.push(row);
        taskIdToDbId.set(task.id, row.id);
      }

      if (links.length > 0) {
        await tx.scheduleTaskLink.createMany({
          data: links.map((link) => ({
            projectId: numericProjectId,
            predecessorId: taskIdToDbId.get(link.predecessorId)!,
            successorId: taskIdToDbId.get(link.successorId)!,
            type: link.type,
            lagDays: link.lag,
          })),
        });
      }

      return rows;
    });

    const sortedTasks = saved.slice().sort((a, b) => a.orderIndex - b.orderIndex).map(toDto);
    const savedLinks: ScheduleTaskLinkDto[] = links.map((link) => ({
      predecessorId: link.predecessorId,
      successorId: link.successorId,
      type: link.type,
      lag: link.lag,
    }));

    return { tasks: sortedTasks, links: savedLinks };
  }
}
