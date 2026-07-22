import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Workspace } from "./Workspace";

/**
 * A physical stock location within a workspace. Lightweight by design — no
 * per-location split-stock ledger; an InventoryItem points at exactly one
 * Warehouse as its primary location.
 */
@Entity()
export class Warehouse {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  code?: string;

  @Column({ nullable: true })
  location?: string;

  /** Generic capacity units — compared against summed item quantity for the Warehouse Utilization KPI. */
  @Column({ type: "int", default: 0 })
  capacity!: number;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  workspace!: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
