"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_cron_1 = __importDefault(require("node-cron"));
const data_source_1 = require("./config/data-source");
const routes_1 = __importDefault(require("./routes"));
const User_1 = require("./entities/User");
const Announcement_1 = require("./entities/Announcement");
const bcrypt_1 = __importDefault(require("bcrypt"));
const backfill_workspace_1 = require("./utils/backfill-workspace");
dotenv_1.default.config();
console.log("RESEND_API_KEY present?", !!process.env.RESEND_API_KEY);
console.log("RESEND_FROM_EMAIL:", process.env.RESEND_FROM_EMAIL);
process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)({
    origin: [
        "https://www.jdnenergy.com.np",
        "https://jdnenergy.com.np",
        "https://emsjandaenergy.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    credentials: true,
}));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
// Log all incoming requests for debugging
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});
// Serve static files from uploads directory
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "../uploads")));
app.use("/api", routes_1.default);
const seedAdmin = async () => {
    const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
    const adminEmail = "admin@ems.com";
    const adminExists = await userRepository.findOne({
        where: { email: adminEmail },
    });
    if (!adminExists) {
        const hashedPassword = await bcrypt_1.default.hash("admin123", 10);
        const admin = userRepository.create({
            fullName: "System Admin",
            email: adminEmail,
            password: hashedPassword,
            phoneNumber: "0000000000",
            address: "System",
            jobPosition: "Administrator",
            joinDate: new Date(),
            role: User_1.UserRole.ADMIN,
        });
        await userRepository.save(admin);
        console.log(`Default admin created: ${adminEmail} / admin123`);
    }
    else if (adminExists.role !== User_1.UserRole.ADMIN) {
        adminExists.role = User_1.UserRole.ADMIN;
        await userRepository.save(adminExists);
        console.log(`Existing admin account updated to role admin for: ${adminEmail}`);
    }
};
const deleteOldAnnouncements = async () => {
    try {
        const announcementRepository = data_source_1.AppDataSource.getRepository(Announcement_1.Announcement);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const result = await announcementRepository
            .createQueryBuilder()
            .delete()
            .from(Announcement_1.Announcement)
            .where("createdAt < :sevenDaysAgo", { sevenDaysAgo })
            .execute();
        if (result.affected && result.affected > 0) {
            console.log(`Deleted ${result.affected} old announcement(s) (older than 7 days)`);
        }
    }
    catch (error) {
        console.error("Error deleting old announcements:", error);
    }
};
data_source_1.AppDataSource.initialize()
    .then(async () => {
    console.log("Data Source has been initialized!");
    await seedAdmin();
    await (0, backfill_workspace_1.backfillWorkspace)(); // Backfill all existing data to default workspace!
    // Delete old announcements immediately on startup
    await deleteOldAnnouncements();
    // Schedule to run every day at midnight (0 0 * * *)
    node_cron_1.default.schedule("0 0 * * *", () => {
        console.log("Running scheduled task to delete old announcements...");
        deleteOldAnnouncements();
    });
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
})
    .catch((err) => {
    console.error("Error during Data Source initialization", err);
});
//# sourceMappingURL=index.js.map