import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { ProcurementItem } from "./ProcurementItem";
import { User } from "./User";

/** One status transition on a purchase request — drawer "Status Timeline" + Recent Purchases widget. */
@Entity()
export class ProcurementStatusHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  fromStatus?: string;

  @Column()
  toStatus!: string;

  @Column("text", { nullable: true })
  notes?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  changedBy?: User;

  @ManyToOne(() => ProcurementItem, { onDelete: "CASCADE" })
  procurementItem!: ProcurementItem;

  @CreateDateColumn()
  createdAt!: Date;
}
