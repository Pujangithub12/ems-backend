/** Body shape for POST /workspace/folders. */
export interface AddWorkspaceFolderDto {
  name: string;
  parentId?: string | number | null;
}

/** Body shape for POST /workspace/files (multipart; `file` field holds the upload). */
export interface AddWorkspaceFileDto {
  parentId?: string | number | null;
}
