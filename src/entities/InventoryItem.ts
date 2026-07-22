import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Project } from "./Project";
import { Workspace } from "./Workspace";
import { User } from "./User";
import { Warehouse } from "./Warehouse";
import { Vendor } from "./Vendor";

export type InventoryCategory = "hardware" | "software" | "service";
export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock";

/**
 * A single stock item on a project's Inventory tab. status/category are
 * stored as varchar (not a native Postgres enum) so the allowed value set
 * can change in code without an enum-migration under synchronize:true —
 * mirrors ProcurementItem's status/category columns.
 */
@Entity()
export class InventoryItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  itemName!: string;

  @Column({ type: "varchar", default: "hardware" })
  category!: InventoryCategory;

  @Column({ type: "int", default: 0 })
  quantity!: number;

  /** e.g. "meter", "kg", "box" — free text. */
  @Column({ nullable: true })
  unit?: string;

  @Column({ type: "varchar", default: "in_stock" })
  status!: InventoryStatus;

  @Column({ type: "date", nullable: true })
  lastRestockedDate?: Date;

  @Column("text", { nullable: true })
  notes?: string;

  @Column({ nullable: true })
  sku?: string;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: "SET NULL" })
  warehouse?: Warehouse;

  @Column({ type: "int", default: 0 })
  reservedQuantity!: number;

  @Column({ type: "int", default: 0 })
  incomingQuantity!: number;

  @Column({ type: "numeric", nullable: true })
  averageCost?: number;

  /** Legacy free-text supplier name, kept as a display fallback for items created before Vendor existed. */
  @Column({ nullable: true })
  supplier?: string;

  @ManyToOne(() => Vendor, { nullable: true, onDelete: "SET NULL" })
  vendor?: Vendor;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ type: "date", nullable: true })
  warrantyExpiryDate?: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  updatedBy?: User;

  @ManyToOne(() => Project, (project) => project.inventoryItems, { onDelete: "CASCADE" })
  project!: Project;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE", nullable: true })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
