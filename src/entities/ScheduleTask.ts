import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from "typeorm";
import { Project } from "./Project";

/**
 * A single row of a project's schedule (Gantt task). The whole set of rows
 * for a project is saved/replaced together via PUT /projects/:projectId/schedule
 * — see ScheduleService.saveSchedule.
 */
@Entity()
export class ScheduleTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  projectId!: number;

  @ManyToOne(() => Project, { onDelete: "CASCADE", nullable: true })
  project?: Project;

  /** User-facing task id, e.g. "1", "1.1". Unique within a project. */
  @Column()
  taskId!: string;

  @Column()
  taskName!: string;

  /** Duration in days. Null for summary rows with no explicit duration. */
  @Column({ type: "float", nullable: true })
  duration?: number | null;

  @Column({ type: "date", nullable: true })
  startDate?: string | null;

  /** taskId of the owning summary row, or null. */
  @Column({ type: "varchar", nullable: true })
  parentId?: string | null;

  /** Comma-separated list of predecessor taskIds, or null. */
  @Column({ type: "varchar", nullable: true })
  predecessorId?: string | null;

  /** Preserves the row order the user entered/uploaded. */
  @Column({ default: 0 })
  orderIndex!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
