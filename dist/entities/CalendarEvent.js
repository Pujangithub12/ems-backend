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
exports.CalendarEvent = void 0;
const typeorm_1 = require("typeorm");
const Workspace_1 = require("./Workspace");
let CalendarEvent = class CalendarEvent {
    id;
    title;
    date;
    type;
    workspace;
    createdAt;
};
exports.CalendarEvent = CalendarEvent;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], CalendarEvent.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], CalendarEvent.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Date)
], CalendarEvent.prototype, "date", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: "holiday" }) // e.g., holiday, event, deadline
    ,
    __metadata("design:type", String)
], CalendarEvent.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Workspace_1.Workspace, (workspace) => workspace.calendarEvents, {
        onDelete: "CASCADE",
        nullable: true,
    }),
    __metadata("design:type", Workspace_1.Workspace)
], CalendarEvent.prototype, "workspace", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], CalendarEvent.prototype, "createdAt", void 0);
exports.CalendarEvent = CalendarEvent = __decorate([
    (0, typeorm_1.Entity)()
], CalendarEvent);
//# sourceMappingURL=CalendarEvent.js.map