import { AppDataSource } from "../config/data-source";
import { UserRole } from "../entities/User";
import { WorkspaceMembership } from "../entities/WorkspaceMembership";

/**
 * One-time migration for the role-per-workspace refactor: for every existing
 * (user, workspace) pair in the pre-refactor `workspace_members_user` join
 * table, creates a WorkspaceMembership row copying that user's *then-current*
 * (global, at the time this runs) `role` value verbatim. Zero behavior
 * change on the day this runs — every user keeps the exact same role in
 * every workspace they're already in; divergence only becomes possible
 * afterward, once code stops reading the old global role and starts reading
 * WorkspaceMembership.
 *
 * Reads the legacy `user.role` column / `workspace_members_user` table via
 * raw SQL rather than the TypeORM entities: `User`/`Workspace` no longer
 * declare `role`/`members` (this refactor removed them), so this script
 * would otherwise only compile against an environment that still has the
 * old schema. Raw SQL keeps it usable against any environment that hasn't
 * been migrated yet, regardless of what the current entity code looks like.
 *
 * MUST be run — and finish successfully — BEFORE deploying the code that
 * removes `role`/`members` from the entities. `synchronize: true` (see
 * data-source.ts) applies schema changes on every app boot, so once those
 * fields are gone from the entity definitions, the very next server start
 * drops the `user.role` column and the `workspace_members_user` table for
 * good — there would be nothing left to migrate. (In this repo, that step
 * has already happened — see the WorkspaceMembership entity change — so
 * this is kept for replaying against any other environment, e.g. staging or
 * production, that's still on the old schema.)
 *
 * Idempotent: skips any (user, workspace) pair that already has a
 * WorkspaceMembership row, and no-ops cleanly if the legacy column/table are
 * already gone, so it's safe to run more than once, or against an
 * already-migrated database.
 */
export async function migrateWorkspaceMembership() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  console.log("Starting workspace membership migration...");

  let legacyRows: Array<{ userId: number; workspaceId: number; role: string }>;
  try {
    legacyRows = await AppDataSource.query(`
      SELECT wmu."userId" AS "userId", wmu."workspaceId" AS "workspaceId", u."role" AS "role"
      FROM "workspace_members_user" wmu
      INNER JOIN "user" u ON u."id" = wmu."userId"
    `);
  } catch {
    console.log(
      "Legacy user.role column / workspace_members_user table not found — nothing to " +
        "migrate (already migrated, or a fresh install with no pre-refactor data).",
    );
    return;
  }

  const membershipRepo = AppDataSource.getRepository(WorkspaceMembership);
  const existing = await membershipRepo.find();
  const existingKeys = new Set(existing.map((m) => `${m.userId}:${m.workspaceId}`));

  const toInsert = legacyRows
    .filter((row) => !existingKeys.has(`${row.userId}:${row.workspaceId}`))
    .map((row) =>
      membershipRepo.create({
        userId: row.userId,
        workspaceId: row.workspaceId,
        role: row.role as UserRole,
      }),
    );

  if (toInsert.length > 0) {
    await membershipRepo.save(toInsert);
  }

  console.log(
    `Migration complete: ${toInsert.length} membership row(s) created, ${existing.length} already existed.`,
  );
}

// Run directly via `npx ts-node src/utils/migrate-workspace-membership.ts`.
if (require.main === module) {
  migrateWorkspaceMembership()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
