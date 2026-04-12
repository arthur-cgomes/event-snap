export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  userType: string;
}

export interface JwtResponse {
  expiresIn: number;
  token: string;
  userId: string;
  name: string;
  userType: string;
}
