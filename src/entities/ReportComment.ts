import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { User } from "./User";
import { Workspace } from "./Workspace";

/**
 * A note left on a Reports-page chart/section. reportKey identifies which
 * chart it belongs to (e.g. "procurement-cost-trend") rather than a relation,
 * since reports themselves aren't persisted objects.
 */
@Entity()
export class ReportComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  reportKey!: string;

  @Column("text")
  body!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  createdBy?: User;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  workspace!: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
