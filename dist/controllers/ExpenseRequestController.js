"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseRequestController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const hierarchyAuthority_1 = require("../utils/hierarchyAuthority");
// `user` was an eager relation on ExpenseRequest under TypeORM, so it was
// always populated (and included the password hash) regardless of the
// `relations` option passed to the query. Prisma has no eager-loading
// concept, so every query below explicitly `include`s `user` — this still
// strips it down to the safe subset before sending requests to the client.
const sanitizeUser = (er) => {
    if (er.user) {
        const { id, fullName, email } = er.user;
        er.user = { id, fullName, email };
    }
};
class ExpenseRequestController {
    static createExpenseRequest = async (req, res) => {
        const { title, amount, category, expenseDate, reason } = req.body;
        if (!title || amount == null || !category || !expenseDate || !reason) {
            return res.status(400).json({
                message: "title, amount, category, expenseDate and reason are required",
            });
        }
        try {
            const userId = req.user?.id;
            const organization = req.organization;
            const user = await prisma_1.prisma.user.findFirst({
                where: { id: userId },
            });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const newRequest = await prisma_1.prisma.expenseRequest.create({
                data: {
                    userId: user.id,
                    title,
                    amount,
                    category,
                    expenseDate: new Date(expenseDate),
                    reason,
                    status: "pending",
                    organizationId: organization.id,
                },
            });
            const expenseRequest = { ...newRequest, user };
            sanitizeUser(expenseRequest);
            return res
                .status(201)
                .json({ message: "Expense request created", expenseRequest });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getAllExpenseRequests = async (req, res) => {
        try {
            const organization = req.organization;
            if (req.user?.role === enums_1.UserRole.ADMIN ||
                req.user?.role === enums_1.UserRole.SUPER_ADMIN ||
                req.user?.role === enums_1.UserRole.FINANCE) {
                const all = await prisma_1.prisma.expenseRequest.findMany({
                    where: { organizationId: organization.id },
                    orderBy: { createdAt: "desc" },
                    include: { user: true },
                });
                const shaped = all.map((er) => {
                    const e = { ...er };
                    sanitizeUser(e);
                    return e;
                });
                return res.status(200).json(shaped);
            }
            const mine = await prisma_1.prisma.expenseRequest.findMany({
                where: {
                    userId: req.user.id,
                    organizationId: organization.id,
                },
                orderBy: { createdAt: "desc" },
                include: { user: true },
            });
            const mineShaped = mine.map((er) => {
                const e = { ...er };
                sanitizeUser(e);
                return e;
            });
            return res.status(200).json(mineShaped);
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
            const organization = req.organization;
            const er = await prisma_1.prisma.expenseRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!er)
                return res.status(404).json({ message: "Expense request not found" });
            // Finance keeps its own unconditional, cross-cutting approval power
            // (it approves cost matters company-wide, not as anyone's manager) —
            // everyone else must be this requester's nearest admin ancestor.
            if (req.user.role !== enums_1.UserRole.FINANCE) {
                const allowed = await (0, hierarchyAuthority_1.canApprove)(organization.id, req.user.id, req.user.role, er.userId);
                if (!allowed) {
                    return res.status(403).json({
                        message: "Only this person's manager can approve this request",
                    });
                }
            }
            const updated = await prisma_1.prisma.expenseRequest.update({
                where: { id: er.id },
                data: { status: status, approvedAt: new Date() },
            });
            const expenseRequest = { ...updated, user: er.user };
            sanitizeUser(expenseRequest);
            return res
                .status(200)
                .json({ message: `Expense request ${status}`, expenseRequest });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getExpenseRequestById = async (req, res) => {
        const { id } = req.params;
        try {
            const organization = req.organization;
            const er = await prisma_1.prisma.expenseRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!er)
                return res.status(404).json({ message: "Expense request not found" });
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN &&
                req.user?.role !== enums_1.UserRole.FINANCE &&
                er.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const shaped = { ...er };
            sanitizeUser(shaped);
            return res.status(200).json(shaped);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateExpenseRequest = async (req, res) => {
        const { id } = req.params;
        const { amount, category, expenseDate, reason } = req.body;
        try {
            const organization = req.organization;
            const er = await prisma_1.prisma.expenseRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!er)
                return res.status(404).json({ message: "Expense request not found" });
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN &&
                er.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const data = {};
            if (amount != null)
                data.amount = amount;
            if (category)
                data.category = category;
            if (expenseDate)
                data.expenseDate = new Date(expenseDate);
            if (reason)
                data.reason = reason;
            const updated = await prisma_1.prisma.expenseRequest.update({
                where: { id: er.id },
                data,
            });
            const expenseRequest = { ...updated, user: er.user };
            sanitizeUser(expenseRequest);
            return res
                .status(200)
                .json({ message: "Expense request updated", expenseRequest });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteExpenseRequest = async (req, res) => {
        const { id } = req.params;
        try {
            const organization = req.organization;
            const er = await prisma_1.prisma.expenseRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
            });
            if (!er)
                return res.status(404).json({ message: "Expense request not found" });
            await prisma_1.prisma.expenseRequest.delete({ where: { id: er.id } });
            return res.status(200).json({ message: "Expense request deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.ExpenseRequestController = ExpenseRequestController;
//# sourceMappingURL=ExpenseRequestController.js.map