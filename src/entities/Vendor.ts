import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Workspace } from "./Workspace";

/** A supplier/vendor master record within a workspace, selectable from inventory items. */
@Entity()
export class Vendor {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  code?: string;

  @Column({ nullable: true })
  location?: string;

  /** 1-5, set from the Vendors modal — feeds the Reports "Vendor Performance" scatter chart. */
  @Column({ type: "int", nullable: true })
  rating?: number;

  @Column({ type: "date", nullable: true })
  contractExpiryDate?: Date;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  workspace!: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
