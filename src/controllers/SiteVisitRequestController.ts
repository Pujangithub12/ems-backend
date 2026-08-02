import { Response } from "express";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateSiteVisitRequestDto,
  UpdateSiteVisitRequestDto,
  UpdateSiteVisitRequestStatusDto,
} from "../dto/site-visit-request.dto";
import { canApprove } from "../utils/hierarchyAuthority";
import { notifyUsers, getUserIdsByRole } from "../services/notificationService";

// `user` was an eager relation on SiteVisitRequest under TypeORM, so it was
// always populated (and included the password hash) regardless of the
// `relations` option passed to the query. Prisma has no eager-loading
// concept, so every query below explicitly `include`s `user` — this still
// strips it down to the safe subset before sending requests to the client.
const sanitizeUser = (sv: any) => {
  if (sv.user) {
    const { id, fullName, email } = sv.user;
    sv.user = { id, fullName, email };
  }
};

export class SiteVisitRequestController {
  static createSiteVisitRequest = async (req: AuthRequest, res: Response) => {
    const { title, location, visitDate, reason }: CreateSiteVisitRequestDto = req.body;

    if (!title || !location || !visitDate || !reason) {
      return res
        .status(400)
        .json({ message: "title, location, visitDate and reason are required" });
    }

    try {
      const userId = req.user?.id;
      const organization = req.organization!;

      const user = await prisma.user.findFirst({
        where: { id: userId as number },
      });
      if (!user) return res.status(404).json({ message: "User not found" });

      const newRequest = await prisma.siteVisitRequest.create({
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

      const siteVisitRequest: any = { ...newRequest, user };
      sanitizeUser(siteVisitRequest);

      getUserIdsByRole(organization.id, [UserRole.ADMIN, UserRole.SUPER_ADMIN])
        .then((approverIds) =>
          notifyUsers(
            approverIds.filter((id) => id !== user.id),
            {
              organizationId: organization.id,
              type: "approval_requested",
              title: "New site visit request",
              message: `${user.fullName} submitted a site visit request: "${title}"`,
              link: `/${organization.id}/leaverequests`,
            },
          ),
        )
        .catch((err) => console.error("Failed to send site-visit-request notification:", err));

      return res
        .status(201)
        .json({ message: "Site visit request created", siteVisitRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getAllSiteVisitRequests = async (req: AuthRequest, res: Response) => {
    try {
      const organization = req.organization!;

      if (
        req.user?.role === UserRole.ADMIN ||
        req.user?.role === UserRole.SUPER_ADMIN
      ) {
        const all = await prisma.siteVisitRequest.findMany({
          where: { organizationId: organization.id },
          orderBy: { createdAt: "desc" },
          include: { user: true },
        });
        const shaped = all.map((sv) => {
          const s: any = { ...sv };
          sanitizeUser(s);
          return s;
        });
        return res.status(200).json(shaped);
      }

      const mine = await prisma.siteVisitRequest.findMany({
        where: {
          userId: req.user!.id,
          organizationId: organization.id,
        },
        orderBy: { createdAt: "desc" },
        include: { user: true },
      });
      const mineShaped = mine.map((sv) => {
        const s: any = { ...sv };
        sanitizeUser(s);
        return s;
      });

      return res.status(200).json(mineShaped);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status }: UpdateSiteVisitRequestStatusDto = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      const organization = req.organization!;
      const sv = await prisma.siteVisitRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      const allowed = await canApprove(
        organization.id,
        req.user!.id,
        req.user!.role,
        sv.userId as number,
      );
      if (!allowed) {
        return res.status(403).json({
          message: "Only this person's manager can approve this request",
        });
      }

      const updated = await prisma.siteVisitRequest.update({
        where: { id: sv.id },
        data: { status: status as "approved" | "rejected", approvedAt: new Date() },
      });

      const siteVisitRequest: any = { ...updated, user: sv.user };
      sanitizeUser(siteVisitRequest);

      if (sv.userId) {
        notifyUsers([sv.userId], {
          organizationId: organization.id,
          type: "approval_decided",
          title: `Site visit request ${status}`,
          message: `Your site visit request "${sv.title}" was ${status}`,
          link: `/${organization.id}/leaverequests`,
        }).catch((err) => console.error("Failed to send site-visit-decision notification:", err));
      }

      return res
        .status(200)
        .json({ message: `Site visit request ${status}`, siteVisitRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getSiteVisitRequestById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const organization = req.organization!;
      const sv = await prisma.siteVisitRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        sv.userId !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const shaped: any = { ...sv };
      sanitizeUser(shaped);
      return res.status(200).json(shaped);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateSiteVisitRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { location, visitDate, reason }: UpdateSiteVisitRequestDto = req.body;

    try {
      const organization = req.organization!;
      const sv = await prisma.siteVisitRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        sv.userId !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const data: { location?: string; visitDate?: Date; reason?: string } = {};
      if (location) data.location = location;
      if (visitDate) data.visitDate = new Date(visitDate);
      if (reason) data.reason = reason;

      const updated = await prisma.siteVisitRequest.update({
        where: { id: sv.id },
        data,
      });

      const siteVisitRequest: any = { ...updated, user: sv.user };
      sanitizeUser(siteVisitRequest);

      return res
        .status(200)
        .json({ message: "Site visit request updated", siteVisitRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static deleteSiteVisitRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const organization = req.organization!;
      const sv = await prisma.siteVisitRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      await prisma.siteVisitRequest.delete({ where: { id: sv.id } });

      return res.status(200).json({ message: "Site visit request deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
