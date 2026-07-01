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
import { SubTaskComment } from "../entities/SubTaskComment";
import { MyTask } from "../entities/MyTask";
import { CalendarEvent } from "../entities/CalendarEvent";
import { Activity } from "../entities/Activity";
import { Workspace } from "../entities/Workspace";
import { HierarchyNode } from "../entities/HierarchyNode";
import dotenv from "dotenv";

dotenv.config();
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL:", process.env.DATABASE_URL ?? "NOT SET");

const isProduction = process.env.NODE_ENV === "production";

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
      SubTaskComment,
      MyTask,
      CalendarEvent,
      Activity,
      Workspace,
      HierarchyNode,
    ];

const baseOptions: DataSourceOptions = {
  type: "postgres",
  entities: entityList,
  synchronize: true, //!isProduction,
  logging: !isProduction,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  migrations: [],
  subscribers: [],
};

const getConfiguration = (): DataSourceOptions => {
  if (process.env.DATABASE_URL) {
    return {
      ...baseOptions,
      url: process.env.DATABASE_URL!,
    } as DataSourceOptions;
  }

  const dbPassword = process.env.DB_PASSWORD;

  return {
    ...baseOptions,
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USERNAME || "postgres",
    password: dbPassword || "",
    database: process.env.DB_DATABASE || "ems",
  };
};

export const AppDataSource = new DataSource(getConfiguration());
