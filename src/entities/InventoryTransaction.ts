import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { InventoryItem } from "./InventoryItem";
import { User } from "./User";
import { Workspace } from "./Workspace";

export type InventoryTransactionType =
  | "receipt"
  | "issue"
  | "adjustment"
  | "transfer_in"
  | "transfer_out";

/**
 * Audit log entry written by every stock-affecting mutation. Powers the
 * item drawer's "Inventory Transactions" section and the workspace-page
 * "Recent Inventory Transactions" sidebar widget.
 */
@Entity()
export class InventoryTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar" })
  type!: InventoryTransactionType;

  /** Signed change in quantity (e.g. -5 for an issue, +10 for a receipt). */
  @Column({ type: "int" })
  quantityChange!: number;

  @Column({ type: "int" })
  resultingQuantity!: number;

  @Column("text", { nullable: true })
  reason?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  performedBy?: User;

  @ManyToOne(() => InventoryItem, { onDelete: "CASCADE" })
  inventoryItem!: InventoryItem;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE", nullable: true })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
