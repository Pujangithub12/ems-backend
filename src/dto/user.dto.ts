/** Body shape for POST /users. */
export interface CreateUserDto {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  address: string;
  jobPosition: string;
  joinDate: string;
  role?: string;
}

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
