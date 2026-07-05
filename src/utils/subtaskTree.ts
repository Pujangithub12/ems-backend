import { AppDataSource } from "../config/data-source";
import { SubTask } from "../entities/SubTask";
import { Task } from "../entities/Task";

/** Builds a nested subtask tree from a flat list (bypasses TypeORM relation depth limits). */
export const buildSubTaskTree = (subTasks: any[]): any[] => {
  const map = new Map<string, any>();
  const roots: any[] = [];

  subTasks.forEach((st) => {
    // Explicitly map fields to ensure progress and history are never dropped
    map.set(String(st.id), {
      id: st.id,
      title: st.title,
      status: st.status,
      progress: st.progress ?? 0,
      history: st.history ?? [],
      parent: st.parent,
      createdAt: st.createdAt,
      children: [],
    });
  });

  subTasks.forEach((st) => {
    const node = map.get(String(st.id));
    let parentId = null;

    if (st.parentId !== undefined && st.parentId !== null) {
      parentId = String(st.parentId);
    } else if (st.parent) {
      const pId = typeof st.parent === "object" ? st.parent.id : st.parent;
      if (pId !== null && pId !== undefined) parentId = String(pId);
    }

    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(node);
    } else if (!parentId) {
      roots.push(node);
    }
  });

  return roots;
};

/** Fetches all subtasks for a task with all fields required to build the tree. */
export const fetchSubTasksForTask = async (taskId: number) => {
  const subTaskRepository = AppDataSource.getRepository(SubTask);

  return await subTaskRepository.find({
    where: { task: { id: taskId } },
    relations: ["parent"],
    order: { createdAt: "ASC" },
  });
};

/** Averages the progress of every leaf node in a subtask tree, rounded to the nearest integer. */
export const computeAverageLeafProgress = (tree: any[]): number => {
  let sum = 0;
  let count = 0;

  const visit = (nodes: any[]) => {
    for (const n of nodes || []) {
      const children = n.children || [];
      if (children.length > 0) {
        visit(children);
      } else {
        const v =
          typeof n.progress === "number"
            ? n.progress
            : parseInt(n.progress ?? "0");
        const clamped = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
        sum += clamped;
        count += 1;
      }
    }
  };

  visit(tree || []);
  return count === 0 ? 0 : Math.round(sum / count);
};

/** Recursively saves a (possibly nested) list of subtasks under an optional parent subtask. */
export const saveSubTasks = async (
  parsedSubTasks: any[],
  parentTask: Task,
  subTaskRepository: any,
  parentSubTask?: SubTask,
): Promise<void> => {
  for (const subTaskData of parsedSubTasks) {
    if (!subTaskData.title) continue;
    const subTask = subTaskRepository.create({
      title: subTaskData.title,
      task: parentTask,
      ...(parentSubTask ? { parent: parentSubTask } : {}),
    });
    await subTaskRepository.save(subTask);
    if (
      Array.isArray(subTaskData.subTasks) &&
      subTaskData.subTasks.length > 0
    ) {
      await saveSubTasks(
        subTaskData.subTasks,
        parentTask,
        subTaskRepository,
        subTask,
      );
    }
  }
};
