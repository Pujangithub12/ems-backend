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
exports.ProjectHeading = void 0;
const typeorm_1 = require("typeorm");
const Project_1 = require("./Project");
const Task_1 = require("./Task");
const Workspace_1 = require("./Workspace");
let ProjectHeading = class ProjectHeading {
    id;
    name;
    project;
    workspace;
    parentHeading;
    subHeadings;
    tasks;
    createdAt;
};
exports.ProjectHeading = ProjectHeading;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], ProjectHeading.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ProjectHeading.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Project_1.Project, (project) => project.headings, { onDelete: "CASCADE" }),
    __metadata("design:type", Project_1.Project)
], ProjectHeading.prototype, "project", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Workspace_1.Workspace, { nullable: true }),
    __metadata("design:type", Workspace_1.Workspace)
], ProjectHeading.prototype, "workspace", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ProjectHeading, (heading) => heading.subHeadings, { nullable: true, onDelete: "CASCADE" }),
    __metadata("design:type", ProjectHeading)
], ProjectHeading.prototype, "parentHeading", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ProjectHeading, (heading) => heading.parentHeading),
    __metadata("design:type", Array)
], ProjectHeading.prototype, "subHeadings", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Task_1.Task, (task) => task.projectHeading),
    __metadata("design:type", Array)
], ProjectHeading.prototype, "tasks", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ProjectHeading.prototype, "createdAt", void 0);
exports.ProjectHeading = ProjectHeading = __decorate([
    (0, typeorm_1.Entity)()
], ProjectHeading);
//# sourceMappingURL=ProjectHeading.js.map