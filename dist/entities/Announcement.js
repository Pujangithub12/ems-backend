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
exports.Announcement = void 0;
const typeorm_1 = require("typeorm");
const Workspace_1 = require("./Workspace");
let Announcement = class Announcement {
    id;
    subject;
    message;
    targetType; // "all" or "specific"
    targetEmails;
    workspace;
    createdAt;
};
exports.Announcement = Announcement;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Announcement.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Announcement.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)("text"),
    __metadata("design:type", String)
], Announcement.prototype, "message", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "all" }),
    __metadata("design:type", String)
], Announcement.prototype, "targetType", void 0);
__decorate([
    (0, typeorm_1.Column)("simple-array", { nullable: true }),
    __metadata("design:type", Array)
], Announcement.prototype, "targetEmails", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Workspace_1.Workspace, (workspace) => workspace.announcements, {
        onDelete: "CASCADE",
        nullable: true,
    }),
    __metadata("design:type", Workspace_1.Workspace)
], Announcement.prototype, "workspace", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Announcement.prototype, "createdAt", void 0);
exports.Announcement = Announcement = __decorate([
    (0, typeorm_1.Entity)()
], Announcement);
//# sourceMappingURL=Announcement.js.map