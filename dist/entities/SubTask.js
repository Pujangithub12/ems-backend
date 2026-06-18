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
exports.SubTask = void 0;
const typeorm_1 = require("typeorm");
const Task_1 = require("./Task");
const TaskEnums_1 = require("./TaskEnums");
const SubTaskComment_1 = require("./SubTaskComment");
let SubTask = class SubTask {
    id;
    title;
    status;
    // NEW: Track progress
    progress;
    // NEW: Track previous updates (stores as JSON in DB)
    history;
    task;
    parent;
    children;
    comments;
    createdAt;
};
exports.SubTask = SubTask;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], SubTask.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], SubTask.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", default: TaskEnums_1.TaskStatus.PENDING }),
    __metadata("design:type", String)
], SubTask.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], SubTask.prototype, "progress", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "simple-json", nullable: true }),
    __metadata("design:type", Array)
], SubTask.prototype, "history", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Task_1.Task, (task) => task.subTasks, { onDelete: "CASCADE" }),
    __metadata("design:type", Task_1.Task)
], SubTask.prototype, "task", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SubTask, (st) => st.children, {
        nullable: true,
        onDelete: "CASCADE",
    }),
    __metadata("design:type", SubTask)
], SubTask.prototype, "parent", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => SubTask, (st) => st.parent, { cascade: true }),
    __metadata("design:type", Array)
], SubTask.prototype, "children", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => SubTaskComment_1.SubTaskComment, (comment) => comment.subTask, {
        cascade: true,
    }),
    __metadata("design:type", Array)
], SubTask.prototype, "comments", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], SubTask.prototype, "createdAt", void 0);
exports.SubTask = SubTask = __decorate([
    (0, typeorm_1.Entity)()
], SubTask);
//# sourceMappingURL=SubTask.js.map