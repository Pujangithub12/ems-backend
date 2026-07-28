/**
 * TypeORM's `simple-array` column type stored a string[] as a single
 * comma-joined text column and (de)serialized it transparently. Prisma has
 * no equivalent column type, so every read/write site for one of these
 * columns (Task.files, Announcement.targetEmails) must convert explicitly —
 * these two helpers reproduce TypeORM's exact behavior (empty/null -> [],
 * joined with a plain comma, no escaping).
 */
export function toSimpleArray(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").filter((v) => v.length > 0);
}

export function fromSimpleArray(value: string[] | null | undefined): string {
  if (!value || value.length === 0) return "";
  return value.join(",");
}
