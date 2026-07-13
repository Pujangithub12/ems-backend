import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { Workspace } from "./Workspace";

@Entity()
export class ExpenseRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true, onDelete: "CASCADE" })
  user!: User;

  @Column({ default: "Expense" })
  title!: string;

  @Column("numeric")
  amount!: number;

  @Column({ default: "Other" })
  category!: string;

  @Column()
  expenseDate!: Date;

  @Column("text")
  reason!: string;

  @Column({
    type: "enum",
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  })
  status!: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.expenseRequests, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: "timestamp", nullable: true })
  approvedAt?: Date | null;
}
