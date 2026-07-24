import { AppDataSource } from "../config/data-source";
import { ScheduleTask } from "../entities/ScheduleTask";
import { ScheduleTaskInput, ValidationError } from "../dto/schedule.dto";

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

function toProjectId(projectId: string): number {
  const n = Number(projectId);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError("Invalid project id.");
  }
  return n;
}

function toDto(row: ScheduleTask): ScheduleTaskDto {
  return {
    id: row.taskId,
    taskName: row.taskName,
    duration: row.duration ?? null,
    startDate: row.startDate ?? null,
    parentId: row.parentId ?? null,
    predecessorId: row.predecessorId ?? null,
    progress: row.progress ?? null,
    status: row.status ?? "pending",
  };
}

export class ScheduleService {
  private get repo() {
    return AppDataSource.getRepository(ScheduleTask);
  }

  /** Returns the saved schedule rows for a project, in their saved order. */
  async getSchedule(projectId: string): Promise<ScheduleTaskDto[]> {
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
  async saveSchedule(
    projectId: string,
    tasks: ScheduleTaskInput[],
  ): Promise<ScheduleTaskDto[]> {
    const numericProjectId = toProjectId(projectId);

    const saved = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ScheduleTask);

      await repo.delete({ projectId: numericProjectId });

      if (tasks.length === 0) {
        return [];
      }

      const entities = tasks.map((task, index) =>
        repo.create({
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
        }),
      );

      return repo.save(entities);
    });

    return saved
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(toDto);
  }
}
