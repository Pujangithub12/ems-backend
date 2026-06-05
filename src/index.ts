import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import dotenv from "dotenv";
import { AppDataSource } from "./config/data-source";
import routes from "./routes";
import { User, UserRole } from "./entities/User";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: [
      "https://emsjandaenergy.vercel.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

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

AppDataSource.initialize()
  .then(async () => {
    console.log("Data Source has been initialized!");
    await seedAdmin();
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err: any) => {
    console.error("Error during Data Source initialization", err);
  });
