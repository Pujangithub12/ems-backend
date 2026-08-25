import { prisma } from "../config/prisma";

/**
 * One-off migration: moves PlantDailyReport's fixed steam/water/burner/
 * pellet columns into org-defined PlantReportCustomField values — the
 * columns this script reads are dropped by the Prisma migration that
 * follows it. Run this script FIRST
 * (`ts-node src/utils/migrate-plant-report-fixed-fields.ts`), verify its
 * output, THEN run `prisma migrate dev` to drop the columns.
 *
 * Idempotent: re-running finds the same field names via their
 * @@unique([organizationId, name]) constraint and skips already-migrated
 * report rows (customValues key already present).
 */

type FieldSpec = { column: keyof RawReport; name: string; dataType: "number" | "text" };
const FIELD_SPECS: FieldSpec[] = [
  { column: "steamInitial", name: "Steam Initial", dataType: "number" },
  { column: "steamFinal", name: "Steam Final", dataType: "number" },
  { column: "steamPressure", name: "Steam Pressure", dataType: "number" },
  { column: "steamTemp", name: "Steam Temp", dataType: "number" },
  { column: "feedwaterTemp", name: "Feedwater Temp", dataType: "number" },
  { column: "burnerHours", name: "Burner Hours", dataType: "number" },
  { column: "waterInitial", name: "Water Initial", dataType: "number" },
  { column: "waterFinal", name: "Water Final", dataType: "number" },
  { column: "pelletUsedKg", name: "Pellet Used (kg)", dataType: "number" },
  { column: "pelletReceivedKg", name: "Pellet Received (kg)", dataType: "number" },
  { column: "pelletStockOpening", name: "Pellet Stock Opening (kg)", dataType: "number" },
  { column: "pelletsBag", name: "Pellet Bags", dataType: "number" },
  { column: "burnerStatus", name: "Burner Status", dataType: "text" },
  { column: "shutdownReason", name: "Shutdown Reason", dataType: "text" },
];

type RawReport = {
  id: number;
  organizationId: number;
  projectId: number | null;
  date: Date;
  steamInitial: unknown;
  steamFinal: unknown;
  steamPressure: unknown;
  steamTemp: unknown;
  feedwaterTemp: unknown;
  pelletUsedKg: unknown;
  pelletsBag: unknown;
  pelletReceivedKg: unknown;
  pelletStockOpening: unknown;
  waterInitial: unknown;
  waterFinal: unknown;
  burnerStatus: unknown;
  burnerHours: unknown;
  shutdownReason: unknown;
  customValues: unknown;
};

const toNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

async function ensureCustomField(
  organizationId: number,
  name: string,
  dataType: "number" | "text",
  sortOrder: number,
): Promise<number> {
  const existing = await prisma.plantReportCustomField.findFirst({
    where: { organizationId, name },
  });
  if (existing) return existing.id;
  const created = await prisma.plantReportCustomField.create({
    data: { organizationId, name, dataType, sortOrder },
  });
  return created.id;
}

export async function migratePlantReportFixedFields() {
  console.log("Starting plant report fixed-field migration...");

  const reports = (await prisma.plantDailyReport.findMany({
    orderBy: [{ organizationId: "asc" }, { date: "asc" }],
  })) as unknown as RawReport[];

  if (reports.length === 0) {
    console.log("No PlantDailyReport rows found — nothing to migrate.");
    return;
  }

  const orgIds = [...new Set(reports.map((r) => r.organizationId))];
  console.log(`Found ${reports.length} reports across ${orgIds.length} organization(s).`);

  for (const organizationId of orgIds) {
    const orgReports = reports.filter((r) => r.organizationId === organizationId);

    const hasAnyValue = (spec: FieldSpec) =>
      orgReports.some((r) => r[spec.column] !== null && r[spec.column] !== undefined && r[spec.column] !== "");

    let sortOrder = 1000; // push migrated fields after any fields the org already defined by hand
    const fieldIdByColumn = new Map<keyof RawReport, { id: number; dataType: "number" | "text" }>();

    for (const spec of FIELD_SPECS) {
      if (!hasAnyValue(spec)) continue;
      const fieldId = await ensureCustomField(organizationId, spec.name, spec.dataType, sortOrder++);
      fieldIdByColumn.set(spec.column, { id: fieldId, dataType: spec.dataType });
    }

    let reportsUpdated = 0;

    for (const report of orgReports) {
      const existingCustomValues = (report.customValues as Record<string, unknown> | null) ?? {};
      const newCustomValues: Record<string, unknown> = { ...existingCustomValues };
      let customValuesChanged = false;

      for (const [column, field] of fieldIdByColumn) {
        const key = String(field.id);
        if (key in existingCustomValues) continue; // already migrated
        const raw = report[column];
        if (raw === null || raw === undefined || raw === "") continue;
        newCustomValues[key] = field.dataType === "text" ? String(raw) : toNum(raw);
        customValuesChanged = true;
      }

      if (customValuesChanged) {
        await prisma.plantDailyReport.update({
          where: { id: report.id },
          data: { customValues: newCustomValues as any },
        });
        reportsUpdated++;
      }
    }

    console.log(
      `Org ${organizationId}: ${fieldIdByColumn.size} custom field(s) ensured, ` +
        `${reportsUpdated} report(s) had customValues updated.`,
    );
  }

  console.log("Plant report fixed-field migration completed. Spot-check a few reports before dropping columns.");
}

if (require.main === module) {
  migratePlantReportFixedFields()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
