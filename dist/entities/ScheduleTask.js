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
exports.ScheduleTask = void 0;
const typeorm_1 = require("typeorm");
const Project_1 = require("./Project");
/**
 * A single row of a project's schedule (Gantt task). The whole set of rows
 * for a project is saved/replaced together via PUT /projects/:projectId/schedule
 * — see ScheduleService.saveSchedule.
 */
let ScheduleTask = class ScheduleTask {
    id;
    projectId;
    project;
    /** User-facing task id, e.g. "1", "1.1". Unique within a project. */
    taskId;
    taskName;
    /** Duration in days. Null for summary rows with no explicit duration. */
    duration;
    startDate;
    /** taskId of the owning summary row, or null. */
    parentId;
    /** Comma-separated list of predecessor taskIds, or null. */
    predecessorId;
    /** Preserves the row order the user entered/uploaded. */
    orderIndex;
    createdAt;
    updatedAt;
};
exports.ScheduleTask = ScheduleTask;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], ScheduleTask.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], ScheduleTask.prototype, "projectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Project_1.Project, { onDelete: "CASCADE", nullable: true }),
    __metadata("design:type", Project_1.Project)
], ScheduleTask.prototype, "project", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ScheduleTask.prototype, "taskId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ScheduleTask.prototype, "taskName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "float", nullable: true }),
    __metadata("design:type", Object)
], ScheduleTask.prototype, "duration", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "date", nullable: true }),
    __metadata("design:type", Object)
], ScheduleTask.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], ScheduleTask.prototype, "parentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], ScheduleTask.prototype, "predecessorId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], ScheduleTask.prototype, "orderIndex", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ScheduleTask.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ScheduleTask.prototype, "updatedAt", void 0);
exports.ScheduleTask = ScheduleTask = __decorate([
    (0, typeorm_1.Entity)()
], ScheduleTask);
//# sourceMappingURL=ScheduleTask.js.map