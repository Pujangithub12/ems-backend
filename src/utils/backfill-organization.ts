import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";

export async function backfillOrganization() {
  console.log("Starting organization backfill...");

  try {
    // Step 1: Get or create default organization
    let organization = await prisma.organization.findFirst({
      where: { name: "EMS Workspace" },
    });

    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          name: "EMS Workspace",
          description: "Default organization for all EMS data",
        },
      });
      console.log("Created default EMS Workspace");
    } else {
      console.log("Found existing EMS Workspace");
    }

    // Step 2: Add all existing users as members — default role `user`;
    // anyone who should have a stronger role gets it via seedAdmin/
    // seedSuperAdmin, an invite, or OrganizationController.grantMemberAccess.
    const users = await prisma.user.findMany();
    const existingMemberships = await prisma.organizationMembership.findMany({
      where: { organizationId: organization.id },
    });
    const memberUserIds = new Set(existingMemberships.map((m) => m.userId));
    const newMemberships = users
      .filter((u) => !memberUserIds.has(u.id))
      .map((u) => ({ userId: u.id, organizationId: organization!.id, role: UserRole.USER }));
    if (newMemberships.length > 0) {
      await prisma.organizationMembership.createMany({ data: newMemberships });
    }
    console.log(`Added ${newMemberships.length} users to organization`);

    // Step 3: Backfill all existing data to use this organization. The
    // `organizationId: null` filters below resolve to the raw, physical DB
    // column `workspaceId IS NULL` (pinned to stay "workspaceId" — see
    // schema.prisma), via the field's @map.
    const organizationId = organization.id;

    const projectUpdate = await prisma.project.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${projectUpdate.count} projects`);

    const taskUpdate = await prisma.task.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${taskUpdate.count} tasks`);

    const headingUpdate = await prisma.projectHeading.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${headingUpdate.count} project headings`);

    const fileUpdate = await prisma.projectFile.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${fileUpdate.count} project files`);

    const announcementUpdate = await prisma.announcement.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${announcementUpdate.count} announcements`);

    const leaveRequestUpdate = await prisma.leaveRequest.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${leaveRequestUpdate.count} leave requests`);

    const myTaskUpdate = await prisma.myTask.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${myTaskUpdate.count} my tasks`);

    const calendarEventUpdate = await prisma.calendarEvent.updateMany({
      where: { organizationId: null },
      data: { organizationId },
    });
    console.log(`Backfilled ${calendarEventUpdate.count} calendar events`);

    console.log("Organization backfill completed successfully! ✨");
  } catch (error) {
    console.error("Error during backfill:", error);
    throw error;
  }
}

// Run the backfill if this file is executed directly
if (require.main === module) {
  backfillOrganization()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exit(1);
    });
}
