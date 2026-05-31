import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from "typeorm";
import { Task } from "./Task";
import { TaskStatus } from "./TaskEnums";

@Entity()
export class SubTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({
    type: "varchar",
    default: TaskStatus.PENDING,
  })
  status!: TaskStatus;

  @ManyToOne(() => Task, (task) => task.subTasks, { onDelete: "CASCADE" })
  task!: Task;

  @CreateDateColumn()
  createdAt!: Date;
}
