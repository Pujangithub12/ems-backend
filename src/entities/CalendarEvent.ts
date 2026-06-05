import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity()
export class CalendarEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column()
  date!: Date;

  @Column({ default: "holiday" }) // e.g., holiday, event, deadline
  type!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
