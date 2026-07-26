/** Body shape for POST /users/invite. Only fullName/email are required — the
 * invitee fills in phone/address/job position themselves when accepting. */
export interface CreateInviteDto {
  fullName: string;
  email: string;
  role?: string;
}

/** Body shape for POST /invites/:token/accept — the invitee's own profile
 * details, collected here instead of upfront by the inviting admin. Join
 * date isn't asked for; it's set to the acceptance date automatically. */
export interface AcceptInviteDto {
  password: string;
  phoneNumber: string;
  address: string;
  jobPosition: string;
}
