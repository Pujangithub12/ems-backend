"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillWorkspace = backfillWorkspace;
const data_source_1 = require("../config/data-source");
const Workspace_1 = require("../entities/Workspace");
const User_1 = require("../entities/User");
const Project_1 = require("../entities/Project");
const Task_1 = require("../entities/Task");
const ProjectHeading_1 = require("../entities/ProjectHeading");
const ProjectFile_1 = require("../entities/ProjectFile");
const Announcement_1 = require("../entities/Announcement");
const LeaveRequest_1 = require("../entities/LeaveRequest");
const MyTask_1 = require("../entities/MyTask");
const CalendarEvent_1 = require("../entities/CalendarEvent");
const Activity_1 = require("../entities/Activity");
async function backfillWorkspace() {
    if (!data_source_1.AppDataSource.isInitialized) {
        await data_source_1.AppDataSource.initialize();
    }
    console.log("Starting workspace backfill...");
    try {
        // Step 1: Get or create default workspace
        let workspace = await data_source_1.AppDataSource.getRepository(Workspace_1.Workspace).findOne({
            where: { name: "EMS Workspace" },
            relations: ["members"],
        });
        if (!workspace) {
            workspace = data_source_1.AppDataSource.getRepository(Workspace_1.Workspace).create({
                name: "EMS Workspace",
                description: "Default workspace for all EMS data",
                members: [],
            });
            await data_source_1.AppDataSource.getRepository(Workspace_1.Workspace).save(workspace);
            console.log("Created default EMS Workspace");
        }
        else {
            console.log("Found existing EMS Workspace");
        }
        // Step 2: Add all existing users as members
        const users = await data_source_1.AppDataSource.getRepository(User_1.User).find();
        workspace.members = [...new Set([...workspace.members, ...users])];
        await data_source_1.AppDataSource.getRepository(Workspace_1.Workspace).save(workspace);
        console.log(`Added ${users.length} users to workspace`);
        // Step 3: Backfill all existing data to use this workspace
        const workspaceId = workspace.id;
        // Backfill Projects
        const projectUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(Project_1.Project)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${projectUpdate.affected} projects`);
        // Backfill Tasks
        const taskUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(Task_1.Task)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${taskUpdate.affected} tasks`);
        // Backfill Project Headings
        const headingUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(ProjectHeading_1.ProjectHeading)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${headingUpdate.affected} project headings`);
        // Backfill Project Files
        const fileUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(ProjectFile_1.ProjectFile)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${fileUpdate.affected} project files`);
        // Backfill Announcements
        const announcementUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(Announcement_1.Announcement)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${announcementUpdate.affected} announcements`);
        // Backfill Leave Requests
        const leaveRequestUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(LeaveRequest_1.LeaveRequest)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${leaveRequestUpdate.affected} leave requests`);
        // Backfill MyTasks
        const myTaskUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(MyTask_1.MyTask)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${myTaskUpdate.affected} my tasks`);
        // Backfill Calendar Events
        const calendarEventUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(CalendarEvent_1.CalendarEvent)
            .set({ workspace: () => `:workspaceId` })
            .where("workspaceId IS NULL")
            .setParameter("workspaceId", workspaceId)
            .execute();
        console.log(`Backfilled ${calendarEventUpdate.affected} calendar events`);
        // Backfill Activities
        const activityUpdate = await data_source_1.AppDataSource.createQueryBuilder()
            .update(Activity_1.Activity)
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
    }
    catch (error) {
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
//# sourceMappingURL=backfill-workspace.js.map