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
import { Vendor } from "./Vendor";
import { CatalogItem } from "./CatalogItem";

export type ProcurementStatus = "pending" | "approved" | "ordered" | "delivered";
export type ProcurementCategory = "hardware" | "software" | "service";

/**
 * A single line item on a project's Procurement tab — a purchase request tracker.
 * status/category are stored as varchar (not a native Postgres enum) so the
 * allowed value set can change in code without an enum-migration under
 * synchronize:true — mirrors Project.status/priority.
 */
@Entity()
export class ProcurementItem {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Legacy free-text item name, kept as a display fallback for items created before the shared catalog existed — kept in sync with item.name whenever item is set. */
  @Column()
  itemName!: string;

  /** References the shared workspace item catalog (name + code), so item naming stays consistent across Inventory and Procurement instead of being entered freehand per row. */
  @ManyToOne(() => CatalogItem, { nullable: true, onDelete: "SET NULL" })
  item?: CatalogItem | null;

  /** Auto-generated on create, e.g. "PO-000123" (zero-padded id). */
  @Column({ nullable: true })
  poNumber?: string;

  @Column({ type: "varchar", default: "hardware" })
  category!: ProcurementCategory;

  @Column({ type: "int", default: 1 })
  quantity!: number;

  @Column({ type: "numeric", nullable: true })
  estimatedCost?: number;

  /** Per-unit cost; estimatedCost is left as the existing total-cost field (read by budget calcs elsewhere). */
  @Column({ type: "numeric", nullable: true })
  unitCost?: number;

  /** Legacy free-text vendor name, kept as a display fallback for POs created before Vendor existed. */
  @Column({ nullable: true })
  vendorName?: string;

  @ManyToOne(() => Vendor, { nullable: true, onDelete: "SET NULL" })
  vendor?: Vendor;

  @Column({ type: "date", nullable: true })
  neededByDate?: Date;

  @Column({ type: "varchar", default: "pending" })
  status!: ProcurementStatus;

  @Column("text", { nullable: true })
  notes?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  requestedBy?: User;

  @ManyToOne(() => Project, (project) => project.procurementItems, {
    onDelete: "CASCADE",
  })
  project!: Project;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE", nullable: true })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
