import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from "typeorm";
import { User } from "./User";
import { SubTask } from "./SubTask";

@Entity()
export class SubTaskComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("text")
  commentText!: string;

  @Column("text", { nullable: true })
  feedback?: string;

  @ManyToOne(() => User, { eager: true })
  author!: User;

  @ManyToOne(() => SubTask, (subTask) => subTask.comments, { onDelete: "CASCADE" })
  subTask!: SubTask;

  @CreateDateColumn()
  createdAt!: Date;
}
