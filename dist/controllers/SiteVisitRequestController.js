"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteVisitRequestController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const hierarchyAuthority_1 = require("../utils/hierarchyAuthority");
// `user` was an eager relation on SiteVisitRequest under TypeORM, so it was
// always populated (and included the password hash) regardless of the
// `relations` option passed to the query. Prisma has no eager-loading
// concept, so every query below explicitly `include`s `user` — this still
// strips it down to the safe subset before sending requests to the client.
const sanitizeUser = (sv) => {
    if (sv.user) {
        const { id, fullName, email } = sv.user;
        sv.user = { id, fullName, email };
    }
};
class SiteVisitRequestController {
    static createSiteVisitRequest = async (req, res) => {
        const { title, location, visitDate, reason } = req.body;
        if (!title || !location || !visitDate || !reason) {
            return res
                .status(400)
                .json({ message: "title, location, visitDate and reason are required" });
        }
        try {
            const userId = req.user?.id;
            const organization = req.organization;
            const user = await prisma_1.prisma.user.findFirst({
                where: { id: userId },
            });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const newRequest = await prisma_1.prisma.siteVisitRequest.create({
                data: {
                    userId: user.id,
                    title,
                    location,
                    visitDate: new Date(visitDate),
                    reason,
                    status: "pending",
                    organizationId: organization.id,
                },
            });
            const siteVisitRequest = { ...newRequest, user };
            sanitizeUser(siteVisitRequest);
            return res
                .status(201)
                .json({ message: "Site visit request created", siteVisitRequest });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getAllSiteVisitRequests = async (req, res) => {
        try {
            const organization = req.organization;
            if (req.user?.role === enums_1.UserRole.ADMIN ||
                req.user?.role === enums_1.UserRole.SUPER_ADMIN) {
                const all = await prisma_1.prisma.siteVisitRequest.findMany({
                    where: { organizationId: organization.id },
                    orderBy: { createdAt: "desc" },
                    include: { user: true },
                });
                const shaped = all.map((sv) => {
                    const s = { ...sv };
                    sanitizeUser(s);
                    return s;
                });
                return res.status(200).json(shaped);
            }
            const mine = await prisma_1.prisma.siteVisitRequest.findMany({
                where: {
                    userId: req.user.id,
                    organizationId: organization.id,
                },
                orderBy: { createdAt: "desc" },
                include: { user: true },
            });
            const mineShaped = mine.map((sv) => {
                const s = { ...sv };
                sanitizeUser(s);
                return s;
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
            const sv = await prisma_1.prisma.siteVisitRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!sv)
                return res.status(404).json({ message: "Site visit request not found" });
            const allowed = await (0, hierarchyAuthority_1.canApprove)(organization.id, req.user.id, req.user.role, sv.userId);
            if (!allowed) {
                return res.status(403).json({
                    message: "Only this person's manager can approve this request",
                });
            }
            const updated = await prisma_1.prisma.siteVisitRequest.update({
                where: { id: sv.id },
                data: { status: status, approvedAt: new Date() },
            });
            const siteVisitRequest = { ...updated, user: sv.user };
            sanitizeUser(siteVisitRequest);
            return res
                .status(200)
                .json({ message: `Site visit request ${status}`, siteVisitRequest });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getSiteVisitRequestById = async (req, res) => {
        const { id } = req.params;
        try {
            const organization = req.organization;
            const sv = await prisma_1.prisma.siteVisitRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!sv)
                return res.status(404).json({ message: "Site visit request not found" });
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN &&
                sv.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const shaped = { ...sv };
            sanitizeUser(shaped);
            return res.status(200).json(shaped);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateSiteVisitRequest = async (req, res) => {
        const { id } = req.params;
        const { location, visitDate, reason } = req.body;
        try {
            const organization = req.organization;
            const sv = await prisma_1.prisma.siteVisitRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!sv)
                return res.status(404).json({ message: "Site visit request not found" });
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN &&
                sv.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const data = {};
            if (location)
                data.location = location;
            if (visitDate)
                data.visitDate = new Date(visitDate);
            if (reason)
                data.reason = reason;
            const updated = await prisma_1.prisma.siteVisitRequest.update({
                where: { id: sv.id },
                data,
            });
            const siteVisitRequest = { ...updated, user: sv.user };
            sanitizeUser(siteVisitRequest);
            return res
                .status(200)
                .json({ message: "Site visit request updated", siteVisitRequest });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteSiteVisitRequest = async (req, res) => {
        const { id } = req.params;
        try {
            const organization = req.organization;
            const sv = await prisma_1.prisma.siteVisitRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
            });
            if (!sv)
                return res.status(404).json({ message: "Site visit request not found" });
            await prisma_1.prisma.siteVisitRequest.delete({ where: { id: sv.id } });
            return res.status(200).json({ message: "Site visit request deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.SiteVisitRequestController = SiteVisitRequestController;
//# sourceMappingURL=SiteVisitRequestController.js.map