import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

/**
 * Holds a forgot-password OTP between POST /forgot-password/start and
 * POST /forgot-password/reset — the actual password isn't touched until the
 * OTP is confirmed. One row per email; a fresh /start overwrites any
 * existing pending row for that address, mirroring PendingSignup.
 */
@Entity()
export class PasswordResetOtp {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column()
  otpCode!: string;

  @Column()
  otpExpiresAt!: Date;

  @Column({ default: 0 })
  attempts!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
