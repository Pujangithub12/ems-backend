import { Response } from "express";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateLeaveRequestDto,
  UpdateLeaveRequestDto,
  UpdateLeaveRequestStatusDto,
} from "../dto/leave-request.dto";
import { canApprove } from "../utils/hierarchyAuthority";
import { notifyUsers, getUserIdsByRole } from "../services/notificationService";

// `user` was an eager relation on LeaveRequest under TypeORM, so it was
// always populated (and included the password hash) regardless of the
// `relations` option passed to the query. Prisma has no eager-loading
// concept, so every query below explicitly `include`s `user` — this still
// strips it down to the safe subset before sending requests to the client.
const sanitizeUser = (lr: any) => {
  if (lr.user) {
    const { id, fullName, email } = lr.user;
    lr.user = { id, fullName, email };
  }
};

export class LeaveRequestController {
  static createLeaveRequest = async (req: AuthRequest, res: Response) => {
    const { title, startDate, endDate, reason }: CreateLeaveRequestDto = req.body;

    if (!title || !startDate || !endDate || !reason) {
      return res
        .status(400)
        .json({ message: "title, startDate, endDate and reason are required" });
    }

    try {
      const userId = req.user?.id;
      const organization = req.organization!;

      const user = await prisma.user.findFirst({
        where: { id: userId as number },
      });
      if (!user) return res.status(404).json({ message: "User not found" });

      const newRequest = await prisma.leaveRequest.create({
        data: {
          userId: user.id,
          title,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          reason,
          status: "pending",
          organizationId: organization.id,
        },
      });

      const leaveRequest: any = { ...newRequest, user };
      sanitizeUser(leaveRequest);

      getUserIdsByRole(organization.id, [UserRole.ADMIN, UserRole.SUPER_ADMIN])
        .then((approverIds) =>
          notifyUsers(
            approverIds.filter((id) => id !== user.id),
            {
              organizationId: organization.id,
              type: "approval_requested",
              title: "New leave request",
              message: `${user.fullName} submitted a leave request: "${title}"`,
              link: `/${organization.id}/leaverequests`,
            },
          ),
        )
        .catch((err) => console.error("Failed to send leave-request notification:", err));

      return res
        .status(201)
        .json({ message: "Leave request created", leaveRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getAllLeaveRequests = async (req: AuthRequest, res: Response) => {
    try {
      const organization = req.organization!;

      if (
        req.user?.role === UserRole.ADMIN ||
        req.user?.role === UserRole.SUPER_ADMIN
      ) {
        const all = await prisma.leaveRequest.findMany({
          where: { organizationId: organization.id },
          orderBy: { createdAt: "desc" },
          include: { user: true },
        });

        // Add history count for admin
        const requestsWithHistory = await Promise.all(
          all.map(async (lr) => {
            const historyCount = await prisma.leaveRequest.count({
              where: {
                userId: lr.userId as number,
                status: "approved",
                organizationId: organization.id,
              },
            });
            const shaped: any = { ...lr };
            sanitizeUser(shaped);
            return { ...shaped, historyCount };
          }),
        );

        return res.status(200).json(requestsWithHistory);
      }

      const mine = await prisma.leaveRequest.findMany({
        where: {
          userId: req.user!.id,
          organizationId: organization.id,
        },
        orderBy: { createdAt: "desc" },
        include: { user: true },
      });
      const mineShaped = mine.map((lr) => {
        const shaped: any = { ...lr };
        sanitizeUser(shaped);
        return shaped;
      });

      return res.status(200).json(mineShaped);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status }: UpdateLeaveRequestStatusDto = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const organization = req.organization!;
      const lr = await prisma.leaveRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      const allowed = await canApprove(
        organization.id,
        req.user!.id,
        req.user!.role,
        lr.userId as number,
      );
      if (!allowed) {
        return res.status(403).json({
          message: "Only this person's manager can approve this request",
        });
      }

      const updated = await prisma.leaveRequest.update({
        where: { id: lr.id },
        data: { status: status as "approved" | "rejected", approvedAt: new Date() },
      });

      const leaveRequest: any = { ...updated, user: lr.user };
      sanitizeUser(leaveRequest);

      if (lr.userId) {
        notifyUsers([lr.userId], {
          organizationId: organization.id,
          type: "approval_decided",
          title: `Leave request ${status}`,
          message: `Your leave request "${lr.title}" was ${status}`,
          link: `/${organization.id}/leaverequests`,
        }).catch((err) => console.error("Failed to send leave-decision notification:", err));
      }

      return res
        .status(200)
        .json({ message: `Leave request ${status}`, leaveRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getLeaveRequestById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const organization = req.organization!;
      const lr = await prisma.leaveRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        lr.userId !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const shaped: any = { ...lr };
      sanitizeUser(shaped);
      return res.status(200).json(shaped);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateLeaveRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { startDate, endDate, reason }: UpdateLeaveRequestDto = req.body;

    try {
      const organization = req.organization!;
      const lr = await prisma.leaveRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        lr.userId !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const data: { startDate?: Date; endDate?: Date; reason?: string } = {};
      if (startDate) data.startDate = new Date(startDate);
      if (endDate) data.endDate = new Date(endDate);
      if (reason) data.reason = reason;

      const updated = await prisma.leaveRequest.update({
        where: { id: lr.id },
        data,
      });

      const leaveRequest: any = { ...updated, user: lr.user };
      sanitizeUser(leaveRequest);

      return res
        .status(200)
        .json({ message: "Leave request updated", leaveRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static deleteLeaveRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const organization = req.organization!;
      const lr = await prisma.leaveRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      await prisma.leaveRequest.delete({ where: { id: lr.id } });

      return res.status(200).json({ message: "Leave request deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
