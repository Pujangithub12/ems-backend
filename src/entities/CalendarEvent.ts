import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Workspace } from "./Workspace";

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

  @ManyToOne(() => Workspace, (workspace) => workspace.calendarEvents, {
    onDelete: "CASCADE",
    nullable: true,
  })
  workspace?: Workspace;

  @CreateDateColumn()
  createdAt!: Date;
}
