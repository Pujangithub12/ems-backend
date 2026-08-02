/** Body shape for POST /organization/folders. */
export interface AddOrganizationFolderDto {
  name: string;
  parentId?: string | number | null;
}

/** Body shape for POST /organization/files (multipart; `file` field holds the upload). */
export interface AddOrganizationFileDto {
  parentId?: string | number | null;
}
