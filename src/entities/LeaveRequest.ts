import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { User } from "./User";

@Entity()
export class LeaveRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true })
  user!: User;

  @Column({ default: "Leave Request" })
  title!: string;

  @Column()
  startDate!: Date;

  @Column()
  endDate!: Date;

  @Column("text")
  reason!: string;

  @Column({
    type: "enum",
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
