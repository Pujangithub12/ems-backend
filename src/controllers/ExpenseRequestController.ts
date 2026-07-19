import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { ExpenseRequest } from "../entities/ExpenseRequest";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateExpenseRequestDto,
  UpdateExpenseRequestDto,
  UpdateExpenseRequestStatusDto,
} from "../dto/expense-request.dto";
import { canApprove } from "../utils/hierarchyAuthority";

// `user` is an eager relation on ExpenseRequest, so it is always populated
// (and includes the password hash) regardless of the `relations` option
// passed to the query — strip it before sending requests to the client.
const sanitizeUser = (er: ExpenseRequest) => {
  if (er.user) {
    const { id, fullName, email } = er.user;
    er.user = { id, fullName, email } as User;
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
      const userRepository = AppDataSource.getRepository(User);
      const erRepository = AppDataSource.getRepository(ExpenseRequest);
      const workspace = req.workspace!;

      const user = await userRepository.findOne({
        where: { id: userId as number },
      });
      if (!user) return res.status(404).json({ message: "User not found" });

      const newRequest = erRepository.create({
        user,
        title,
        amount,
        category,
        expenseDate: new Date(expenseDate),
        reason,
        status: "pending",
        workspace,
      });

      await erRepository.save(newRequest);
      sanitizeUser(newRequest);

      return res
        .status(201)
        .json({ message: "Expense request created", expenseRequest: newRequest });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getAllExpenseRequests = async (req: AuthRequest, res: Response) => {
    try {
      const erRepository = AppDataSource.getRepository(ExpenseRequest);
      const workspace = req.workspace!;

      if (
        req.user?.role === UserRole.ADMIN ||
        req.user?.role === UserRole.SUPER_ADMIN ||
        req.user?.role === "finance"
      ) {
        const all = await erRepository.find({
          where: { workspace: { id: workspace.id } },
          order: { createdAt: "DESC" },
          relations: ["user"],
        });
        all.forEach(sanitizeUser);
        return res.status(200).json(all);
      }

      const mine = await erRepository.find({
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
    const { status }: UpdateExpenseRequestStatusDto = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    try {
      const erRepository = AppDataSource.getRepository(ExpenseRequest);
      const workspace = req.workspace!;
      const er = await erRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      // Finance keeps its own unconditional, cross-cutting approval power
      // (it approves cost matters company-wide, not as anyone's manager) —
      // everyone else must be this requester's nearest admin ancestor.
      if (req.user!.role !== UserRole.FINANCE) {
        const allowed = await canApprove(
          workspace.id,
          req.user!.id,
          req.user!.role,
          er.user.id,
        );
        if (!allowed) {
          return res.status(403).json({
            message: "Only this person's manager can approve this request",
          });
        }
      }

      er.status = status;
      er.approvedAt = new Date();
      await erRepository.save(er);
      sanitizeUser(er);

      return res
        .status(200)
        .json({ message: `Expense request ${status}`, expenseRequest: er });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getExpenseRequestById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const erRepository = AppDataSource.getRepository(ExpenseRequest);
      const workspace = req.workspace!;
      const er = await erRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        req.user?.role !== "finance" &&
        er.user.id !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      sanitizeUser(er);
      return res.status(200).json(er);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateExpenseRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { amount, category, expenseDate, reason }: UpdateExpenseRequestDto = req.body;

    try {
      const erRepository = AppDataSource.getRepository(ExpenseRequest);
      const workspace = req.workspace!;
      const er = await erRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN &&
        er.user.id !== req.user?.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (amount != null) er.amount = amount;
      if (category) er.category = category;
      if (expenseDate) er.expenseDate = new Date(expenseDate);
      if (reason) er.reason = reason;

      await erRepository.save(er);
      sanitizeUser(er);

      return res
        .status(200)
        .json({ message: "Expense request updated", expenseRequest: er });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteExpenseRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const erRepository = AppDataSource.getRepository(ExpenseRequest);
      const workspace = req.workspace!;
      const er = await erRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: workspace.id },
        },
      });

      if (!er)
        return res.status(404).json({ message: "Expense request not found" });

      await erRepository.remove(er);

      return res.status(200).json({ message: "Expense request deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
