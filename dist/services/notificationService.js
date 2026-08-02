"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOrganization = exports.getUserIdsByRole = exports.notifyUsers = void 0;
const prisma_1 = require("../config/prisma");
const socket_1 = require("../realtime/socket");
// Persists one Notification row per recipient and, for whoever is currently
// connected, pushes it live over their `user:{id}` socket room — the DB write
// happens regardless of connection state so a notification is still there
// (via GET /api/notifications) next time that user logs in.
const notifyUsers = async (userIds, payload) => {
    const uniqueIds = Array.from(new Set(userIds)).filter((id) => Number.isInteger(id));
    if (uniqueIds.length === 0)
        return;
    const rows = await prisma_1.prisma.$transaction(uniqueIds.map((userId) => prisma_1.prisma.notification.create({
        data: {
            userId,
            organizationId: payload.organizationId,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            link: payload.link ?? null,
        },
    })));
    const io = (0, socket_1.getIO)();
    if (!io)
        return;
    for (const row of rows) {
        io.to((0, socket_1.userRoom)(row.userId)).emit("notification:new", row);
    }
};
exports.notifyUsers = notifyUsers;
// Notifies every member of an organization except (optionally) the actor who
// triggered the event — used for announcements, which have no per-recipient
// targeting of their own beyond targetType="all"/"specific" email lists.
// Resolves which org members currently hold any of the given roles — used to
// target approval-request notifications at admins (and finance, for expense
// requests) without hardcoding user ids.
const getUserIdsByRole = async (organizationId, roles) => {
    const memberships = await prisma_1.prisma.organizationMembership.findMany({
        where: { organizationId, role: { in: roles } },
        select: { userId: true },
    });
    return memberships.map((m) => m.userId);
};
exports.getUserIdsByRole = getUserIdsByRole;
const notifyOrganization = async (organizationId, payload, excludeUserId) => {
    const memberships = await prisma_1.prisma.organizationMembership.findMany({
        where: { organizationId },
        select: { userId: true },
    });
    const userIds = memberships
        .map((m) => m.userId)
        .filter((id) => id !== excludeUserId);
    await (0, exports.notifyUsers)(userIds, payload);
};
exports.notifyOrganization = notifyOrganization;
//# sourceMappingURL=notificationService.js.map