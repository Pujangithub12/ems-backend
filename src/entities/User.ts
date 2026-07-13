import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
} from "typeorm";
import { UserRole } from "./TaskEnums";
import { Workspace } from "./Workspace";

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

  @Column({
    type: "varchar",
    default: UserRole.USER,
  })
  role!: UserRole;

  @ManyToMany(() => Workspace, (workspace) => workspace.members)
  workspaces!: Workspace[];

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
