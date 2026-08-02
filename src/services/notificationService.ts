import { prisma } from "../config/prisma";
import { getIO, userRoom } from "../realtime/socket";

export type NotificationType =
  | "task_assigned"
  | "task_completed"
  | "approval_requested"
  | "approval_decided"
  | "announcement";

interface NotifyPayload {
  organizationId: number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

// Persists one Notification row per recipient and, for whoever is currently
// connected, pushes it live over their `user:{id}` socket room — the DB write
// happens regardless of connection state so a notification is still there
// (via GET /api/notifications) next time that user logs in.
export const notifyUsers = async (
  userIds: number[],
  payload: NotifyPayload,
): Promise<void> => {
  const uniqueIds = Array.from(new Set(userIds)).filter((id) => Number.isInteger(id));
  if (uniqueIds.length === 0) return;

  const rows = await prisma.$transaction(
    uniqueIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          organizationId: payload.organizationId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          link: payload.link ?? null,
        },
      }),
    ),
  );

  const io = getIO();
  if (!io) return;
  for (const row of rows) {
    io.to(userRoom(row.userId)).emit("notification:new", row);
  }
};

// Notifies every member of an organization except (optionally) the actor who
// triggered the event — used for announcements, which have no per-recipient
// targeting of their own beyond targetType="all"/"specific" email lists.
// Resolves which org members currently hold any of the given roles — used to
// target approval-request notifications at admins (and finance, for expense
// requests) without hardcoding user ids.
export const getUserIdsByRole = async (
  organizationId: number,
  roles: string[],
): Promise<number[]> => {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, role: { in: roles } },
    select: { userId: true },
  });
  return memberships.map((m) => m.userId);
};

export const notifyOrganization = async (
  organizationId: number,
  payload: NotifyPayload,
  excludeUserId?: number,
): Promise<void> => {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId },
    select: { userId: true },
  });
  const userIds = memberships
    .map((m) => m.userId)
    .filter((id) => id !== excludeUserId);
  await notifyUsers(userIds, payload);
};
