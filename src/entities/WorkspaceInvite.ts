import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { UserRole } from "./User";

/**
 * A pending invitation to join a workspace, created by an admin/super admin
 * via "Invite Members". No User row exists until the invitee opens the
 * emailed accept link and sets a password (see InviteController.acceptInvite)
 * — mirrors PendingSignup's "don't persist until confirmed" pattern.
 */
@Entity()
export class WorkspaceInvite {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column()
  fullName!: string;

  // Phone/address/job position are no longer collected from the inviting
  // admin — the invitee fills these in themselves when accepting (see
  // InviteController.acceptInvite) — so these stay empty on the invite row
  // itself and only exist here at all for backward compatibility with any
  // pre-existing pending invites.
  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ type: "text", nullable: true })
  address?: string;

  @Column({ nullable: true })
  jobPosition?: string;

  @Column({ nullable: true })
  joinDate?: Date;

  @Column({
    type: "varchar",
    default: UserRole.USER,
  })
  role!: UserRole;

  @Column()
  workspaceId!: number;

  // Who sent this invite — used to place the new member under them in the
  // hierarchy org chart once accepted (see InviteController.acceptInvite).
  // Nullable so pre-existing invite rows from before this column existed
  // don't break; those just skip auto-placement.
  @Column({ type: "int", nullable: true })
  invitedByUserId!: number | null;

  @Column({ unique: true })
  token!: string;

  @Column()
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
