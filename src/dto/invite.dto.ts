/** Body shape for POST /users/invite. */
export interface CreateInviteDto {
  fullName: string;
  email: string;
  phoneNumber: string;
  address: string;
  jobPosition: string;
  joinDate: string;
  role?: string;
}

/** Body shape for POST /invites/:token/accept. */
export interface AcceptInviteDto {
  password: string;
}
