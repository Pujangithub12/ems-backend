import "reflect-metadata";
import { DataSource } from "typeorm";
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

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "pujan12",
  database: process.env.DB_DATABASE || "ems",
  synchronize: true, // Set to false in production
  logging: false,
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
  migrations: [],
  subscribers: [],
});
