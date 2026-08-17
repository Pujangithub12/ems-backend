import { prisma } from "../config/prisma";

/**
 * One-off, manually-invoked migration (NOT wired into server startup, same
 * as migrate-schedule-to-task.ts) that backfills the new item-tracking model
 * (PlantReportItem/PlantReportItemEntry) from the pellet-specific columns
 * that have lived directly on PlantDailyReport (pelletUsedKg, pelletsBag,
 * pelletReceivedKg, pelletStockOpening). For every organization that has at
 * least one PlantDailyReport, creates a "Pellets" (kg) item and one
 * PlantReportItemEntry per existing report, copying those columns across.
 *
 * DATA SAFETY: only reads PlantDailyReport (never modifies or deletes the
 * pellet* columns — they stay in the schema for now, see the rollout plan
 * in the Plant Report items feature) and only inserts new
 * PlantReportItem/PlantReportItemEntry rows.
 *
 * Idempotent per organization: an organization that already has a "Pellets"
 * item is skipped entirely on a re-run. Invoke manually once after
 * deploying the schema: `npx ts-node src/utils/migrate-plant-report-pellets-to-items.ts`.
 */
export async function migratePlantReportPelletsToItems() {
  console.log("Starting pellet columns -> PlantReportItem backfill...");

  const orgIds = await prisma.plantDailyReport.findMany({
    select: { organizationId: true },
    distinct: ["organizationId"],
  });

  let orgsMigrated = 0;
  let orgsSkipped = 0;

  for (const { organizationId } of orgIds) {
    const existingPelletsItem = await prisma.plantReportItem.findFirst({
      where: { organizationId, name: "Pellets" },
    });
    if (existingPelletsItem) {
      console.log(`Org ${organizationId}: Pellets item already exists, skipping`);
      orgsSkipped += 1;
      continue;
    }

    const pelletsItem = await prisma.plantReportItem.create({
      data: { organizationId, name: "Pellets", unit: "kg", trackStock: true, sortOrder: 0 },
    });

    const reports = await prisma.plantDailyReport.findMany({ where: { organizationId } });
    if (reports.length === 0) continue;

    await prisma.plantReportItemEntry.createMany({
      data: reports.map((r) => ({
        reportId: r.id,
        itemId: pelletsItem.id,
        openingStock: r.pelletStockOpening,
        receivedQty: r.pelletReceivedKg,
        usedQty: r.pelletUsedKg,
      })),
    });

    console.log(`Org ${organizationId}: created Pellets item + ${reports.length} entries`);
    orgsMigrated += 1;
  }

  console.log(
    `Backfill complete: ${orgsMigrated} organization(s) migrated, ${orgsSkipped} organization(s) skipped (already had a Pellets item).`,
  );
}

if (require.main === module) {
  migratePlantReportPelletsToItems()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exit(1);
    });
}
