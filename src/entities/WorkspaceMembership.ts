import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from "typeorm";
import { User, UserRole } from "./User";
import { Workspace } from "./Workspace";

/**
 * A user's role is scoped to one workspace, not global — the same account can
 * be `USER` in one workspace and `SUPER_ADMIN` in another. This join entity
 * is the only source of truth for role; `authMiddleware` resolves
 * `req.user.role` from the row matching (user, req.workspace) on every
 * request, so `req.user.role` checks elsewhere in the codebase are unaffected
 * by this — only code that read `User.role`/`Workspace.members` directly
 * needed to change.
 *
 * `userId`/`workspaceId` are declared explicitly (alongside the `user`/
 * `workspace` relation objects, via `@JoinColumn`) so callers that only need
 * the id — e.g. building a `userId -> role` map — can read `m.userId`
 * directly without loading the full relation.
 */
@Entity()
@Unique(["user", "workspace"])
export class WorkspaceMembership {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column()
  workspaceId!: number;

  @ManyToOne(() => Workspace, (ws) => ws.memberships, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspaceId" })
  workspace!: Workspace;

  @Column({ type: "varchar", default: UserRole.USER })
  role!: UserRole;

  @CreateDateColumn()
  createdAt!: Date;
}
