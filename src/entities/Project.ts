import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { TaskPriority, TaskStatus } from "./TaskEnums";
import { ProjectFile } from "./ProjectFile";
import { ProjectHeading } from "./ProjectHeading";
import { Task } from "./Task";
import { Workspace } from "./Workspace";
import { ProcurementItem } from "./ProcurementItem";
import { MonthlyPerformance } from "./MonthlyPerformance";
import { InventoryItem } from "./InventoryItem";

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column({ type: "date", nullable: true })
  dueDate?: Date;

  /** Date the client agreement was signed — shown on the Procurement tab's financial summary. */
  @Column({ type: "date", nullable: true })
  contractDate?: Date;

  /** Official project start date — shown on the Procurement tab's financial summary. */
  @Column({ type: "date", nullable: true })
  kickoffDate?: Date;

  /** Total estimated budget for the project, used as the Procurement tab's budget-bar denominator. */
  @Column({ type: "numeric", nullable: true })
  estimatedTotalCost?: number;

  /** Total contract value charged to the client — paired with estimatedTotalCost to derive profit margin. */
  @Column({ type: "numeric", nullable: true })
  sellingPrice?: number;

  @Column({
    type: "varchar",
    default: TaskStatus.PENDING,
  })
  status!: TaskStatus;

  @Column({
    type: "varchar",
    default: TaskPriority.MEDIUM,
  })
  priority!: TaskPriority;

  @ManyToMany(() => User)
  @JoinTable()
  assignees!: User[];

  @OneToMany(() => Task, (task) => task.project)
  projectTasks!: Task[];

  @OneToMany(() => ProjectHeading, (heading) => heading.project)
  headings!: ProjectHeading[];

  @OneToMany(() => ProjectFile, (file) => file.project)
  files!: ProjectFile[];

  @OneToMany(() => ProcurementItem, (item) => item.project)
  procurementItems!: ProcurementItem[];

  @OneToMany(() => MonthlyPerformance, (row) => row.project)
  monthlyPerformance!: MonthlyPerformance[];

  @OneToMany(() => InventoryItem, (item) => item.project)
  inventoryItems!: InventoryItem[];

  @ManyToOne(() => Workspace, (workspace) => workspace.projects, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
