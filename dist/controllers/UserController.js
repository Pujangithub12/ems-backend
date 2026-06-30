"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const data_source_1 = require("../config/data-source");
const User_1 = require("../entities/User");
const bcrypt_1 = __importDefault(require("bcrypt"));
class UserController {
    static addUser = async (req, res) => {
        const { fullName, email, password, phoneNumber, address, jobPosition, joinDate, role, } = req.body;
        if (!fullName ||
            !email ||
            !password ||
            !phoneNumber ||
            !address ||
            !jobPosition ||
            !joinDate) {
            return res.status(400).json({ message: "All fields are required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const workspace = req.workspace;
            // Check if user already exists
            const existingUser = await userRepository.findOne({ where: { email } });
            if (existingUser) {
                return res
                    .status(400)
                    .json({ message: "User with this email already exists" });
            }
            // Enforce role creation rules
            const currentUserRole = req.user?.role;
            let finalRole = role || User_1.UserRole.USER;
            if (currentUserRole === User_1.UserRole.ADMIN) {
                // Admin can only create users
                finalRole = User_1.UserRole.USER;
            }
            else if (currentUserRole !== User_1.UserRole.SUPER_ADMIN) {
                // Users can't create anyone
                return res
                    .status(403)
                    .json({ message: "Not authorized to create users" });
            }
            const hashedPassword = await bcrypt_1.default.hash(password, 10);
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getAllUsers = async (req, res) => {
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const workspace = req.workspace;
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteUser = async (req, res) => {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "User ID is required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const workspace = req.workspace;
            // Find user only if they are in current workspace
            const user = await userRepository
                .createQueryBuilder("user")
                .innerJoin("user.workspaces", "workspace")
                .where("user.id = :id", { id: parseInt(id) })
                .andWhere("workspace.id = :workspaceId", { workspaceId: workspace.id })
                .getOne();
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            // Remove user from workspace
            await userRepository
                .createQueryBuilder()
                .relation(User_1.User, "workspaces")
                .of(user)
                .remove(workspace);
            return res
                .status(200)
                .json({ message: "User removed from workspace successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateUser = async (req, res) => {
        const { id } = req.params;
        const { fullName, email, password, phoneNumber, address, jobPosition, joinDate, role, } = req.body;
        if (!id) {
            return res.status(400).json({ message: "User ID is required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const workspace = req.workspace;
            // Find user only if they are in current workspace
            const user = await userRepository
                .createQueryBuilder("user")
                .innerJoin("user.workspaces", "workspace")
                .where("user.id = :id", { id: parseInt(id) })
                .andWhere("workspace.id = :workspaceId", { workspaceId: workspace.id })
                .getOne();
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            if (fullName)
                user.fullName = fullName;
            if (email)
                user.email = email;
            if (phoneNumber)
                user.phoneNumber = phoneNumber;
            if (address)
                user.address = address;
            if (jobPosition)
                user.jobPosition = jobPosition;
            if (joinDate)
                user.joinDate = new Date(joinDate);
            // Enforce role update rules
            const currentUserRole = req.user?.role;
            if (role) {
                if (currentUserRole === User_1.UserRole.ADMIN) {
                    // Admin can only set role to user
                    user.role = User_1.UserRole.USER;
                }
                else if (currentUserRole === User_1.UserRole.SUPER_ADMIN) {
                    // Super admin can set any role
                    user.role = role;
                }
                // Regular users can't change roles
            }
            if (password) {
                user.password = await bcrypt_1.default.hash(password, 10);
            }
            await userRepository.save(user);
            return res.status(200).json({ message: "User updated successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.UserController = UserController;
//# sourceMappingURL=UserController.js.map