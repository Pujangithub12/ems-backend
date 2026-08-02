/** Body shape for POST /organizations. */
export interface CreateOrganizationDto {
  name: string;
  description?: string;
  /** Postal address, phone, email, and website — the org's own letterhead details, used e.g. on generated Purchase Order PDFs. */
  address?: string;
  contact?: string;
  email?: string;
  website?: string;
}

/** Body shape for POST /organizations/switch. */
export interface SwitchOrganizationDto {
  organizationId: string | number;
}

/** Body shape for PUT /organizations/:id. */
export interface UpdateOrganizationDto {
  name: string;
  description?: string;
  address?: string;
  contact?: string;
  email?: string;
  website?: string;
}

/** Body shape for DELETE /organizations/:id. */
export interface DeleteOrganizationDto {
  confirmName: string;
}

/** Body shape for PUT /organizations/:id/members/:userId. Role is optional and
 * defaults to UserRole.USER — there's no global role to inherit anymore
 * (role is per-organization, see OrganizationMembership), and older frontend
 * callers that don't send a role should still get a sane default. */
export interface GrantMemberAccessDto {
  role?: string;
}
