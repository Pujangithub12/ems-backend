import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  OneToMany,
  JoinTable,
} from "typeorm";
import { User } from "./User";
import { Task } from "./Task";
import { Project } from "./Project";
import { Announcement } from "./Announcement";
import { LeaveRequest } from "./LeaveRequest";
import { SiteVisitRequest } from "./SiteVisitRequest";
import { ExpenseRequest } from "./ExpenseRequest";
import { MyTask } from "./MyTask";
import { CalendarEvent } from "./CalendarEvent";
import { Activity } from "./Activity";
import { HierarchyNode } from "./HierarchyNode";

@Entity()
export class Workspace {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @ManyToMany(() => User, (user) => user.workspaces)
  @JoinTable()
  members!: User[];

  @OneToMany(() => Task, (task) => task.workspace, { cascade: true })
  tasks!: Task[];

  @OneToMany(() => Project, (project) => project.workspace, { cascade: true })
  projects!: Project[];

  @OneToMany(() => Announcement, (ann) => ann.workspace, { cascade: true })
  announcements!: Announcement[];

  @OneToMany(() => LeaveRequest, (lr) => lr.workspace, { cascade: true })
  leaveRequests!: LeaveRequest[];

  @OneToMany(() => SiteVisitRequest, (sv) => sv.workspace, { cascade: true })
  siteVisitRequests!: SiteVisitRequest[];

  @OneToMany(() => ExpenseRequest, (er) => er.workspace, { cascade: true })
  expenseRequests!: ExpenseRequest[];

  @OneToMany(() => MyTask, (mt) => mt.workspace, { cascade: true })
  myTasks!: MyTask[];

  @OneToMany(() => CalendarEvent, (ce) => ce.workspace, { cascade: true })
  calendarEvents!: CalendarEvent[];

  @OneToMany(() => Activity, (act) => act.workspace, { cascade: true })
  activities!: Activity[];

  @OneToMany(() => HierarchyNode, (node) => node.workspace, { cascade: true })
  hierarchyNodes!: HierarchyNode[];

  @CreateDateColumn()
  createdAt!: Date;
}
