"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaveRequestController = void 0;
const data_source_1 = require("../config/data-source");
const LeaveRequest_1 = require("../entities/LeaveRequest");
const User_1 = require("../entities/User");
class LeaveRequestController {
    static createLeaveRequest = async (req, res) => {
        const { title, startDate, endDate, reason } = req.body;
        if (!title || !startDate || !endDate || !reason) {
            return res
                .status(400)
                .json({ message: "title, startDate, endDate and reason are required" });
        }
        try {
            const userId = req.user?.id;
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const lrRepository = data_source_1.AppDataSource.getRepository(LeaveRequest_1.LeaveRequest);
            const user = await userRepository.findOne({
                where: { id: userId },
            });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const newRequest = lrRepository.create({
                user,
                title,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason,
                status: "pending",
            });
            await lrRepository.save(newRequest);
            return res
                .status(201)
                .json({ message: "Leave request created", leaveRequest: newRequest });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getAllLeaveRequests = async (req, res) => {
        try {
            const lrRepository = data_source_1.AppDataSource.getRepository(LeaveRequest_1.LeaveRequest);
            if (req.user?.role === User_1.UserRole.ADMIN) {
                const all = await lrRepository.find({
                    order: { createdAt: "DESC" },
                    relations: ["user"],
                });
                // Add history count for admin
                const requestsWithHistory = await Promise.all(all.map(async (lr) => {
                    const historyCount = await lrRepository.count({
                        where: {
                            user: { id: lr.user.id },
                            status: "approved",
                        },
                    });
                    return { ...lr, historyCount };
                }));
                return res.status(200).json(requestsWithHistory);
            }
            const mine = await lrRepository.find({
                where: { user: { id: req.user?.id } },
                order: { createdAt: "DESC" },
            });
            return res.status(200).json(mine);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateStatus = async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }
        try {
            if (req.user?.role !== User_1.UserRole.ADMIN) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const lrRepository = data_source_1.AppDataSource.getRepository(LeaveRequest_1.LeaveRequest);
            const lr = await lrRepository.findOne({
                where: { id: parseInt(id) },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            lr.status = status;
            await lrRepository.save(lr);
            return res
                .status(200)
                .json({ message: `Leave request ${status}`, leaveRequest: lr });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getLeaveRequestById = async (req, res) => {
        const { id } = req.params;
        try {
            const lrRepository = data_source_1.AppDataSource.getRepository(LeaveRequest_1.LeaveRequest);
            const lr = await lrRepository.findOne({
                where: { id: parseInt(id) },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            if (req.user?.role !== User_1.UserRole.ADMIN && lr.user.id !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            return res.status(200).json(lr);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateLeaveRequest = async (req, res) => {
        const { id } = req.params;
        const { startDate, endDate, reason } = req.body;
        try {
            const lrRepository = data_source_1.AppDataSource.getRepository(LeaveRequest_1.LeaveRequest);
            const lr = await lrRepository.findOne({
                where: { id: parseInt(id) },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            if (req.user?.role !== User_1.UserRole.ADMIN && lr.user.id !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            if (startDate)
                lr.startDate = new Date(startDate);
            if (endDate)
                lr.endDate = new Date(endDate);
            if (reason)
                lr.reason = reason;
            await lrRepository.save(lr);
            return res
                .status(200)
                .json({ message: "Leave request updated", leaveRequest: lr });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteLeaveRequest = async (req, res) => {
        const { id } = req.params;
        try {
            if (req.user?.role !== User_1.UserRole.ADMIN) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const lrRepository = data_source_1.AppDataSource.getRepository(LeaveRequest_1.LeaveRequest);
            const lr = await lrRepository.findOne({
                where: { id: parseInt(id) },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            await lrRepository.remove(lr);
            return res.status(200).json({ message: "Leave request deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.LeaveRequestController = LeaveRequestController;
//# sourceMappingURL=LeaveRequestController.js.map