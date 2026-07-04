export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Shape the frontend sends/receives for a single schedule row. */
export interface ScheduleTaskInput {
  id: string;
  taskName: string;
  duration: number | null;
  startDate: string | null;
  parentId: string | null;
  predecessorId: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and normalizes the raw `tasks` array sent to
 * PUT /projects/:projectId/schedule. Throws ValidationError with a
 * human-readable message on any problem.
 */
export function validateScheduleTasks(input: unknown): ScheduleTaskInput[] {
  if (!Array.isArray(input)) {
    throw new ValidationError("`tasks` must be an array.");
  }

  const seenIds = new Set<string>();

  const tasks: ScheduleTaskInput[] = input.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new ValidationError(`Task at index ${index} must be an object.`);
    }

    const idRaw = raw.id;
    const id =
      idRaw === undefined || idRaw === null ? "" : String(idRaw).trim();
    const finalId = id || `row-${index + 1}`;

    if (seenIds.has(finalId)) {
      throw new ValidationError(`Duplicate task ID "${finalId}".`);
    }
    seenIds.add(finalId);

    const taskName =
      typeof raw.taskName === "string" ? raw.taskName.trim() : "";
    if (!taskName) {
      throw new ValidationError(
        `Task "${finalId}" is missing a required Task Name.`,
      );
    }

    let duration: number | null = null;
    if (raw.duration !== undefined && raw.duration !== null && raw.duration !== "") {
      const n = Number(raw.duration);
      if (Number.isNaN(n)) {
        throw new ValidationError(
          `Task "${finalId}" has a non-numeric Duration.`,
        );
      }
      duration = n;
    }

    let startDate: string | null = null;
    if (raw.startDate !== undefined && raw.startDate !== null && raw.startDate !== "") {
      const s = String(raw.startDate).trim();
      if (!DATE_RE.test(s) || Number.isNaN(new Date(s).getTime())) {
        throw new ValidationError(
          `Task "${finalId}" has an invalid Start Date (expected YYYY-MM-DD).`,
        );
      }
      startDate = s;
    }

    const parentId =
      raw.parentId !== undefined && raw.parentId !== null && raw.parentId !== ""
        ? String(raw.parentId).trim()
        : null;

    const predecessorId =
      raw.predecessorId !== undefined &&
      raw.predecessorId !== null &&
      raw.predecessorId !== ""
        ? String(raw.predecessorId).trim()
        : null;

    return { id: finalId, taskName, duration, startDate, parentId, predecessorId };
  });

  // Cross-row referential checks.
  tasks.forEach((task) => {
    if (task.parentId && !seenIds.has(task.parentId)) {
      throw new ValidationError(
        `Task "${task.id}" references missing Parent ID "${task.parentId}".`,
      );
    }
    if (task.predecessorId) {
      task.predecessorId.split(",").map((s) => s.trim()).filter(Boolean).forEach((pid) => {
        if (!seenIds.has(pid)) {
          throw new ValidationError(
            `Task "${task.id}" references missing Predecessor ID "${pid}".`,
          );
        }
      });
    }
  });

  return tasks;
}
