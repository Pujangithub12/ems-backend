"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSubTasks = exports.computeAverageLeafProgress = exports.fetchSubTasksForTask = exports.buildSubTaskTree = void 0;
const prisma_1 = require("../config/prisma");
/** Builds a nested subtask tree from a flat list (bypasses TypeORM relation depth limits). */
const buildSubTaskTree = (subTasks) => {
    const map = new Map();
    const roots = [];
    subTasks.forEach((st) => {
        // Explicitly map fields to ensure progress and history are never dropped
        map.set(String(st.id), {
            id: st.id,
            title: st.title,
            status: st.status,
            progress: st.progress ?? 0,
            estimatedDays: st.estimatedDays ?? null,
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
        }
        else if (st.parent) {
            const pId = typeof st.parent === "object" ? st.parent.id : st.parent;
            if (pId !== null && pId !== undefined)
                parentId = String(pId);
        }
        if (parentId && map.has(parentId)) {
            map.get(parentId).children.push(node);
        }
        else if (!parentId) {
            roots.push(node);
        }
    });
    return roots;
};
exports.buildSubTaskTree = buildSubTaskTree;
/** Fetches all subtasks for a task with all fields required to build the tree. */
const fetchSubTasksForTask = async (taskId) => {
    const subTasks = await prisma_1.prisma.subTask.findMany({
        where: { taskId },
        include: { parent: true },
        orderBy: { createdAt: "asc" },
    });
    // history is stored as raw JSON text (Prisma doesn't (de)serialize it the
    // way TypeORM's simple-json column type did) — parse it back to an array
    // here so every caller keeps seeing SubTaskHistoryItem[] as before.
    return subTasks.map((st) => ({
        ...st,
        history: st.history ? JSON.parse(st.history) : [],
    }));
};
exports.fetchSubTasksForTask = fetchSubTasksForTask;
/** Weighted average of every leaf node's progress in a subtask tree, rounded
 * to the nearest integer. Each leaf is weighted by its `estimatedDays` (a
 * 10-day subtask counts 10x more than a 1-day one) so finishing one small
 * subtask out of two doesn't misleadingly report "50% done" when the other,
 * much bigger subtask is still untouched. A leaf with no estimatedDays set
 * (or an invalid one) falls back to a weight of 1 — equal weighting, the
 * same behavior as before this existed — so it's opt-in per subtask. */
const computeAverageLeafProgress = (tree) => {
    let weightedSum = 0;
    let totalWeight = 0;
    const visit = (nodes) => {
        for (const n of nodes || []) {
            const children = n.children || [];
            if (children.length > 0) {
                visit(children);
            }
            else {
                const v = typeof n.progress === "number"
                    ? n.progress
                    : parseInt(n.progress ?? "0");
                const clamped = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
                const rawWeight = typeof n.estimatedDays === "number" ? n.estimatedDays : Number(n.estimatedDays);
                const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1;
                weightedSum += clamped * weight;
                totalWeight += weight;
            }
        }
    };
    visit(tree || []);
    return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
};
exports.computeAverageLeafProgress = computeAverageLeafProgress;
/** Recursively saves a (possibly nested) list of subtasks under an optional parent subtask. */
const saveSubTasks = async (parsedSubTasks, taskId, tx = prisma_1.prisma, parentSubTaskId) => {
    for (const subTaskData of parsedSubTasks) {
        if (!subTaskData.title)
            continue;
        const rawEstimatedDays = subTaskData.estimatedDays;
        const estimatedDays = rawEstimatedDays !== undefined && rawEstimatedDays !== null && rawEstimatedDays !== ""
            ? Number(rawEstimatedDays)
            : undefined;
        const subTask = await tx.subTask.create({
            data: {
                title: subTaskData.title,
                taskId,
                ...(estimatedDays !== undefined && Number.isFinite(estimatedDays) && estimatedDays >= 0
                    ? { estimatedDays }
                    : {}),
                ...(parentSubTaskId !== undefined ? { parentId: parentSubTaskId } : {}),
            },
        });
        if (Array.isArray(subTaskData.subTasks) &&
            subTaskData.subTasks.length > 0) {
            await (0, exports.saveSubTasks)(subTaskData.subTasks, taskId, tx, subTask.id);
        }
    }
};
exports.saveSubTasks = saveSubTasks;
//# sourceMappingURL=subtaskTree.js.map