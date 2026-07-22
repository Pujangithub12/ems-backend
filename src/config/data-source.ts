import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import { User } from "../entities/User";
import { Announcement } from "../entities/Announcement";
import { Task } from "../entities/Task";
import { LeaveRequest } from "../entities/LeaveRequest";
import { SiteVisitRequest } from "../entities/SiteVisitRequest";
import { ExpenseRequest } from "../entities/ExpenseRequest";
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
import { WorkspaceMembership } from "../entities/WorkspaceMembership";
import { HierarchyNode } from "../entities/HierarchyNode";
import { ScheduleTask } from "../entities/ScheduleTask";
import { RolePermission } from "../entities/RolePermission";
import { PendingSignup } from "../entities/PendingSignup";
import { PasswordResetOtp } from "../entities/PasswordResetOtp";
import { WorkspaceInvite } from "../entities/WorkspaceInvite";
import { ProcurementItem } from "../entities/ProcurementItem";
import { MonthlyPerformance } from "../entities/MonthlyPerformance";
import { InventoryItem } from "../entities/InventoryItem";
import { Warehouse } from "../entities/Warehouse";
import { Vendor } from "../entities/Vendor";
import { ReportComment } from "../entities/ReportComment";
import { ReportActivity } from "../entities/ReportActivity";
import { InventoryBatch } from "../entities/InventoryBatch";
import { InventorySerial } from "../entities/InventorySerial";
import { InventoryTransaction } from "../entities/InventoryTransaction";
import { StockTransfer } from "../entities/StockTransfer";
import { InventoryAttachment } from "../entities/InventoryAttachment";
import { ProcurementStatusHistory } from "../entities/ProcurementStatusHistory";
import { ProcurementAttachment } from "../entities/ProcurementAttachment";
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
      SiteVisitRequest,
      ExpenseRequest,
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
      WorkspaceMembership,
      HierarchyNode,
      ScheduleTask,
      RolePermission,
      PendingSignup,
      PasswordResetOtp,
      WorkspaceInvite,
      ProcurementItem,
      MonthlyPerformance,
      InventoryItem,
      Warehouse,
      Vendor,
      ReportComment,
      ReportActivity,
      InventoryBatch,
      InventorySerial,
      InventoryTransaction,
      StockTransfer,
      InventoryAttachment,
      ProcurementStatusHistory,
      ProcurementAttachment,
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
