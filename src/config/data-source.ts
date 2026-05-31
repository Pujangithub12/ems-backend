import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm"; // Changed to DataSourceOptions
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

const isProduction = process.env.NODE_ENV === "production";

// 1. Define base configurations common to both local and production environments
const baseOptions: DataSourceOptions = {
  type: "postgres",
  entities: [
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
  ],
  synchronize: !isProduction,
  logging: !isProduction,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  migrations: [],
  subscribers: [],
};

// 2. Build the exact options block dynamically to appease exactOptionalPropertyTypes
const getConfiguration = (): DataSourceOptions => {
  if (process.env.DATABASE_URL) {
    return {
      ...baseOptions,
      url: process.env.DATABASE_URL,
    };
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
