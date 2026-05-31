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
exports.Project = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
const TaskEnums_1 = require("./TaskEnums");
const ProjectFile_1 = require("./ProjectFile");
const ProjectHeading_1 = require("./ProjectHeading");
const Task_1 = require("./Task");
let Project = class Project {
    id;
    name;
    description;
    dueDate;
    status;
    priority;
    assignees;
    projectTasks;
    headings;
    files;
    createdAt;
};
exports.Project = Project;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Project.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Project.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)("text", { nullable: true }),
    __metadata("design:type", String)
], Project.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "date", nullable: true }),
    __metadata("design:type", Date)
], Project.prototype, "dueDate", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "varchar",
        default: TaskEnums_1.TaskStatus.PENDING,
    }),
    __metadata("design:type", String)
], Project.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "varchar",
        default: TaskEnums_1.TaskPriority.MEDIUM,
    }),
    __metadata("design:type", String)
], Project.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.ManyToMany)(() => User_1.User),
    (0, typeorm_1.JoinTable)(),
    __metadata("design:type", Array)
], Project.prototype, "assignees", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Task_1.Task, (task) => task.project),
    __metadata("design:type", Array)
], Project.prototype, "projectTasks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ProjectHeading_1.ProjectHeading, (heading) => heading.project),
    __metadata("design:type", Array)
], Project.prototype, "headings", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ProjectFile_1.ProjectFile, (file) => file.project),
    __metadata("design:type", Array)
], Project.prototype, "files", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Project.prototype, "createdAt", void 0);
exports.Project = Project = __decorate([
    (0, typeorm_1.Entity)()
], Project);
//# sourceMappingURL=Project.js.map