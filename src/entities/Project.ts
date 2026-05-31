import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from "typeorm";
import { User } from "./User";
import { TaskPriority, TaskStatus } from "./TaskEnums";
import { ProjectFile } from "./ProjectFile";
import { ProjectHeading } from "./ProjectHeading";
import { Task } from "./Task";

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

  @CreateDateColumn()
  createdAt!: Date;
}
