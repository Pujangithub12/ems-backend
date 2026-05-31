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
const MyTask_1 = require("../entities/MyTask");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const isProduction = process.env.NODE_ENV === "production";
// 1. Define base configurations common to both local and production environments
// Entities: use class references while running TS (dev). When running compiled
// JS (production), use glob patterns to load `.js` entity files from `dist`.
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
        MyTask_1.MyTask,
    ];
const baseOptions = {
    type: "postgres",
    entities: entityList,
    synchronize: !isProduction,
    logging: !isProduction,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    migrations: [],
    subscribers: [],
};
// 2. Build the exact options block dynamically to appease exactOptionalPropertyTypes
const getConfiguration = () => {
    if (process.env.DATABASE_URL) {
        // non-null assertion is safe because of the if-check above
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
exports.AppDataSource = new typeorm_1.DataSource(getConfiguration());
//# sourceMappingURL=data-source.js.map