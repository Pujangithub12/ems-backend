import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { InventoryItem } from "./InventoryItem";

/** A batch/lot of stock for an inventory item — Batch Numbers drawer section. */
@Entity()
export class InventoryBatch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  batchNumber!: string;

  @Column({ type: "int", default: 0 })
  quantity!: number;

  @Column({ type: "date", nullable: true })
  manufactureDate?: Date;

  @Column({ type: "date", nullable: true })
  expiryDate?: Date;

  @ManyToOne(() => InventoryItem, { onDelete: "CASCADE" })
  inventoryItem!: InventoryItem;

  @CreateDateColumn()
  createdAt!: Date;
}
