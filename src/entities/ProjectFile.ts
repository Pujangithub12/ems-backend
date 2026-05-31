import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Project } from "./Project";

@Entity()
export class ProjectFile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ default: false })
  isFolder!: boolean;

  @Column({ nullable: true })
  type?: string; // e.g., 'pdf', 'docx', 'xlsx'

  @Column({ nullable: true })
  parentId?: number; // For hierarchy

  @ManyToOne(() => Project, (project) => project.id, { onDelete: "CASCADE" })
  project!: Project;

  @CreateDateColumn()
  createdAt!: Date;
}
