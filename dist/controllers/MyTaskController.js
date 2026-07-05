"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MyTaskController = void 0;
const data_source_1 = require("../config/data-source");
const MyTask_1 = require("../entities/MyTask");
const User_1 = require("../entities/User");
class MyTaskController {
    static createMyTask = async (req, res) => {
        const { title, description, dueDate } = req.body;
        if (!title) {
            return res.status(400).json({ message: "Task title is required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const myTaskRepository = data_source_1.AppDataSource.getRepository(MyTask_1.MyTask);
            const workspace = req.workspace;
            const user = await userRepository.findOneBy({
                id: req.user?.id,
            });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            const taskPayload = {
                title,
                ...(description !== undefined ? { description } : {}),
                status: MyTask_1.MyTaskStatus.PENDING,
                user,
                workspace
            };
            if (dueDate) {
                taskPayload.dueDate = new Date(dueDate);
            }
            const myTask = myTaskRepository.create(taskPayload);
            await myTaskRepository.save(myTask);
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
            const myTaskRepository = data_source_1.AppDataSource.getRepository(MyTask_1.MyTask);
            const userId = req.user?.id;
            const workspace = req.workspace;
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const tasks = await myTaskRepository.find({
                where: { user: { id: userId }, workspace: { id: workspace.id } },
                order: { createdAt: "DESC" },
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
            const myTaskRepository = data_source_1.AppDataSource.getRepository(MyTask_1.MyTask);
            const workspace = req.workspace;
            const myTask = await myTaskRepository.findOne({
                where: {
                    id: parseInt(id, 10),
                    workspace: { id: workspace.id }
                },
                relations: ["user"],
            });
            if (!myTask) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (myTask.user.id !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            if (title !== undefined)
                myTask.title = title;
            if (description !== undefined)
                myTask.description = description;
            if (dueDate !== undefined) {
                myTask.dueDate = dueDate ? new Date(dueDate) : null;
            }
            if (status &&
                Object.values(MyTask_1.MyTaskStatus).includes(status)) {
                myTask.status = status;
            }
            await myTaskRepository.save(myTask);
            return res.status(200).json({ message: "Task updated", task: myTask });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteMyTask = async (req, res) => {
        const { id } = req.params;
        try {
            const myTaskRepository = data_source_1.AppDataSource.getRepository(MyTask_1.MyTask);
            const workspace = req.workspace;
            const myTask = await myTaskRepository.findOne({
                where: {
                    id: parseInt(id, 10),
                    workspace: { id: workspace.id }
                },
                relations: ["user"],
            });
            if (!myTask) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (myTask.user.id !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            await myTaskRepository.remove(myTask);
            return res.status(200).json({ message: "Task deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.MyTaskController = MyTaskController;
//# sourceMappingURL=MyTaskController.js.map