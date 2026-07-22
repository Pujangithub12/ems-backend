import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { ProcurementItem } from "./ProcurementItem";
import { User } from "./User";

/** A document attached to a purchase request — Documents drawer section. */
@Entity()
export class ProcurementAttachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  fileName!: string;

  /** Path relative to the uploads/ directory. */
  @Column()
  filePath!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  uploadedBy?: User;

  @ManyToOne(() => ProcurementItem, { onDelete: "CASCADE" })
  procurementItem!: ProcurementItem;

  @CreateDateColumn()
  createdAt!: Date;
}
