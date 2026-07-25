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

  /** Vendor's phone number. */
  @Column({ nullable: true })
  contact?: string;

  @Column({ type: "date", nullable: true })
  contractExpiryDate?: Date;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  workspace!: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
