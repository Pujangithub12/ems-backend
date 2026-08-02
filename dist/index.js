"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = require("./config/prisma");
const routes_1 = __importDefault(require("./routes"));
const enums_1 = require("./types/enums");
const bcrypt_1 = __importDefault(require("bcrypt"));
const backfill_organization_1 = require("./utils/backfill-organization");
const permissionService_1 = require("./utils/permissionService");
const auth_1 = require("./middlewares/auth");
const uploadAccess_1 = require("./middlewares/uploadAccess");
const socket_1 = require("./realtime/socket");
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
const httpServer = (0, http_1.createServer)(app);
(0, socket_1.initSocket)(httpServer);
app.use((0, helmet_1.default)({
    // This app is a pure JSON/file API consumed by a separately-hosted SPA —
    // CSP is a browser-rendered-document concept that doesn't apply to that
    // shape and risks unexpected breakage, so it's left off; the resource
    // policy below is what actually matters here (see comment below).
    contentSecurityPolicy: false,
    // Default helmet policy is "same-origin", which would block the frontend
    // (a different origin) from loading /uploads images/files via <img>/<a> —
    // this app's whole design relies on cross-origin cookie-authenticated
    // asset loading, so that's explicitly preserved.
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use((0, cors_1.default)({
    origin: [
        "https://www.jdnenergy.com.np",
        "https://jdnenergy.com.np",
        "https://emsjandaenergy.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        // Expo's web dev server (`npx expo start --web`, mobile/) — only
        // matters for browser testing; native builds aren't subject to CORS.
        "http://localhost:8081",
        "http://127.0.0.1:8081",
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
// Serve static files from uploads directory — gated behind auth + an
// organization-ownership check (see uploadAccess.ts) so attachments from one
// organization can't be read via URL by a user of another, or by anyone
// unauthenticated at all.
app.use("/uploads", auth_1.authMiddleware, uploadAccess_1.verifyUploadAccess, express_1.default.static(path_1.default.join(__dirname, "../uploads")));
app.use("/api", routes_1.default);
// Turns a rejected upload (blocked file type, size-limit) into a clean 400
// instead of falling through to Express's default 500/HTML error page.
const uploadErrorHandler = (err, _req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
        return res.status(400).json({ message: err.message });
    }
    if (err instanceof Error && /not allowed|^invalid /i.test(err.message)) {
        return res.status(400).json({ message: err.message });
    }
    next(err);
};
app.use(uploadErrorHandler);
// Role lives on OrganizationMembership now, not User — both seed functions
// find-or-create the same default "EMS Workspace" that backfillOrganization
// (called right after these) also ensures exists, then upsert their
// membership row's role in it. Safe to call before backfillOrganization
// runs: the organization only needs to exist once, whichever of these
// creates it.
const ensureMembershipRole = async (user, role) => {
    // NOTE: "EMS Workspace" is an existing stored data value (the default
    // organization's `name` column), not a code identifier — left exactly as
    // written so this lookup still matches the row already in production DBs.
    let organization = await prisma_1.prisma.organization.findFirst({
        where: { name: "EMS Workspace" },
    });
    if (!organization) {
        organization = await prisma_1.prisma.organization.create({
            data: {
                name: "EMS Workspace",
                description: "Default organization for all EMS data",
            },
        });
    }
    const membership = await prisma_1.prisma.organizationMembership.findFirst({
        where: { userId: user.id, organizationId: organization.id },
    });
    if (!membership) {
        await prisma_1.prisma.organizationMembership.create({
            data: { userId: user.id, organizationId: organization.id, role },
        });
        return true;
    }
    if (membership.role !== role) {
        await prisma_1.prisma.organizationMembership.update({
            where: { id: membership.id },
            data: { role },
        });
        return true;
    }
    return false;
};
const seedAdmin = async () => {
    const adminEmail = "admin@ems.com";
    let adminExists = await prisma_1.prisma.user.findUnique({
        where: { email: adminEmail },
    });
    if (!adminExists) {
        const hashedPassword = await bcrypt_1.default.hash("admin123", 10);
        adminExists = await prisma_1.prisma.user.create({
            data: {
                fullName: "System Admin",
                email: adminEmail,
                password: hashedPassword,
                phoneNumber: "0000000000",
                address: "System",
                jobPosition: "Administrator",
                joinDate: new Date(),
            },
        });
        console.log(`Default admin created: ${adminEmail} / admin123`);
    }
    const changed = await ensureMembershipRole(adminExists, enums_1.UserRole.ADMIN);
    if (changed) {
        console.log(`Admin membership in EMS Workspace ensured (role admin) for: ${adminEmail}`);
    }
};
const seedSuperAdmin = async () => {
    const superAdminEmail = "superadmin@ems.com";
    let superAdminExists = await prisma_1.prisma.user.findUnique({
        where: { email: superAdminEmail },
    });
    if (!superAdminExists) {
        const hashedPassword = await bcrypt_1.default.hash("superadmin123", 10);
        superAdminExists = await prisma_1.prisma.user.create({
            data: {
                fullName: "Super Admin",
                email: superAdminEmail,
                password: hashedPassword,
                phoneNumber: "0000000000",
                address: "System",
                jobPosition: "Super Administrator",
                joinDate: new Date(),
            },
        });
        console.log(`Default super admin created: ${superAdminEmail} / superadmin123`);
    }
    const changed = await ensureMembershipRole(superAdminExists, enums_1.UserRole.SUPER_ADMIN);
    if (changed) {
        console.log(`Super admin membership in EMS Workspace ensured (role super_admin) for: ${superAdminEmail}`);
    }
};
const deleteOldAnnouncements = async () => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const result = await prisma_1.prisma.announcement.deleteMany({
            where: { createdAt: { lt: sevenDaysAgo } },
        });
        if (result.count > 0) {
            console.log(`Deleted ${result.count} old announcement(s) (older than 7 days)`);
        }
    }
    catch (error) {
        console.error("Error deleting old announcements:", error);
    }
};
const deleteOldApprovedRequests = async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    try {
        const result = await prisma_1.prisma.leaveRequest.deleteMany({
            where: { status: { in: ["approved", "rejected"] }, approvedAt: { lt: sevenDaysAgo } },
        });
        if (result.count > 0) {
            console.log(`Deleted ${result.count} old resolved leave request(s) (approved/rejected over 7 days ago)`);
        }
    }
    catch (error) {
        console.error("Error deleting old resolved leave requests:", error);
    }
    try {
        const result = await prisma_1.prisma.siteVisitRequest.deleteMany({
            where: { status: { in: ["approved", "rejected"] }, approvedAt: { lt: sevenDaysAgo } },
        });
        if (result.count > 0) {
            console.log(`Deleted ${result.count} old resolved site visit request(s) (approved/rejected over 7 days ago)`);
        }
    }
    catch (error) {
        console.error("Error deleting old resolved site visit requests:", error);
    }
    try {
        const result = await prisma_1.prisma.expenseRequest.deleteMany({
            where: { status: { in: ["approved", "rejected"] }, approvedAt: { lt: sevenDaysAgo } },
        });
        if (result.count > 0) {
            console.log(`Deleted ${result.count} old resolved expense request(s) (approved/rejected over 7 days ago)`);
        }
    }
    catch (error) {
        console.error("Error deleting old resolved expense requests:", error);
    }
};
prisma_1.prisma
    .$connect()
    .then(async () => {
    console.log("Data Source has been initialized!");
    await seedAdmin();
    await seedSuperAdmin();
    await (0, backfill_organization_1.backfillOrganization)(); // Backfill all existing data to default organization!
    await (0, permissionService_1.seedRolePermissions)();
    // Delete old announcements immediately on startup
    await deleteOldAnnouncements();
    await deleteOldApprovedRequests();
    // Schedule to run every day at midnight (0 0 * * *)
    node_cron_1.default.schedule("0 0 * * *", () => {
        console.log("Running scheduled task to delete old announcements...");
        deleteOldAnnouncements();
        deleteOldApprovedRequests();
    });
    httpServer.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
})
    .catch((err) => {
    console.error("Error during Data Source initialization", err);
});
//# sourceMappingURL=index.js.map