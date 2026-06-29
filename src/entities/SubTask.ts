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
import { SubTaskComment } from "./SubTaskComment";

// Add this type to track updates
export type SubTaskHistoryItem = {
  id: string;
  date: string;
  title: string;
  progress: number;
  authorId: number;
  authorName: string;
};

@Entity()
export class SubTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: "varchar", default: TaskStatus.PENDING })
  status!: TaskStatus;

  // NEW: Track progress
  @Column({ default: 0 })
  progress!: number;

  // NEW: Track previous updates (stores as JSON in DB)
  @Column({ type: "simple-json", nullable: true })
  history?: SubTaskHistoryItem[];

  @ManyToOne(() => Task, (task) => task.subTasks, { onDelete: "CASCADE" })
  task!: Task;

  @ManyToOne(() => SubTask, (st) => st.children, {
    nullable: true,
    onDelete: "CASCADE",
  })
  parent?: SubTask;

  @OneToMany(() => SubTask, (st) => st.parent, { cascade: true })
  children!: SubTask[];

  @OneToMany(() => SubTaskComment, (comment) => comment.subTask, {
    cascade: true,
  })
  comments!: SubTaskComment[];

  @CreateDateColumn()
  createdAt!: Date;
}
