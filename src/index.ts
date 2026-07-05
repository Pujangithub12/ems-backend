import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import dotenv from "dotenv";
import cron from "node-cron";
import { AppDataSource } from "./config/data-source";
import routes from "./routes";
import { User, UserRole } from "./entities/User";
import { Announcement } from "./entities/Announcement";
import bcrypt from "bcrypt";
import { backfillWorkspace } from "./utils/backfill-workspace";

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

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api", routes);

const seedAdmin = async () => {
  const userRepository = AppDataSource.getRepository(User);
  const adminEmail = "admin@ems.com";
  const adminExists = await userRepository.findOne({
    where: { email: adminEmail },
  });

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const admin = userRepository.create({
      fullName: "System Admin",
      email: adminEmail,
      password: hashedPassword,
      phoneNumber: "0000000000",
      address: "System",
      jobPosition: "Administrator",
      joinDate: new Date(),
      role: UserRole.ADMIN,
    });
    await userRepository.save(admin);
    console.log(`Default admin created: ${adminEmail} / admin123`);
  } else if (adminExists.role !== UserRole.ADMIN) {
    adminExists.role = UserRole.ADMIN;
    await userRepository.save(adminExists);
    console.log(
      `Existing admin account updated to role admin for: ${adminEmail}`,
    );
  }
};

const seedSuperAdmin = async () => {
  const userRepository = AppDataSource.getRepository(User);
  const superAdminEmail = "superadmin@ems.com";
  const superAdminExists = await userRepository.findOne({
    where: { email: superAdminEmail },
  });

  if (!superAdminExists) {
    const hashedPassword = await bcrypt.hash("superadmin123", 10);
    const superAdmin = userRepository.create({
      fullName: "Super Admin",
      email: superAdminEmail,
      password: hashedPassword,
      phoneNumber: "0000000000",
      address: "System",
      jobPosition: "Super Administrator",
      joinDate: new Date(),
      role: UserRole.SUPER_ADMIN,
    });
    await userRepository.save(superAdmin);
    console.log(`Default super admin created: ${superAdminEmail} / superadmin123`);
  } else if (superAdminExists.role !== UserRole.SUPER_ADMIN) {
    superAdminExists.role = UserRole.SUPER_ADMIN;
    await userRepository.save(superAdminExists);
    console.log(
      `Existing account updated to role super_admin for: ${superAdminEmail}`,
    );
  }
};

const deleteOldAnnouncements = async () => {
  try {
    const announcementRepository = AppDataSource.getRepository(Announcement);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const result = await announcementRepository
      .createQueryBuilder()
      .delete()
      .from(Announcement)
      .where("createdAt < :sevenDaysAgo", { sevenDaysAgo })
      .execute();
      
    if (result.affected && result.affected > 0) {
      console.log(`Deleted ${result.affected} old announcement(s) (older than 7 days)`);
    }
  } catch (error) {
    console.error("Error deleting old announcements:", error);
  }
};

AppDataSource.initialize()
  .then(async () => {
    console.log("Data Source has been initialized!");
    await seedAdmin();
    await seedSuperAdmin();
    await backfillWorkspace(); // Backfill all existing data to default workspace!
    
    // Delete old announcements immediately on startup
    await deleteOldAnnouncements();
    
    // Schedule to run every day at midnight (0 0 * * *)
    cron.schedule("0 0 * * *", () => {
      console.log("Running scheduled task to delete old announcements...");
      deleteOldAnnouncements();
    });
    
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err: any) => {
    console.error("Error during Data Source initialization", err);
  });
