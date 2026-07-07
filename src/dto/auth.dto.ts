/** Body shape for POST /login. */
export interface LoginDto {
  email: string;
  password: string;
}

/** Body shape for PUT /me/password. */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}
