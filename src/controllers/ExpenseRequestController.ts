import { Response } from "express";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateExpenseRequestDto,
  UpdateExpenseRequestDto,
  UpdateExpenseRequestStatusDto,
} from "../dto/expense-request.dto";
import { canApprove } from "../utils/hierarchyAuthority";
import { notifyUsers, getUserIdsByRole } from "../services/notificationService";

// `user` was an eager relation on ExpenseRequest under TypeORM, so it was
// always populated (and included the password hash) regardless of the
// `relations` option passed to the query. Prisma has no eager-loading
// concept, so every query below explicitly `include`s `user` — this still
// strips it down to the safe subset before sending requests to the client.
const sanitizeUser = (er: any) => {
  if (er.user) {
    const { id, fullName, email } = er.user;
    er.user = { id, fullName, email };
  }
};

export class ExpenseRequestController {
  static createExpenseRequest = async (req: AuthRequest, res: Response) => {
    const { title, amount, category, expenseDate, reason }: CreateExpenseRequestDto =
      req.body;

    if (!title || amount == null || !category || !expenseDate || !reason) {
      return res.status(400).json({
        message: "title, amount, category, expenseDate and reason are required",
      });
    }

    try {
      const userId = req.user?.id;
      const organization = req.organization!;

      const user = await prisma.user.findFirst({
        where: { id: userId as number },
      });
      if (!user) return res.status(404).json({ message: "User not found" });

      const newRequest = await prisma.expenseRequest.create({
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

      const expenseRequest: any = { ...newRequest, user };
      sanitizeUser(expenseRequest);

      getUserIdsByRole(organization.id, [
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
        UserRole.FINANCE,
      ])
        .then((approverIds) =>
          notifyUsers(
            approverIds.filter((id) => id !== user.id),
            {
              organizationId: organization.id,
              type: "approval_requested",
              title: "New expense request",
              message: `${user.fullName} submitted an expense request: "${title}"`,
              link: `/${organization.id}/leaverequests`,
            },
          ),
        )
        .catch((err) => console.error("Failed to send expense-request notification:", err));

      return res
        .status(201)
        .json({ message: "Expense request created", expenseRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getAllExpenseRequests = async (req: AuthRequest, res: Response) => {
    try {
      const organization = req.organization!;

      if (
        req.user?.role === UserRole.ADMIN ||
        req.user?.role === UserRole.SUPER_ADMIN ||
        req.user?.role === UserRole.FINANCE
      ) {
        const all = await prisma.expenseRequest.findMany({
          where: { organizationId: organization.id },
          orderBy: { createdAt: "desc" },
          include: { user: true },
        });
        const shaped = all.map((er) => {
          const e: any = { ...er };
          sanitizeUser(e);
          return e;
        });
        return res.status(200).json(shaped);
      }

      const mine = await prisma.expenseRequest.findMany({
        where: {
          userId: req.user!.id,
          organizationId: organization.id,
        },
        orderBy: { createdAt: "desc" },
        include: { user: true },
      });
      const mineShaped = mine.map((er) => {
        const e: any = { ...er };
        sanitizeUser(e);
        return e;
      });

      return res.status(200).json(mineShaped);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status }: UpdateExpenseRequestStatusDto = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      const organization = req.organization!;
      const er = await prisma.expenseRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      // Finance keeps its own unconditional, cross-cutting approval power
      // (it approves cost matters company-wide, not as anyone's manager) —
      // everyone else must be this requester's nearest admin ancestor.
      if (req.user!.role !== UserRole.FINANCE) {
        const allowed = await canApprove(
          organization.id,
          req.user!.id,
          req.user!.role,
          er.userId as number,
        );
        if (!allowed) {
          return res.status(403).json({
            message: "Only this person's manager can approve this request",
          });
        }
      }

      const updated = await prisma.expenseRequest.update({
        where: { id: er.id },
        data: { status: status as "approved" | "rejected", approvedAt: new Date() },
      });

      const expenseRequest: any = { ...updated, user: er.user };
      sanitizeUser(expenseRequest);

      if (er.userId) {
        notifyUsers([er.userId], {
          organizationId: organization.id,
          type: "approval_decided",
          title: `Expense request ${status}`,
          message: `Your expense request "${er.title}" was ${status}`,
          link: `/${organization.id}/leaverequests`,
        }).catch((err) => console.error("Failed to send expense-decision notification:", err));
      }

      return res
        .status(200)
        .json({ message: `Expense request ${status}`, expenseRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getExpenseRequestById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const organization = req.organization!;
      const er = await prisma.expenseRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        req.user?.role !== UserRole.FINANCE &&
        er.userId !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const shaped: any = { ...er };
      sanitizeUser(shaped);
      return res.status(200).json(shaped);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateExpenseRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { amount, category, expenseDate, reason }: UpdateExpenseRequestDto = req.body;

    try {
      const organization = req.organization!;
      const er = await prisma.expenseRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        er.userId !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const data: {
        amount?: number;
        category?: string;
        expenseDate?: Date;
        reason?: string;
      } = {};
      if (amount != null) data.amount = amount;
      if (category) data.category = category;
      if (expenseDate) data.expenseDate = new Date(expenseDate);
      if (reason) data.reason = reason;

      const updated = await prisma.expenseRequest.update({
        where: { id: er.id },
        data,
      });

      const expenseRequest: any = { ...updated, user: er.user };
      sanitizeUser(expenseRequest);

      return res
        .status(200)
        .json({ message: "Expense request updated", expenseRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static deleteExpenseRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const organization = req.organization!;
      const er = await prisma.expenseRequest.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      await prisma.expenseRequest.delete({ where: { id: er.id } });

      return res.status(200).json({ message: "Expense request deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
