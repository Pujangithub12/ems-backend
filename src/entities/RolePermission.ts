import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from "typeorm";

/**
 * Global (not workspace-scoped, since User.role itself is global) grant of a
 * single permission key to a role. Absence of a row for a (role, permissionKey)
 * pair means "use the hardcoded default" — see config/permissions.ts — so this
 * table only needs to hold overrides once a super admin edits the matrix,
 * though it's fully seeded upfront by seedRolePermissions() for simplicity.
 */
@Entity()
@Unique(["role", "permissionKey"])
export class RolePermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  role!: string;

  @Column()
  permissionKey!: string;

  @Column({ default: true })
  granted!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
