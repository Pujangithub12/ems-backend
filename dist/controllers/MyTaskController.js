"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MyTaskController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
class MyTaskController {
    static createMyTask = async (req, res) => {
        const { title, description, dueDate } = req.body;
        if (!title) {
            return res.status(400).json({ message: "Task title is required" });
        }
        try {
            const organization = req.organization;
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: req.user?.id },
            });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            const myTask = await prisma_1.prisma.myTask.create({
                data: {
                    title,
                    ...(description !== undefined ? { description } : {}),
                    status: enums_1.MyTaskStatus.PENDING,
                    userId: user.id,
                    organizationId: organization.id,
                    ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
                },
            });
            return res
                .status(201)
                .json({ message: "Personal task added", task: myTask });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getMyTasks = async (req, res) => {
        try {
            const userId = req.user?.id;
            const organization = req.organization;
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const tasks = await prisma_1.prisma.myTask.findMany({
                where: { userId, organizationId: organization.id },
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json(tasks);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateMyTask = async (req, res) => {
        const { id } = req.params;
        const { title, description, dueDate, status } = req.body;
        try {
            const organization = req.organization;
            const myTask = await prisma_1.prisma.myTask.findFirst({
                where: {
                    id: parseInt(id, 10),
                    organizationId: organization.id,
                },
            });
            if (!myTask) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (myTask.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const data = {};
            if (title !== undefined)
                data.title = title;
            if (description !== undefined)
                data.description = description;
            if (dueDate !== undefined) {
                data.dueDate = dueDate ? new Date(dueDate) : null;
            }
            if (status &&
                Object.values(enums_1.MyTaskStatus).includes(status)) {
                data.status = status;
            }
            const updated = await prisma_1.prisma.myTask.update({
                where: { id: myTask.id },
                data,
            });
            return res.status(200).json({ message: "Task updated", task: updated });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteMyTask = async (req, res) => {
        const { id } = req.params;
        try {
            const organization = req.organization;
            const myTask = await prisma_1.prisma.myTask.findFirst({
                where: {
                    id: parseInt(id, 10),
                    organizationId: organization.id,
                },
            });
            if (!myTask) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (myTask.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            await prisma_1.prisma.myTask.delete({ where: { id: myTask.id } });
            return res.status(200).json({ message: "Task deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.MyTaskController = MyTaskController;
//# sourceMappingURL=MyTaskController.js.map