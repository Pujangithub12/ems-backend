import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";

@Entity()
export class TaskComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("text")
  commentText!: string;

  @Column("text", { nullable: true })
  feedback?: string;

  @ManyToOne(() => User, { eager: true, onDelete: "CASCADE" })
  author!: User;

  @ManyToOne(() => Task, (task) => task.comments, { onDelete: "CASCADE" })
  task!: Task;

  @CreateDateColumn()
  createdAt!: Date;
}
