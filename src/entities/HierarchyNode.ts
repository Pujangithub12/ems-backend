import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Workspace } from "./Workspace";
import { User } from "./User";

@Entity()
export class HierarchyNode {
  @PrimaryGeneratedColumn()
  id!: number;

  // Either a user or a label (for organization/root)
  @Column({ nullable: true, type: "varchar" })
  label?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "CASCADE" })
  user?: User | null;

  @Column({ nullable: true })
  userId?: number;

  @Column({ default: 0 })
  orderIndex!: number;

  // Parent relation for hierarchy
  @ManyToOne(() => HierarchyNode, (node) => node.children, {
    nullable: true,
    onDelete: "CASCADE",
  })
  parent?: HierarchyNode | null;

  @Column({ nullable: true })
  parentId?: number;

  @OneToMany(() => HierarchyNode, (node) => node.parent, { cascade: true })
  children?: HierarchyNode[];

  // Link to workspace
  @ManyToOne(() => Workspace, (workspace) => workspace.hierarchyNodes, {
    onDelete: "CASCADE",
  })
  workspace!: Workspace;

  @Column()
  workspaceId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
