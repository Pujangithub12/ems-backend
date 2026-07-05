"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const User_1 = require("../entities/User");
const Announcement_1 = require("../entities/Announcement");
const Task_1 = require("../entities/Task");
const LeaveRequest_1 = require("../entities/LeaveRequest");
const Project_1 = require("../entities/Project");
const ProjectFile_1 = require("../entities/ProjectFile");
const ProjectHeading_1 = require("../entities/ProjectHeading");
const SubTask_1 = require("../entities/SubTask");
const TaskComment_1 = require("../entities/TaskComment");
const SubTaskComment_1 = require("../entities/SubTaskComment");
const MyTask_1 = require("../entities/MyTask");
const CalendarEvent_1 = require("../entities/CalendarEvent");
const Activity_1 = require("../entities/Activity");
const Workspace_1 = require("../entities/Workspace");
const HierarchyNode_1 = require("../entities/HierarchyNode");
const ScheduleTask_1 = require("../entities/ScheduleTask");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL:", process.env.DATABASE_URL ?? "NOT SET");
const isProduction = process.env.NODE_ENV === "production";
const entityList = isProduction
    ? [__dirname + "/../entities/*.js"]
    : [
        User_1.User,
        Announcement_1.Announcement,
        Task_1.Task,
        LeaveRequest_1.LeaveRequest,
        Project_1.Project,
        ProjectFile_1.ProjectFile,
        ProjectHeading_1.ProjectHeading,
        SubTask_1.SubTask,
        TaskComment_1.TaskComment,
        SubTaskComment_1.SubTaskComment,
        MyTask_1.MyTask,
        CalendarEvent_1.CalendarEvent,
        Activity_1.Activity,
        Workspace_1.Workspace,
        HierarchyNode_1.HierarchyNode,
        ScheduleTask_1.ScheduleTask,
    ];
const baseOptions = {
    type: "postgres",
    entities: entityList,
    synchronize: true, //!isProduction,
    logging: !isProduction,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    migrations: [],
    subscribers: [],
};
const getConfiguration = () => {
    if (process.env.DATABASE_URL) {
        return {
            ...baseOptions,
            url: process.env.DATABASE_URL,
        };
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
exports.AppDataSource = new typeorm_1.DataSource(getConfiguration());
//# sourceMappingURL=data-source.js.map