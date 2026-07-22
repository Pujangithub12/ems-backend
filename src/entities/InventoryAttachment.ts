import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { InventoryItem } from "./InventoryItem";
import { User } from "./User";

/** A document attached to an inventory item — Documents drawer section. */
@Entity()
export class InventoryAttachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  fileName!: string;

  /** Path relative to the uploads/ directory. */
  @Column()
  filePath!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  uploadedBy?: User;

  @ManyToOne(() => InventoryItem, { onDelete: "CASCADE" })
  inventoryItem!: InventoryItem;

  @CreateDateColumn()
  createdAt!: Date;
}
