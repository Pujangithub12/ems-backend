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
export class SiteVisitRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true, onDelete: "CASCADE" })
  user!: User;

  @Column({ default: "Site Visit" })
  title!: string;

  @Column("text")
  location!: string;

  @Column()
  visitDate!: Date;

  @Column("text")
  reason!: string;

  @Column({
    type: "enum",
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  })
  status!: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.siteVisitRequests, {
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
