"use strict";
// Plain runtime enums previously declared inside TypeORM entity files
// (src/entities/TaskEnums.ts, MyTask.ts). Not tied to the ORM — these are
// used throughout controllers for status/role comparisons and are also the
// source of the varchar-with-default values stored in the DB (not native
// Postgres enums, see the Prisma schema comments on Task.status etc).
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectStatus = exports.MyTaskStatus = exports.UserRole = exports.TaskStatus = exports.TaskPriority = void 0;
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["HIGH"] = "high";
    TaskPriority["MEDIUM"] = "medium";
    TaskPriority["LOW"] = "low";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
var TaskStatus;
(function (TaskStatus) {
    // Stored/displayed as "to_do" — the member name PENDING is unchanged
    // (all call sites reference it symbolically) to keep this rename small.
    TaskStatus["PENDING"] = "to_do";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["ON_HOLD"] = "on_hold";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "super_admin";
    UserRole["ADMIN"] = "admin";
    UserRole["FINANCE"] = "finance";
    UserRole["USER"] = "user";
})(UserRole || (exports.UserRole = UserRole = {}));
var MyTaskStatus;
(function (MyTaskStatus) {
    MyTaskStatus["PENDING"] = "pending";
    MyTaskStatus["COMPLETED"] = "completed";
})(MyTaskStatus || (exports.MyTaskStatus = MyTaskStatus = {}));
/** Project.status — a separate set of literal values from TaskStatus (a project uses
 * "pending", not TaskStatus.PENDING's "to_do"); mixing the two up let a project's status
 * silently fail to save back to "pending" once changed away from it (ProjectController
 * validated against TaskStatus's values instead of these). */
var ProjectStatus;
(function (ProjectStatus) {
    ProjectStatus["PENDING"] = "pending";
    ProjectStatus["IN_PROGRESS"] = "in_progress";
    ProjectStatus["COMPLETED"] = "completed";
    ProjectStatus["ON_HOLD"] = "on_hold";
})(ProjectStatus || (exports.ProjectStatus = ProjectStatus = {}));
//# sourceMappingURL=enums.js.map