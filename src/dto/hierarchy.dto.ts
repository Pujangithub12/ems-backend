/**
 * Flat, per-person shape — one entry per workspace member. There's no more
 * nested tree or arbitrary label-only nodes; `primaryManagerId`/
 * `secondaryManagerIds` reference other entries' `id` directly.
 */
export interface HierarchyPersonDto {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  jobPosition: string;
  role: string;
  joinDate: string;
  primaryManagerId: number | null;
  secondaryManagerIds: number[];
}

/** Body shape for PUT /hierarchy. */
export interface SaveHierarchyDto {
  people: Array<{
    id: number;
    primaryManagerId: number | null;
    secondaryManagerIds: number[];
  }>;
}
