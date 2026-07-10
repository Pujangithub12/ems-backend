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

  @Column()
  phoneNumber!: string;

  @Column("text")
  address!: string;

  @Column()
  jobPosition!: string;

  @Column()
  joinDate!: Date;

  @Column({
    type: "varchar",
    default: UserRole.USER,
  })
  role!: UserRole;

  @Column()
  workspaceId!: number;

  @Column({ unique: true })
  token!: string;

  @Column()
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
