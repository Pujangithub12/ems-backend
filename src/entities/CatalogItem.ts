import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Workspace } from "./Workspace";

/**
 * A master item name + code, shared between the Inventory and Procurement
 * "Add item" forms so item naming stays consistent across both instead of
 * drifting into near-duplicate spellings per project. Mirrors Vendor's shape.
 */
@Entity()
export class CatalogItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  code?: string;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  workspace!: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
