/** Frontend org-chart tree node shape used to save the hierarchy. */
export interface HierarchyTreeNodeDto {
  id: string;
  dbId?: number;
  label?: string;
  userId?: number;
  children: HierarchyTreeNodeDto[];
}

/** Body shape for PUT /hierarchy. */
export interface SaveHierarchyDto {
  tree: HierarchyTreeNodeDto;
}
