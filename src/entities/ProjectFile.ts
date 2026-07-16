import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Project } from "./Project";
import { Workspace } from "./Workspace";
import { User } from "./User";

@Entity()
export class ProjectFile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ default: false })
  isFolder!: boolean;

  @Column({ nullable: true })
  type?: string; // e.g., 'pdf', 'docx', 'xlsx' — undefined for folders

  @Column({ nullable: true })
  parentId?: number; // For hierarchy

  /** Size in bytes. Null for folders. */
  @Column({ nullable: true })
  size?: number;

  /** Path relative to the uploads/ directory, e.g. "projects/12/169-report.pdf". Null for folders. */
  @Column({ type: "varchar", nullable: true })
  path?: string;

  @Column({ default: "v1.0" })
  version!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  uploadedBy?: User;

  // Nullable: workspace-level documents (the sidebar Documents page) have no
  // project — only files/folders created from a project's Documents tab set this.
  @ManyToOne(() => Project, (project) => project.files, {
    nullable: true,
    onDelete: "CASCADE",
  })
  project?: Project;

  @ManyToOne(() => Workspace, (workspace) => workspace.files, {
    nullable: true,
    onDelete: "CASCADE",
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
