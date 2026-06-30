import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
} from "typeorm";
import { Project } from "./Project";
import { Task } from "./Task";
import { Workspace } from "./Workspace";

@Entity()
export class ProjectHeading {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToOne(() => Project, (project) => project.headings, { onDelete: "CASCADE" })
  project!: Project;

  @ManyToOne(() => Workspace, { nullable: true })
  workspace?: Workspace;

  @ManyToOne(() => ProjectHeading, (heading) => heading.subHeadings, { nullable: true, onDelete: "CASCADE" })
  parentHeading?: ProjectHeading;

  @OneToMany(() => ProjectHeading, (heading) => heading.parentHeading)
  subHeadings!: ProjectHeading[];

  @OneToMany(() => Task, (task) => task.projectHeading)
  tasks!: Task[];

  @CreateDateColumn()
  createdAt!: Date;
}
