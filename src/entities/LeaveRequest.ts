import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { Workspace } from "./Workspace";

@Entity()
export class LeaveRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true, onDelete: "CASCADE" })
  user!: User;

  @Column({ default: "Leave Request" })
  title!: string;

  @Column()
  startDate!: Date;

  @Column()
  endDate!: Date;

  @Column("text")
  reason!: string;

  @Column({
    type: "enum",
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  })
  status!: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.leaveRequests, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;

  /** Set on both approve and reject — doubles as "resolvedAt" for the 7-day cleanup cron in index.ts. */
  @Column({ type: "timestamp", nullable: true })
  approvedAt?: Date | null;
}
