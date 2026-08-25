import { prisma } from "../config/prisma";

/**
 * One-off, manually-invoked reset: deletes every PlantReportCustomField
 * (org-defined "columns" for the Plant Report page), so the page goes back
 * to showing zero fields/columns until an admin defines new ones. Does NOT
 * touch PlantDailyReport.customValues — any now-orphaned keys are simply
 * ignored going forward, same as a normal single-field delete via the admin
 * UI (see PlantReportController's coerceCustomValues).
 *
 * Does NOT touch PlantDailyReport rows themselves (dates/staff/project stay).
 *
 * Invoke manually: `npx ts-node src/utils/reset-plant-report-fields-and-items.ts`
 */
export async function resetPlantReportFieldsAndItems() {
  console.log("Resetting Plant Report custom fields...");

  const { count: fieldsDeleted } = await prisma.plantReportCustomField.deleteMany({});
  console.log(`Deleted ${fieldsDeleted} custom field definition(s).`);

  console.log("Done — the Plant Report table/chart will show no columns until new fields are defined.");
}

if (require.main === module) {
  resetPlantReportFieldsAndItems()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Reset failed:", error);
      process.exit(1);
    });
}
