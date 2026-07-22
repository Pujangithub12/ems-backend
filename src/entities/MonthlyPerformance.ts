import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from "typeorm";
import { Project } from "./Project";
import { Workspace } from "./Workspace";

/**
 * One row per (project, year, month) on the Energy Performance tab — a
 * monthly generation/financial report for a solar project. Uniqueness of
 * (project, year, month) is enforced at the application level in
 * MonthlyPerformanceController (find-or-create on upsert), not a DB
 * constraint, matching this codebase's existing duplicate-check convention.
 */
@Entity()
export class MonthlyPerformance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  year!: number;

  /** 1-12 (January = 1). */
  @Column()
  month!: number;

  /** Contracted energy for the month, in kWh. */
  @Column({ type: "numeric", nullable: true })
  contractEnergy?: number;

  /** Actual energy generated for the month, in kWh. */
  @Column({ type: "numeric", nullable: true })
  actualGeneration?: number;

  @Column({ type: "numeric", nullable: true })
  incomeReceived?: number;

  @Column({ type: "numeric", nullable: true })
  monthlyExpenditure?: number;

  @Column({ type: "numeric", nullable: true })
  sparePartPurchase?: number;

  @Index()
  @ManyToOne(() => Project, (project) => project.monthlyPerformance, { onDelete: "CASCADE" })
  project!: Project;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE", nullable: true })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
