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
            // Check if user already exists
            const existingUser = await userRepository.findOne({ where: { email } });
            if (existingUser) {
                return res
                    .status(400)
                    .json({ message: "User with this email already exists" });
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
                role: role || User_1.UserRole.USER,
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
            const user = await userRepository.findOne({
                where: { id: parseInt(id) },
            });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            await userRepository.remove(user);
            return res.status(200).json({ message: "User deleted successfully" });
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
            const user = await userRepository.findOne({
                where: { id: parseInt(id) },
            });
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
            if (role)
                user.role = role;
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