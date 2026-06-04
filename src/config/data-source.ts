import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import { User } from "../entities/User";
import { Announcement } from "../entities/Announcement";
import { Task } from "../entities/Task";
import { LeaveRequest } from "../entities/LeaveRequest";
import { Project } from "../entities/Project";
import { ProjectFile } from "../entities/ProjectFile";
import { ProjectHeading } from "../entities/ProjectHeading";
import { SubTask } from "../entities/SubTask";
import { TaskComment } from "../entities/TaskComment";
import { MyTask } from "../entities/MyTask";
import dotenv from "dotenv";

dotenv.config();
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL:", process.env.DATABASE_URL ?? "NOT SET");

const isProduction = process.env.NODE_ENV === "production";

// 1. Define base configurations common to both local and production environments
// Entities: use class references while running TS (dev). When running compiled
// JS (production), use glob patterns to load `.js` entity files from `dist`.
const entityList = isProduction
  ? [__dirname + "/../entities/*.js"]
  : [
      User,
      Announcement,
      Task,
      LeaveRequest,
      Project,
      ProjectFile,
      ProjectHeading,
      SubTask,
      TaskComment,
      MyTask,
    ];

const baseOptions: DataSourceOptions = {
  type: "postgres",
  entities: entityList,
  synchronize: true,//!isProduction,
  logging: !isProduction,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  migrations: [],
  subscribers: [],
};

// 2. Build the exact options block dynamically to appease exactOptionalPropertyTypes
const getConfiguration = (): DataSourceOptions => {
  if (process.env.DATABASE_URL) {
    // non-null assertion is safe because of the if-check above
    return {
      ...baseOptions,
      url: process.env.DATABASE_URL!,
    } as DataSourceOptions;
  }

  return {
    ...baseOptions,
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USERNAME || "postgres",
    password: process.env.DB_PASSWORD || "pujan12",
    database: process.env.DB_DATABASE || "ems",
  };
};

export const AppDataSource = new DataSource(getConfiguration());
