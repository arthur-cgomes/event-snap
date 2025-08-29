import { IsOptional, IsString } from 'class-validator';

export type UsersCountParams = {
  start?: string | Date;
  end?: string | Date;
  tz?: string;
};

export type UsersCountResponse = {
  usersCreated: number;
  usersLoggedIn: number;
  window: { from: Date; to: Date; tz: string };
};

export class DashAdminQueryDto {
  @IsOptional() @IsString() start?: string;
  @IsOptional() @IsString() end?: string;
  @IsOptional() @IsString() tz?: string;
}
