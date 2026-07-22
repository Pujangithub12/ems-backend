import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { InventoryItem } from "./InventoryItem";

export type InventorySerialStatus = "available" | "allocated" | "damaged" | "sold";

/** A serialized unit of an inventory item — Serial Numbers drawer section. */
@Entity()
export class InventorySerial {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  serialNumber!: string;

  @Column({ type: "varchar", default: "available" })
  status!: InventorySerialStatus;

  @Column({ type: "date", nullable: true })
  warrantyExpiryDate?: Date;

  @Column("text", { nullable: true })
  notes?: string;

  @ManyToOne(() => InventoryItem, { onDelete: "CASCADE" })
  inventoryItem!: InventoryItem;

  @CreateDateColumn()
  createdAt!: Date;
}
