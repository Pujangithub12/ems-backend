import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { InventoryItem } from "./InventoryItem";
import { Warehouse } from "./Warehouse";
import { User } from "./User";

export type StockTransferStatus = "pending" | "in_transit" | "completed" | "cancelled";

/** A stock move between warehouses for a given inventory item. */
@Entity()
export class StockTransfer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ type: "varchar", default: "pending" })
  status!: StockTransferStatus;

  @Column("text", { nullable: true })
  notes?: string;

  @ManyToOne(() => InventoryItem, { onDelete: "CASCADE" })
  inventoryItem!: InventoryItem;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: "SET NULL" })
  fromWarehouse?: Warehouse;

  @ManyToOne(() => Warehouse, { onDelete: "CASCADE" })
  toWarehouse!: Warehouse;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  requestedBy?: User;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: "timestamp", nullable: true })
  completedAt?: Date;
}
