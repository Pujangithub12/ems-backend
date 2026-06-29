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
exports.SubTaskComment = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
const SubTask_1 = require("./SubTask");
let SubTaskComment = class SubTaskComment {
    id;
    commentText;
    feedback;
    author;
    subTask;
    createdAt;
};
exports.SubTaskComment = SubTaskComment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], SubTaskComment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)("text"),
    __metadata("design:type", String)
], SubTaskComment.prototype, "commentText", void 0);
__decorate([
    (0, typeorm_1.Column)("text", { nullable: true }),
    __metadata("design:type", String)
], SubTaskComment.prototype, "feedback", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, { eager: true, onDelete: "CASCADE" }),
    __metadata("design:type", User_1.User)
], SubTaskComment.prototype, "author", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SubTask_1.SubTask, (subTask) => subTask.comments, { onDelete: "CASCADE" }),
    __metadata("design:type", SubTask_1.SubTask)
], SubTaskComment.prototype, "subTask", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], SubTaskComment.prototype, "createdAt", void 0);
exports.SubTaskComment = SubTaskComment = __decorate([
    (0, typeorm_1.Entity)()
], SubTaskComment);
//# sourceMappingURL=SubTaskComment.js.map