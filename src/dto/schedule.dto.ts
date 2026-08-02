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
  /** Percent complete (0-100), manually entered. Null when not tracked. */
  progress: number | null;
  /** "to_do" | "in_progress" | "on_hold" | "completed". */
  status: string;
}

const VALID_STATUSES = new Set(["to_do", "in_progress", "on_hold", "completed"]);

/** Case/spacing-tolerant normalization ("On Hold", "on-hold" -> "on_hold"),
 * falling back to "to_do" for anything unrecognized rather than rejecting
 * the whole save — same forgiving treatment as Progress being clamped. */
function normalizeStatus(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "to_do";
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return VALID_STATUSES.has(key) ? key : "to_do";
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

    let progress: number | null = null;
    if (raw.progress !== undefined && raw.progress !== null && raw.progress !== "") {
      const n = Number(raw.progress);
      if (Number.isNaN(n)) {
        throw new ValidationError(
          `Task "${finalId}" has a non-numeric Progress.`,
        );
      }
      progress = Math.max(0, Math.min(100, n));
    }

    const status = normalizeStatus(raw.status);

    // Progress is derived from status for To Do/Completed — enforced here
    // too (not just client-side in ProjectScheduleTab's handleStatusChange)
    // so a direct API call or stale client can't desync the two. In Progress
    // and On Hold both keep whatever value was sent: In Progress because
    // it's user-editable, On Hold because it's meant to stay frozen.
    if (status === "to_do") progress = 0;
    else if (status === "completed") progress = 100;

    return { id: finalId, taskName, duration, startDate, parentId, predecessorId, progress, status };
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

/** MS-Project-style dependency relationship: Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish. */
export type ScheduleLinkType = "FS" | "SS" | "FF" | "SF";
const VALID_LINK_TYPES = new Set<ScheduleLinkType>(["FS", "SS", "FF", "SF"]);

/** Shape the frontend sends/receives for a single dependency link. Record-and-display only — never used for date auto-scheduling. */
export interface ScheduleTaskLinkInput {
  /** Predecessor's task id (ScheduleTaskInput.id). */
  predecessorId: string;
  /** Successor's task id (ScheduleTaskInput.id). */
  successorId: string;
  type: ScheduleLinkType;
  /** Days of delay after the predecessor's reference point; negative = lead/overlap. */
  lag: number;
}

/**
 * Validates and normalizes the raw `links` array sent alongside `tasks` to
 * PUT /projects/:projectId/schedule. `taskIds` must be the set of ids
 * already validated by validateScheduleTasks for the same save, so
 * referential checks are against the *same* task list being saved.
 * Throws ValidationError with a human-readable message on any problem,
 * including a real (non-tree) cycle-detection pass over the whole link
 * graph — dependency type has no bearing on whether a cycle exists, since
 * cycle detection only cares about edge direction (predecessor -> successor).
 */
export function validateScheduleLinks(input: unknown, taskIds: Set<string>): ScheduleTaskLinkInput[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw new ValidationError("`links` must be an array.");
  }

  const links: ScheduleTaskLinkInput[] = input.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new ValidationError(`Dependency link at index ${index} must be an object.`);
    }

    const predecessorId =
      raw.predecessorId !== undefined && raw.predecessorId !== null
        ? String(raw.predecessorId).trim()
        : "";
    const successorId =
      raw.successorId !== undefined && raw.successorId !== null
        ? String(raw.successorId).trim()
        : "";
    if (!predecessorId || !successorId) {
      throw new ValidationError(
        `Dependency link at index ${index} is missing a predecessor or successor task id.`,
      );
    }

    const typeRaw = typeof raw.type === "string" ? raw.type.trim().toUpperCase() : "";
    if (!VALID_LINK_TYPES.has(typeRaw as ScheduleLinkType)) {
      throw new ValidationError(
        `Dependency link between "${predecessorId}" and "${successorId}" has an invalid type "${String(raw.type)}" (expected FS, SS, FF, or SF).`,
      );
    }
    const type = typeRaw as ScheduleLinkType;

    let lag = 0;
    if (raw.lag !== undefined && raw.lag !== null && raw.lag !== "") {
      const n = Number(raw.lag);
      if (!Number.isFinite(n)) {
        throw new ValidationError(
          `Dependency link between "${predecessorId}" and "${successorId}" has a non-numeric lag.`,
        );
      }
      lag = n;
    }

    return { predecessorId, successorId, type, lag };
  });

  // Referential checks — both ends must resolve to a task in this same save.
  links.forEach((link) => {
    if (!taskIds.has(link.predecessorId)) {
      throw new ValidationError(
        `Dependency link references missing predecessor task "${link.predecessorId}".`,
      );
    }
    if (!taskIds.has(link.successorId)) {
      throw new ValidationError(
        `Dependency link references missing successor task "${link.successorId}".`,
      );
    }
  });

  // Self-link check — done before the duplicate-pair/cycle checks so it can't corrupt them.
  links.forEach((link) => {
    if (link.predecessorId === link.successorId) {
      throw new ValidationError(`Task "${link.predecessorId}" cannot depend on itself.`);
    }
  });

  // Duplicate-pair check — MS Project itself only allows one link per ordered task pair.
  const seenPairs = new Set<string>();
  links.forEach((link) => {
    const key = `${link.predecessorId}->${link.successorId}`;
    if (seenPairs.has(key)) {
      throw new ValidationError(
        `Duplicate dependency between "${link.predecessorId}" and "${link.successorId}" — only one link is allowed per task pair.`,
      );
    }
    seenPairs.add(key);
  });

  // Cycle detection: real DFS over a general directed graph (a task can have
  // multiple predecessors AND multiple successors), not the single-parent
  // chain walk used for HierarchyNode.parentId — that shortcut only works
  // for trees. Recursion-stack coloring reconstructs the actual cycle path
  // for a readable error message.
  const adjacency = new Map<string, string[]>();
  links.forEach((link) => {
    const successors = adjacency.get(link.predecessorId) ?? [];
    successors.push(link.successorId);
    adjacency.set(link.predecessorId, successors);
  });

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (node: string): void => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const nextColor = color.get(next) ?? WHITE;
      if (nextColor === WHITE) {
        visit(next);
      } else if (nextColor === GRAY) {
        const cycleStart = stack.indexOf(next);
        const cycle = stack.slice(cycleStart).concat(next);
        throw new ValidationError(`Circular dependency detected: ${cycle.join(" → ")}.`);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const taskId of taskIds) {
    if ((color.get(taskId) ?? WHITE) === WHITE) {
      visit(taskId);
    }
  }

  return links;
}
