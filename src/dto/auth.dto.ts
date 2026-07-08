/** Body shape for POST /login. */
export interface LoginDto {
  email: string;
  password: string;
}

/**
 * Body shape for POST /register/start. Workspace name isn't collected at
 * signup — a default is generated, renameable later from workspace settings.
 * This only sends a verification code; the account isn't created until
 * POST /register/verify succeeds.
 */
export interface RegisterStartDto {
  fullName: string;
  email: string;
  password: string;
}

/** Body shape for POST /register/verify. */
export interface RegisterVerifyDto {
  email: string;
  otp: string;
}

/** Body shape for PUT /me/password. */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

/** Body shape for PUT /me. */
export interface UpdateMeDto {
  phoneNumber?: string;
  address?: string;
}
