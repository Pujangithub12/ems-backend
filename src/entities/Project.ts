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

  @ManyToOne(() => Workspace, (workspace) => workspace.projects, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
