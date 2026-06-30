import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  JoinTable,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { Workspace } from "./Workspace";

@Entity()
export class Announcement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  subject!: string;

  @Column("text")
  message!: string;

  @Column({ default: "all" })
  targetType!: string; // "all" or "specific"

  @Column("simple-array", { nullable: true })
  targetEmails!: string[];

  @ManyToOne(() => Workspace, (workspace) => workspace.announcements, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
