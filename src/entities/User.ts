import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { UserRole } from "./TaskEnums";
import { WorkspaceMembership } from "./WorkspaceMembership";

export { UserRole };

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  fullName!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column()
  phoneNumber!: string;

  @Column("text")
  address!: string;

  @Column()
  jobPosition!: string;

  @Column()
  joinDate!: Date;

  // Role lives on WorkspaceMembership, not here — the same account can be
  // `USER` in one workspace and `SUPER_ADMIN` in another. `req.user.role` is
  // resolved per-request by authMiddleware from the membership row matching
  // (this user, req.workspace); there is no longer a single global role.
  @OneToMany(() => WorkspaceMembership, (m) => m.user)
  memberships!: WorkspaceMembership[];

  // Set once, at account-creation time, for users created via an accepted
  // workspace invite (see InviteController.acceptInvite) — the one workspace
  // this account may ever use. Null for self-registered "owner" accounts
  // (see AuthController.registerVerify), which are free to create/switch
  // between as many workspaces as they like. Never updated after creation.
  @Column({ type: "int", nullable: true })
  homeWorkspaceId!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}
