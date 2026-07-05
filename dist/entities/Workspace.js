"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Workspace = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
const Task_1 = require("./Task");
const Project_1 = require("./Project");
const Announcement_1 = require("./Announcement");
const LeaveRequest_1 = require("./LeaveRequest");
const MyTask_1 = require("./MyTask");
const CalendarEvent_1 = require("./CalendarEvent");
const Activity_1 = require("./Activity");
const HierarchyNode_1 = require("./HierarchyNode");
let Workspace = class Workspace {
    id;
    name;
    description;
    members;
    tasks;
    projects;
    announcements;
    leaveRequests;
    myTasks;
    calendarEvents;
    activities;
    hierarchyNodes;
    createdAt;
};
exports.Workspace = Workspace;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Workspace.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Workspace.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Workspace.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.ManyToMany)(() => User_1.User, (user) => user.workspaces),
    (0, typeorm_1.JoinTable)(),
    __metadata("design:type", Array)
], Workspace.prototype, "members", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Task_1.Task, (task) => task.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "tasks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Project_1.Project, (project) => project.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "projects", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Announcement_1.Announcement, (ann) => ann.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "announcements", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => LeaveRequest_1.LeaveRequest, (lr) => lr.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "leaveRequests", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => MyTask_1.MyTask, (mt) => mt.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "myTasks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => CalendarEvent_1.CalendarEvent, (ce) => ce.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "calendarEvents", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Activity_1.Activity, (act) => act.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "activities", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => HierarchyNode_1.HierarchyNode, (node) => node.workspace, { cascade: true }),
    __metadata("design:type", Array)
], Workspace.prototype, "hierarchyNodes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Workspace.prototype, "createdAt", void 0);
exports.Workspace = Workspace = __decorate([
    (0, typeorm_1.Entity)()
], Workspace);
//# sourceMappingURL=Workspace.js.map