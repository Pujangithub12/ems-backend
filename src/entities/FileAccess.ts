import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { ProjectFile } from "./ProjectFile";
import { User } from "./User";
import { Workspace } from "./Workspace";

export type FileAccessLevel = "none" | "read" | "write";
export type FileGranteeType = "user" | "role";

/**
 * An explicit access grant on one ProjectFile node (file or folder). Access
 * is resolved by walking up ProjectFile.parentId from the target node to the
 * root, using the nearest node that has a grant for the requesting user
 * (checked as a "user" grantee first, then "role") — see
 * backend/src/utils/fileAccess.ts. A node with no grant anywhere in its
 * ancestor chain resolves to "none" (closed) for non-admins; super_admin/
 * admin always bypass to full access, since they're the only roles that can
 * manage these grants in the first place.
 */
@Entity()
export class FileAccess {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ProjectFile, { onDelete: "CASCADE" })
  file!: ProjectFile;

  @Column({ type: "varchar" })
  granteeType!: FileGranteeType;

  /** Set when granteeType is "user". */
  @ManyToOne(() => User, { nullable: true, onDelete: "CASCADE" })
  user?: User | null;

  /** Set when granteeType is "role" — one of finance | user (admin/super_admin never need a grant). */
  @Column({ nullable: true })
  role?: string;

  @Column({ type: "varchar" })
  level!: FileAccessLevel;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  workspace!: Workspace;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  grantedBy?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
