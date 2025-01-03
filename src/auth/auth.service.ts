import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../user/entity/user.entity';
import { UserService } from '../user/user.service';
import { AuthPayload } from './interfaces/auth.interface';
import { JwtPayload, JwtResponse } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUserByPassword(
    loginAttempt: AuthPayload,
  ): Promise<JwtResponse> {
    const userToAttempt = await this.userService.checkUserToLogin(
      loginAttempt.email,
    );

    return new Promise((resolve, reject) => {
      if (userToAttempt.checkPassword(loginAttempt.password))
        resolve(this.createJwtPayload(userToAttempt));
      else reject(new ForbiddenException('Senha inválida'));
    });
  }

  async createJwtPayload(user: User): Promise<JwtResponse> {
    const data: JwtPayload = {
      email: user.email,
      userId: user.id,
      name: user.name,
      userType: user.userType,
    };

    const jwt = this.jwtService.sign(data);

    return {
      expiresIn: parseInt(process.env.EXPIRE_IN),
      token: jwt,
      userId: user.id,
      name: user.name,
      userType: user.userType,
    };
  }

  async validateUserByJwt(payload: JwtPayload) {
    const user = await this.userService.checkUserToLogin(payload.email);
    if (user) {
      return this.createJwtPayload(user);
    } else {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
