import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

/**
 * Holds a signup's details (already-hashed password included) between
 * POST /register/start and POST /register/verify — the real User/Workspace
 * rows are only created once the OTP is confirmed. One row per email; a
 * fresh /start overwrites any existing pending row for that address.
 */
@Entity()
export class PendingSignup {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column()
  fullName!: string;

  @Column()
  password!: string;

  @Column()
  otpCode!: string;

  @Column()
  otpExpiresAt!: Date;

  @Column({ default: 0 })
  attempts!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
