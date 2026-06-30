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

  @CreateDateColumn()
  createdAt!: Date;
}
