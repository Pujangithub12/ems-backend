/** Body shape for POST /projects/:projectId/folders. */
export interface AddProjectFolderDto {
  name: string;
  parentId?: string | number | null;
}

/** Body shape for POST /projects/:projectId/files (multipart; `file` field holds the upload). */
export interface AddProjectFileDto {
  parentId?: string | number | null;
}

/** Body shape for PUT /projects/files/:fileId. */
export interface RenameProjectFileDto {
  name: string;
}
