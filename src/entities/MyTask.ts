import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { Workspace } from "./Workspace";

export enum MyTaskStatus {
  PENDING = "pending",
  COMPLETED = "completed",
}

@Entity()
export class MyTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column({ type: "date", nullable: true })
  dueDate?: Date | null;

  @Column({ type: "varchar", default: MyTaskStatus.PENDING })
  status!: MyTaskStatus;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user!: User;

  @ManyToOne(() => Workspace, (workspace) => workspace.myTasks, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
