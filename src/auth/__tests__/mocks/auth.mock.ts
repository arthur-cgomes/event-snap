import { User } from '../../../user/entity/user.entity';
import {
  JwtPayload,
  JwtResponse,
} from '../../interfaces/jwt-payload.interface';

export const mockJwtPayload: JwtPayload = {
  email: 'arthur.gomes@dev.com.br',
  userId: '7ed5c779-2b02-4a29-a47d-3806930fa7b6',
  name: 'Arthur Gomes',
  userType: 'user',
};

export const mockJwtResponse: JwtResponse = {
  expiresIn: 7200,
  token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFydGh1ci5nb21lc0BkZXYuY29tLmJyIiwidXNlcklkIjoiN2VkNWM3NzktMmIwMi00YTI5LWE0N2QtMzgwNjkzMGZhN2I2IiwiaWF0IjoxNjkzNjY2MTc0LCJleHAiOjE2OTM2NzMzNzR9.a-XA9orqANdoGZI78IhZJiLbaj0OMK4OhSFa8-lEpSY',
  userId: '7ed5c779-2b02-4a29-a47d-3806930fa7b6',
  name: 'Arthur Gomes',
  userType: 'user',
};

export const mockUser = {
  id: 'userId',
  email: 'email@agtecnologia.com.br',
  name: 'Arthur Gomes',
} as User;
