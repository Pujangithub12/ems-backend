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
exports.ProjectFile = void 0;
const typeorm_1 = require("typeorm");
const Project_1 = require("./Project");
const Workspace_1 = require("./Workspace");
const User_1 = require("./User");
let ProjectFile = class ProjectFile {
    id;
    name;
    isFolder;
    type; // e.g., 'pdf', 'docx', 'xlsx' — undefined for folders
    parentId; // For hierarchy
    /** Size in bytes. Null for folders. */
    size;
    /** Path relative to the uploads/ directory, e.g. "projects/12/169-report.pdf". Null for folders. */
    path;
    version;
    uploadedBy;
    project;
    workspace;
    createdAt;
};
exports.ProjectFile = ProjectFile;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], ProjectFile.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ProjectFile.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], ProjectFile.prototype, "isFolder", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ProjectFile.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], ProjectFile.prototype, "parentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], ProjectFile.prototype, "size", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", String)
], ProjectFile.prototype, "path", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "v1.0" }),
    __metadata("design:type", String)
], ProjectFile.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, { nullable: true, onDelete: "SET NULL" }),
    __metadata("design:type", User_1.User)
], ProjectFile.prototype, "uploadedBy", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Project_1.Project, (project) => project.id, { onDelete: "CASCADE" }),
    __metadata("design:type", Project_1.Project)
], ProjectFile.prototype, "project", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Workspace_1.Workspace, { nullable: true }),
    __metadata("design:type", Workspace_1.Workspace)
], ProjectFile.prototype, "workspace", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ProjectFile.prototype, "createdAt", void 0);
exports.ProjectFile = ProjectFile = __decorate([
    (0, typeorm_1.Entity)()
], ProjectFile);
//# sourceMappingURL=ProjectFile.js.map