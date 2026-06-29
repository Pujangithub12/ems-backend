import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import bcrypt from "bcrypt";

export class UserController {
  static addUser = async (req: any, res: Response) => {
    const {
      fullName,
      email,
      password,
      phoneNumber,
      address,
      jobPosition,
      joinDate,
      role,
    } = req.body;

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

      // Check if user already exists
      const existingUser = await userRepository.findOne({ where: { email } });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "User with this email already exists" });
      }

      // Enforce role creation rules
      const currentUserRole = req.user?.role;
      let finalRole = role || UserRole.USER;

      if (currentUserRole === UserRole.ADMIN) {
        // Admin can only create users
        finalRole = UserRole.USER;
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

  static getAllUsers = async (req: Request, res: Response) => {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const users = await userRepository.find({
        select: [
          "id",
          "fullName",
          "email",
          "phoneNumber",
          "address",
          "jobPosition",
          "joinDate",
          "role",
          "createdAt",
        ],
      });
      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: parseInt(id as string) },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await userRepository.remove(user);

      return res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateUser = async (req: any, res: Response) => {
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
    } = req.body;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: parseInt(id as string) },
      });

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
          // Admin can only set role to user
          user.role = UserRole.USER;
        } else if (currentUserRole === UserRole.SUPER_ADMIN) {
          // Super admin can set any role
          user.role = role;
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
