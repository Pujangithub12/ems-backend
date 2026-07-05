import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";
import bcrypt from "bcrypt";
import { In } from "typeorm";
import { CreateUserDto, UpdateUserDto } from "../dto/user.dto";

export class UserController {
  static addUser = async (req: AuthRequest, res: Response) => {
    const {
      fullName,
      email,
      password,
      phoneNumber,
      address,
      jobPosition,
      joinDate,
      role,
    }: CreateUserDto = req.body;

    if (
      !fullName ||
      !email ||
      !password ||
      !phoneNumber ||
      !address ||
      !jobPosition ||
      !joinDate
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const workspace = req.workspace!;

      // Check if user already exists
      const existingUser = await userRepository.findOne({ where: { email } });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "User with this email already exists" });
      }

      // Enforce role creation rules
      const currentUserRole = req.user?.role;
      let finalRole = (role as UserRole) || UserRole.USER;

      if (currentUserRole === UserRole.ADMIN) {
        // Admin can create users or admins, but not super admins
        if (finalRole === UserRole.USER || finalRole === UserRole.ADMIN) {
          // Keep the requested role (user or admin)
        } else {
          // Fallback to user if invalid role
          finalRole = UserRole.USER;
        }
      } else if (currentUserRole !== UserRole.SUPER_ADMIN) {
        // Users can't create anyone
        return res
          .status(403)
          .json({ message: "Not authorized to create users" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = userRepository.create({
        fullName,
        email,
        password: hashedPassword,
        phoneNumber,
        address,
        jobPosition,
        joinDate: new Date(joinDate),
        role: finalRole,
        workspaces: [workspace],
      });

      await userRepository.save(newUser);

      return res.status(201).json({
        message: "User created successfully",
        user: {
          id: newUser.id,
          fullName: newUser.fullName,
          email: newUser.email,
          role: newUser.role,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getAllUsers = async (req: AuthRequest, res: Response) => {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const workspace = req.workspace!;

      // Get all users that are members of the current workspace
      const users = await userRepository
        .createQueryBuilder("user")
        .innerJoin("user.workspaces", "workspace")
        .where("workspace.id = :workspaceId", { workspaceId: workspace.id })
        .select([
          "user.id",
          "user.fullName",
          "user.email",
          "user.phoneNumber",
          "user.address",
          "user.jobPosition",
          "user.joinDate",
          "user.role",
          "user.createdAt",
        ])
        .getMany();

      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteUser = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const workspace = req.workspace!;

      // Find user only if they are in current workspace
      const user = await userRepository
        .createQueryBuilder("user")
        .innerJoin("user.workspaces", "workspace")
        .where("user.id = :id", { id: parseInt(id as string) })
        .andWhere("workspace.id = :workspaceId", { workspaceId: workspace.id })
        .getOne();

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Remove user from workspace
      await userRepository
        .createQueryBuilder()
        .relation(User, "workspaces")
        .of(user)
        .remove(workspace);

      return res
        .status(200)
        .json({ message: "User removed from workspace successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateUser = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      fullName,
      email,
      password,
      phoneNumber,
      address,
      jobPosition,
      joinDate,
      role,
    }: UpdateUserDto = req.body;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const workspace = req.workspace!;

      // Find user only if they are in current workspace
      const user = await userRepository
        .createQueryBuilder("user")
        .innerJoin("user.workspaces", "workspace")
        .where("user.id = :id", { id: parseInt(id as string) })
        .andWhere("workspace.id = :workspaceId", { workspaceId: workspace.id })
        .getOne();

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (fullName) user.fullName = fullName;
      if (email) user.email = email;
      if (phoneNumber) user.phoneNumber = phoneNumber;
      if (address) user.address = address;
      if (jobPosition) user.jobPosition = jobPosition;
      if (joinDate) user.joinDate = new Date(joinDate);

      // Enforce role update rules
      const currentUserRole = req.user?.role;
      if (role) {
        if (currentUserRole === UserRole.ADMIN) {
          // Admin can set role to user or admin, but not super admin
          if (role === UserRole.USER || role === UserRole.ADMIN) {
            user.role = role as UserRole;
          }
        } else if (currentUserRole === UserRole.SUPER_ADMIN) {
          // Super admin can set any role
          user.role = role as UserRole;
        }
        // Regular users can't change roles
      }

      if (password) {
        user.password = await bcrypt.hash(password, 10);
      }

      await userRepository.save(user);

      return res.status(200).json({ message: "User updated successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
