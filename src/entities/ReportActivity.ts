import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { Workspace } from "./Workspace";

export type ReportActivityAction = "viewed" | "exported";

/** Log of report views/exports — powers the Reports footer's Recent Exports / Recently Viewed lists. */
@Entity()
export class ReportActivity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** e.g. "inventory" | "procurement" | "vendor" | "warehouse" | "project_consumption" | "financial_summary". */
  @Column()
  reportType!: string;

  @Column({ type: "varchar" })
  action!: ReportActivityAction;

  @Column({ nullable: true })
  format?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  performedBy?: User;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  workspace!: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
