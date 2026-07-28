// Plain runtime enums previously declared inside TypeORM entity files
// (src/entities/TaskEnums.ts, MyTask.ts). Not tied to the ORM — these are
// used throughout controllers for status/role comparisons and are also the
// source of the varchar-with-default values stored in the DB (not native
// Postgres enums, see the Prisma schema comments on Task.status etc).

export enum TaskPriority {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export enum TaskStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  ON_HOLD = "on_hold",
}

export enum UserRole {
  SUPER_ADMIN = "super_admin",
  ADMIN = "admin",
  FINANCE = "finance",
  USER = "user",
}

export enum MyTaskStatus {
  PENDING = "pending",
  COMPLETED = "completed",
}
