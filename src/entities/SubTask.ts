import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
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

  @Column({ type: "varchar", default: TaskStatus.PENDING })
  status!: TaskStatus;

  @ManyToOne(() => Task, (task) => task.subTasks, { onDelete: "CASCADE" })
  task!: Task;

  // Self-relation for nesting
  @ManyToOne(() => SubTask, (st) => st.children, {
    nullable: true,
    onDelete: "CASCADE",
  })
  parent?: SubTask;

  @OneToMany(() => SubTask, (st) => st.parent, { cascade: true })
  children!: SubTask[];

  @CreateDateColumn()
  createdAt!: Date;
}
