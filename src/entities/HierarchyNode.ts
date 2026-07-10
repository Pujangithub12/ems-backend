import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Workspace } from "./Workspace";
import { User } from "./User";

@Entity()
export class HierarchyNode {
  @PrimaryGeneratedColumn()
  id!: number;

  // Legacy free-text label, from when a node could represent an
  // organization/group rather than a real user. No longer written by new
  // code (every node maps 1:1 to a workspace member) — left in place rather
  // than dropped, since removing it would be a destructive column drop under
  // synchronize:true.
  @Column({ nullable: true, type: "varchar" })
  label?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "CASCADE" })
  user?: User | null;

  @Column({ nullable: true })
  userId?: number;

  @Column({ default: 0 })
  orderIndex!: number;

  // Parent relation = this person's primary (solid-line) manager.
  @ManyToOne(() => HierarchyNode, (node) => node.children, {
    nullable: true,
    onDelete: "CASCADE",
  })
  parent?: HierarchyNode | null;

  @Column({ nullable: true })
  parentId?: number | null;

  @OneToMany(() => HierarchyNode, (node) => node.parent, { cascade: true })
  children?: HierarchyNode[];

  // Additional dotted-line (secondary) managers — any number, independent of
  // the single primary-manager tree above.
  @ManyToMany(() => HierarchyNode)
  @JoinTable()
  secondaryManagers?: HierarchyNode[];

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
