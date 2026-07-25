import { FileAccessLevel, FileGranteeType } from "../entities/FileAccess";

/** One row of the grant list sent back by GET /projects/files/:fileId/access. */
export interface FileAccessGrantDto {
  id: number;
  granteeType: FileGranteeType;
  user?: { id: number; fullName: string; email: string } | null;
  role?: string | undefined;
  level: FileAccessLevel;
}

/** One entry in the body of PUT /projects/files/:fileId/access — full-replace semantics, like ScheduleController/HierarchyController. */
export interface SetFileAccessEntryDto {
  granteeType: FileGranteeType;
  userId?: number;
  role?: string;
  level: FileAccessLevel;
}

export interface SetFileAccessDto {
  grants: SetFileAccessEntryDto[];
}
