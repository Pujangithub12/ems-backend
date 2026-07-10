/** Body shape for PUT /users/:id. */
export interface UpdateUserDto {
  fullName?: string;
  email?: string;
  password?: string;
  phoneNumber?: string;
  address?: string;
  jobPosition?: string;
  joinDate?: string;
  role?: string;
}
