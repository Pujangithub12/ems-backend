import { AppDataSource } from "../config/data-source";
import { Workspace } from "../entities/Workspace";
import { User } from "../entities/User";
import { Project } from "../entities/Project";
import { Task } from "../entities/Task";
import { ProjectHeading } from "../entities/ProjectHeading";
import { ProjectFile } from "../entities/ProjectFile";
import { Announcement } from "../entities/Announcement";
import { LeaveRequest } from "../entities/LeaveRequest";
import { MyTask } from "../entities/MyTask";
import { CalendarEvent } from "../entities/CalendarEvent";
import { Activity } from "../entities/Activity";

export async function backfillWorkspace() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  console.log("Starting workspace backfill...");

  try {
    // Step 1: Get or create default workspace
    let workspace = await AppDataSource.getRepository(Workspace).findOne({
      where: { name: "EMS Workspace" },
      relations: ["members"],
    });

    if (!workspace) {
      workspace = AppDataSource.getRepository(Workspace).create({
        name: "EMS Workspace",
        description: "Default workspace for all EMS data",
        members: [],
      });
      await AppDataSource.getRepository(Workspace).save(workspace);
      console.log("Created default EMS Workspace");
    } else {
      console.log("Found existing EMS Workspace");
    }

    // Step 2: Add all existing users as members
    const users = await AppDataSource.getRepository(User).find();
    workspace.members = [...new Set([...workspace.members, ...users])];
    await AppDataSource.getRepository(Workspace).save(workspace);
    console.log(`Added ${users.length} users to workspace`);

    // Step 3: Backfill all existing data to use this workspace
    const workspaceId = workspace.id;

    // Backfill Projects
    const projectUpdate = await AppDataSource.createQueryBuilder()
      .update(Project)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${projectUpdate.affected} projects`);

    // Backfill Tasks
    const taskUpdate = await AppDataSource.createQueryBuilder()
      .update(Task)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${taskUpdate.affected} tasks`);

    // Backfill Project Headings
    const headingUpdate = await AppDataSource.createQueryBuilder()
      .update(ProjectHeading)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${headingUpdate.affected} project headings`);

    // Backfill Project Files
    const fileUpdate = await AppDataSource.createQueryBuilder()
      .update(ProjectFile)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${fileUpdate.affected} project files`);

    // Backfill Announcements
    const announcementUpdate = await AppDataSource.createQueryBuilder()
      .update(Announcement)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${announcementUpdate.affected} announcements`);

    // Backfill Leave Requests
    const leaveRequestUpdate = await AppDataSource.createQueryBuilder()
      .update(LeaveRequest)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${leaveRequestUpdate.affected} leave requests`);

    // Backfill MyTasks
    const myTaskUpdate = await AppDataSource.createQueryBuilder()
      .update(MyTask)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${myTaskUpdate.affected} my tasks`);

    // Backfill Calendar Events
    const calendarEventUpdate = await AppDataSource.createQueryBuilder()
      .update(CalendarEvent)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${calendarEventUpdate.affected} calendar events`);

    // Backfill Activities
    const activityUpdate = await AppDataSource.createQueryBuilder()
      .update(Activity)
      .set({ workspace: () => `:workspaceId` })
      .where("workspaceId IS NULL")
      .setParameter("workspaceId", workspaceId)
      .execute();
    console.log(`Backfilled ${activityUpdate.affected} activities`);

    console.log("Workspace backfill completed successfully! ✨");

    // Optional: If you want to make workspace required after backfill, you can uncomment
    // But for now, we'll keep it optional to be safe
    /*
    console.log("\nMaking workspace relation required...");
    // You would run ALTER TABLE commands here
    */
  } catch (error) {
    console.error("Error during backfill:", error);
    throw error;
  }
}

// Run the backfill if this file is executed directly
if (require.main === module) {
  backfillWorkspace()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exit(1);
    });
}
