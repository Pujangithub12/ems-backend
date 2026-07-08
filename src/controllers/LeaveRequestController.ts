import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { LeaveRequest } from "../entities/LeaveRequest";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateLeaveRequestDto,
  UpdateLeaveRequestDto,
  UpdateLeaveRequestStatusDto,
} from "../dto/leave-request.dto";

// `user` is an eager relation on LeaveRequest, so it is always populated
// (and includes the password hash) regardless of the `relations` option
// passed to the query — strip it before sending requests to the client.
const sanitizeUser = (lr: LeaveRequest) => {
  if (lr.user) {
    const { id, fullName, email } = lr.user;
    lr.user = { id, fullName, email } as User;
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
      const userRepository = AppDataSource.getRepository(User);
      const lrRepository = AppDataSource.getRepository(LeaveRequest);
      const workspace = req.workspace!;

      const user = await userRepository.findOne({
        where: { id: userId as number },
      });
      if (!user) return res.status(404).json({ message: "User not found" });

      const newRequest = lrRepository.create({
        user,
        title,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        status: "pending",
        workspace
      });

      await lrRepository.save(newRequest);
      sanitizeUser(newRequest);

      return res
        .status(201)
        .json({ message: "Leave request created", leaveRequest: newRequest });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getAllLeaveRequests = async (req: AuthRequest, res: Response) => {
    try {
      const lrRepository = AppDataSource.getRepository(LeaveRequest);
      const workspace = req.workspace!;

      if (
        req.user?.role === UserRole.ADMIN ||
        req.user?.role === UserRole.SUPER_ADMIN
      ) {
        const all = await lrRepository.find({
          where: { workspace: { id: workspace.id } },
          order: { createdAt: "DESC" },
          relations: ["user"],
        });

        // Add history count for admin
        const requestsWithHistory = await Promise.all(
          all.map(async (lr) => {
            const historyCount = await lrRepository.count({
              where: {
                user: { id: lr.user.id },
                status: "approved",
                workspace: { id: workspace.id }
              },
            });
            sanitizeUser(lr);
            return { ...lr, historyCount };
          }),
        );

        return res.status(200).json(requestsWithHistory);
      }

      const mine = await lrRepository.find({
        where: {
          user: { id: req.user?.id },
          workspace: { id: workspace.id }
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

      const lrRepository = AppDataSource.getRepository(LeaveRequest);
      const workspace = req.workspace!;
      const lr = await lrRepository.findOne({
        where: { 
          id: parseInt(id as string),
          workspace: { id: workspace.id }
        },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      lr.status = status;
      await lrRepository.save(lr);
      sanitizeUser(lr);

      return res
        .status(200)
        .json({ message: `Leave request ${status}`, leaveRequest: lr });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getLeaveRequestById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const lrRepository = AppDataSource.getRepository(LeaveRequest);
      const workspace = req.workspace!;
      const lr = await lrRepository.findOne({
        where: { 
          id: parseInt(id as string),
          workspace: { id: workspace.id }
        },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        lr.user.id !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      sanitizeUser(lr);
      return res.status(200).json(lr);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateLeaveRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { startDate, endDate, reason }: UpdateLeaveRequestDto = req.body;

    try {
      const lrRepository = AppDataSource.getRepository(LeaveRequest);
      const workspace = req.workspace!;
      const lr = await lrRepository.findOne({
        where: { 
          id: parseInt(id as string),
          workspace: { id: workspace.id }
        },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        lr.user.id !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (startDate) lr.startDate = new Date(startDate);
      if (endDate) lr.endDate = new Date(endDate);
      if (reason) lr.reason = reason;

      await lrRepository.save(lr);
      sanitizeUser(lr);

      return res
        .status(200)
        .json({ message: "Leave request updated", leaveRequest: lr });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
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

      const lrRepository = AppDataSource.getRepository(LeaveRequest);
      const workspace = req.workspace!;
      const lr = await lrRepository.findOne({
        where: { 
          id: parseInt(id as string),
          workspace: { id: workspace.id }
        },
      });

      if (!lr)
        return res.status(404).json({ message: "Leave request not found" });

      await lrRepository.remove(lr);

      return res.status(200).json({ message: "Leave request deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
