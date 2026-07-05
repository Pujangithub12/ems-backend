import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  JoinTable,
} from "typeorm";
import { User } from "./User";
import { Project } from "./Project";
import { SubTask } from "./SubTask";
import { TaskComment } from "./TaskComment";
import { TaskPriority, TaskStatus } from "./TaskEnums";
import { ProjectHeading } from "./ProjectHeading";
import { Workspace } from "./Workspace";

@Entity()
export class Task {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column({ nullable: true })
  projectName?: string;

  @Column({
    type: "varchar",
    default: TaskPriority.MEDIUM,
  })
  priority!: TaskPriority;

  @Column({
    type: "varchar",
    default: TaskStatus.PENDING,
  })
  status!: TaskStatus;

  @Column({ default: 0 })
  progress!: number;

  @Column()
  dueDate!: Date;

  @ManyToMany(() => User)
  @JoinTable()
  assignedUsers!: User[];

  @ManyToOne(() => Project, (project) => project.projectTasks, {
    nullable: true,
    onDelete: "SET NULL",
  })
  project?: Project;

  @ManyToOne(() => ProjectHeading, (heading) => heading.tasks, {
    nullable: true,
    onDelete: "SET NULL",
  })
  projectHeading?: ProjectHeading;

  @OneToMany(() => SubTask, (subTask) => subTask.task, { cascade: true })
  subTasks!: SubTask[];

  @OneToMany(() => TaskComment, (comment) => comment.task, {
    cascade: true,
  })
  comments!: TaskComment[];

  @Column("simple-array", { nullable: true })
  files!: string[];

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  createdBy?: User;

  @ManyToOne(() => Workspace, (workspace) => workspace.tasks, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
