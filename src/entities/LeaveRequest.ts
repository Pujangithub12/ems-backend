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

  @Column()
  startDate!: Date;

  @Column()
  endDate!: Date;

  @Column("text")
  reason!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
