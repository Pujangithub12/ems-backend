import express, { ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
import cron from "node-cron";
import { prisma } from "./config/prisma";
import routes from "./routes";
import { UserRole } from "./types/enums";
import type { UserModel as User } from "./generated/prisma/models";
import bcrypt from "bcrypt";
import { backfillOrganization } from "./utils/backfill-organization";
import { seedRolePermissions } from "./utils/permissionService";
import { authMiddleware } from "./middlewares/auth";
import { verifyUploadAccess } from "./middlewares/uploadAccess";

dotenv.config();

console.log("RESEND_API_KEY present?", !!process.env.RESEND_API_KEY);
console.log("RESEND_FROM_EMAIL:", process.env.RESEND_FROM_EMAIL);

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  helmet({
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
  }),
);
app.use(
  cors({
    origin: [
      "https://www.jdnenergy.com.np",
      "https://jdnenergy.com.np",
      "https://emsjandaenergy.vercel.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});

// Serve static files from uploads directory — gated behind auth + an
// organization-ownership check (see uploadAccess.ts) so attachments from one
// organization can't be read via URL by a user of another, or by anyone
// unauthenticated at all.
app.use(
  "/uploads",
  authMiddleware,
  verifyUploadAccess,
  express.static(path.join(__dirname, "../uploads")),
);

app.use("/api", routes);

// Turns a rejected upload (blocked file type, size-limit) into a clean 400
// instead of falling through to Express's default 500/HTML error page.
const uploadErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  if (err instanceof Error && /not allowed/i.test(err.message)) {
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
const ensureMembershipRole = async (user: User, role: UserRole) => {
  // NOTE: "EMS Workspace" is an existing stored data value (the default
  // organization's `name` column), not a code identifier — left exactly as
  // written so this lookup still matches the row already in production DBs.
  let organization = await prisma.organization.findFirst({
    where: { name: "EMS Workspace" },
  });
  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        name: "EMS Workspace",
        description: "Default organization for all EMS data",
      },
    });
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId: user.id, organizationId: organization.id },
  });
  if (!membership) {
    await prisma.organizationMembership.create({
      data: { userId: user.id, organizationId: organization.id, role },
    });
    return true;
  }
  if (membership.role !== role) {
    await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { role },
    });
    return true;
  }
  return false;
};

const seedAdmin = async () => {
  const adminEmail = "admin@ems.com";
  let adminExists = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    adminExists = await prisma.user.create({
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

  const changed = await ensureMembershipRole(adminExists, UserRole.ADMIN);
  if (changed) {
    console.log(
      `Admin membership in EMS Workspace ensured (role admin) for: ${adminEmail}`,
    );
  }
};

const seedSuperAdmin = async () => {
  const superAdminEmail = "superadmin@ems.com";
  let superAdminExists = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });

  if (!superAdminExists) {
    const hashedPassword = await bcrypt.hash("superadmin123", 10);
    superAdminExists = await prisma.user.create({
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

  const changed = await ensureMembershipRole(superAdminExists, UserRole.SUPER_ADMIN);
  if (changed) {
    console.log(
      `Super admin membership in EMS Workspace ensured (role super_admin) for: ${superAdminEmail}`,
    );
  }
};

const deleteOldAnnouncements = async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await prisma.announcement.deleteMany({
      where: { createdAt: { lt: sevenDaysAgo } },
    });

    if (result.count > 0) {
      console.log(`Deleted ${result.count} old announcement(s) (older than 7 days)`);
    }
  } catch (error) {
    console.error("Error deleting old announcements:", error);
  }
};

const deleteOldApprovedRequests = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  try {
    const result = await prisma.leaveRequest.deleteMany({
      where: { status: { in: ["approved", "rejected"] }, approvedAt: { lt: sevenDaysAgo } },
    });
    if (result.count > 0) {
      console.log(`Deleted ${result.count} old resolved leave request(s) (approved/rejected over 7 days ago)`);
    }
  } catch (error) {
    console.error("Error deleting old resolved leave requests:", error);
  }

  try {
    const result = await prisma.siteVisitRequest.deleteMany({
      where: { status: { in: ["approved", "rejected"] }, approvedAt: { lt: sevenDaysAgo } },
    });
    if (result.count > 0) {
      console.log(`Deleted ${result.count} old resolved site visit request(s) (approved/rejected over 7 days ago)`);
    }
  } catch (error) {
    console.error("Error deleting old resolved site visit requests:", error);
  }

  try {
    const result = await prisma.expenseRequest.deleteMany({
      where: { status: { in: ["approved", "rejected"] }, approvedAt: { lt: sevenDaysAgo } },
    });
    if (result.count > 0) {
      console.log(`Deleted ${result.count} old resolved expense request(s) (approved/rejected over 7 days ago)`);
    }
  } catch (error) {
    console.error("Error deleting old resolved expense requests:", error);
  }
};

prisma
  .$connect()
  .then(async () => {
    console.log("Data Source has been initialized!");
    await seedAdmin();
    await seedSuperAdmin();
    await backfillOrganization(); // Backfill all existing data to default organization!
    await seedRolePermissions();

    // Delete old announcements immediately on startup
    await deleteOldAnnouncements();
    await deleteOldApprovedRequests();

    // Schedule to run every day at midnight (0 0 * * *)
    cron.schedule("0 0 * * *", () => {
      console.log("Running scheduled task to delete old announcements...");
      deleteOldAnnouncements();
      deleteOldApprovedRequests();
    });

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err: any) => {
    console.error("Error during Data Source initialization", err);
  });
