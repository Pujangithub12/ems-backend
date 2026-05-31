import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToMany, JoinTable } from "typeorm";
import { User } from "./User";

@Entity()
export class Announcement {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    subject!: string;

    @Column("text")
    message!: string;

    @Column({ default: "all" })
    targetType!: string; // "all" or "specific"

    @Column("simple-array", { nullable: true })
    targetEmails!: string[];

    @CreateDateColumn()
    createdAt!: Date;
}
