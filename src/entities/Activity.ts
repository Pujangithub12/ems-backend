import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";
import { Workspace } from "./Workspace";

export enum ActivityType {
  TASK_CREATED = "task_created",
  TASK_ASSIGNED = "task_assigned",
  STATUS_CHANGED = "status_changed",
}

@Entity()
export class Activity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "varchar",
  })
  type!: ActivityType;

  @Column("text")
  description!: string;

  @ManyToOne(() => Task, { onDelete: "CASCADE", nullable: true })
  @JoinColumn()
  task?: Task | null;

  @Column({ nullable: true })
  taskId?: number | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn()
  user?: User | null;

  @Column({ nullable: true })
  userId?: number | null;

  @ManyToOne(() => Workspace, (workspace) => workspace.activities, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
