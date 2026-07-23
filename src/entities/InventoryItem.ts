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
import { CatalogItem } from "./CatalogItem";

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

  /** Legacy free-text item name, kept as a display fallback for items created before the shared catalog existed — kept in sync with item.name whenever item is set. */
  @Column()
  itemName!: string;

  /** References the shared workspace item catalog (name + code), so item naming/SKU stays consistent across Inventory and Procurement instead of being entered freehand per row. */
  @ManyToOne(() => CatalogItem, { nullable: true, onDelete: "SET NULL" })
  item?: CatalogItem | null;

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

  /** Kept in sync with item.code whenever item is set — retained as a plain column (rather than dropped) so rows created before the catalog existed keep their SKU. */
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
