import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { SiteVisitRequest } from "../entities/SiteVisitRequest";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateSiteVisitRequestDto,
  UpdateSiteVisitRequestDto,
  UpdateSiteVisitRequestStatusDto,
} from "../dto/site-visit-request.dto";
import { canApprove } from "../utils/hierarchyAuthority";

// `user` is an eager relation on SiteVisitRequest, so it is always populated
// (and includes the password hash) regardless of the `relations` option
// passed to the query — strip it before sending requests to the client.
const sanitizeUser = (sv: SiteVisitRequest) => {
  if (sv.user) {
    const { id, fullName, email } = sv.user;
    sv.user = { id, fullName, email } as User;
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
      const userRepository = AppDataSource.getRepository(User);
      const svRepository = AppDataSource.getRepository(SiteVisitRequest);
      const workspace = req.workspace!;

      const user = await userRepository.findOne({
        where: { id: userId as number },
      });
      if (!user) return res.status(404).json({ message: "User not found" });

      const newRequest = svRepository.create({
        user,
        title,
        location,
        visitDate: new Date(visitDate),
        reason,
        status: "pending",
        workspace,
      });

      await svRepository.save(newRequest);
      sanitizeUser(newRequest);

      return res
        .status(201)
        .json({ message: "Site visit request created", siteVisitRequest: newRequest });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getAllSiteVisitRequests = async (req: AuthRequest, res: Response) => {
    try {
      const svRepository = AppDataSource.getRepository(SiteVisitRequest);
      const workspace = req.workspace!;

      if (
        req.user?.role === UserRole.ADMIN ||
        req.user?.role === UserRole.SUPER_ADMIN
      ) {
        const all = await svRepository.find({
          where: { workspace: { id: workspace.id } },
          order: { createdAt: "DESC" },
          relations: ["user"],
        });
        all.forEach(sanitizeUser);
        return res.status(200).json(all);
      }

      const mine = await svRepository.find({
        where: {
          user: { id: req.user?.id },
          workspace: { id: workspace.id },
        },
        order: { createdAt: "DESC" },
      } as any);
      mine.forEach(sanitizeUser);

      return res.status(200).json(mine);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status }: UpdateSiteVisitRequestStatusDto = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      const svRepository = AppDataSource.getRepository(SiteVisitRequest);
      const workspace = req.workspace!;
      const sv = await svRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      const allowed = await canApprove(
        workspace.id,
        req.user!.id,
        req.user!.role,
        sv.user.id,
      );
      if (!allowed) {
        return res.status(403).json({
          message: "Only this person's manager can approve this request",
        });
      }

      sv.status = status;
      sv.approvedAt = status === "approved" ? new Date() : null;
      await svRepository.save(sv);
      sanitizeUser(sv);

      return res
        .status(200)
        .json({ message: `Site visit request ${status}`, siteVisitRequest: sv });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getSiteVisitRequestById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const svRepository = AppDataSource.getRepository(SiteVisitRequest);
      const workspace = req.workspace!;
      const sv = await svRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        sv.user.id !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      sanitizeUser(sv);
      return res.status(200).json(sv);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateSiteVisitRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { location, visitDate, reason }: UpdateSiteVisitRequestDto = req.body;

    try {
      const svRepository = AppDataSource.getRepository(SiteVisitRequest);
      const workspace = req.workspace!;
      const sv = await svRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        sv.user.id !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (location) sv.location = location;
      if (visitDate) sv.visitDate = new Date(visitDate);
      if (reason) sv.reason = reason;

      await svRepository.save(sv);
      sanitizeUser(sv);

      return res
        .status(200)
        .json({ message: "Site visit request updated", siteVisitRequest: sv });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteSiteVisitRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const svRepository = AppDataSource.getRepository(SiteVisitRequest);
      const workspace = req.workspace!;
      const sv = await svRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!sv)
        return res.status(404).json({ message: "Site visit request not found" });

      await svRepository.remove(sv);

      return res.status(200).json({ message: "Site visit request deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
