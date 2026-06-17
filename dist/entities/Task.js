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
exports.Task = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
const Project_1 = require("./Project");
const SubTask_1 = require("./SubTask");
const TaskComment_1 = require("./TaskComment");
const TaskEnums_1 = require("./TaskEnums");
const ProjectHeading_1 = require("./ProjectHeading");
let Task = class Task {
    id;
    companyName;
    title;
    description;
    projectName;
    priority;
    status;
    progress;
    dueDate;
    assignedUsers;
    project;
    projectHeading;
    subTasks;
    comments;
    files;
    createdAt;
};
exports.Task = Task;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Task.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "companyName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Task.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)("text", { nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Task.prototype, "projectName", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "varchar",
        default: TaskEnums_1.TaskPriority.MEDIUM,
    }),
    __metadata("design:type", String)
], Task.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "varchar",
        default: TaskEnums_1.TaskStatus.PENDING,
    }),
    __metadata("design:type", String)
], Task.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Task.prototype, "progress", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Date)
], Task.prototype, "dueDate", void 0);
__decorate([
    (0, typeorm_1.ManyToMany)(() => User_1.User),
    (0, typeorm_1.JoinTable)(),
    __metadata("design:type", Array)
], Task.prototype, "assignedUsers", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Project_1.Project, (project) => project.projectTasks, {
        nullable: true,
        onDelete: "SET NULL",
    }),
    __metadata("design:type", Project_1.Project)
], Task.prototype, "project", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ProjectHeading_1.ProjectHeading, (heading) => heading.tasks, {
        nullable: true,
        onDelete: "SET NULL",
    }),
    __metadata("design:type", ProjectHeading_1.ProjectHeading)
], Task.prototype, "projectHeading", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => SubTask_1.SubTask, (subTask) => subTask.task, { cascade: true }),
    __metadata("design:type", Array)
], Task.prototype, "subTasks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => TaskComment_1.TaskComment, (comment) => comment.task, {
        cascade: true,
    }),
    __metadata("design:type", Array)
], Task.prototype, "comments", void 0);
__decorate([
    (0, typeorm_1.Column)("simple-array", { nullable: true }),
    __metadata("design:type", Array)
], Task.prototype, "files", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Task.prototype, "createdAt", void 0);
exports.Task = Task = __decorate([
    (0, typeorm_1.Entity)()
], Task);
//# sourceMappingURL=Task.js.map