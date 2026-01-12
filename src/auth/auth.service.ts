import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { EmailService } from '../email/email.service';
import { User } from '../user/entity/user.entity';
import { UserService } from '../user/user.service';
import { AuthPayload } from './interfaces/auth.interface';
import { JwtPayload, JwtResponse } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
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
      else reject(new UnauthorizedException('invalid password'));
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
      throw new UnauthorizedException('invalid token');
    }
  }

  private getRedisKey(email: string, purpose: 'signup' | 'reset' | 'update') {
    return `verification:${purpose}:${email}`;
  }

  async generateAndSendCode(
    email: string,
    purpose: 'signup' | 'reset' | 'update',
  ) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const ttl = 10 * 60;
    const key = this.getRedisKey(email, purpose);

    await this.redis.set(key, code, 'EX', ttl);

    const subjectMap = {
      signup: 'EventSnap - Seu código de verificação',
      reset: 'EventSnap - Redefinição de senha',
      update: 'EventSnap - Atualização de dados',
    };

    const subject = subjectMap[purpose];
    const text = `Seu código de verificação é: ${code}. Válido por 10 minutos.`;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Olá!</h2>
        <p>Você solicitou um código para <strong>${
          purpose === 'signup'
            ? 'cadastro'
            : purpose === 'reset'
              ? 'redefinir sua senha'
              : 'atualizar seus dados'
        }</strong>.</p>
        <div style="background-color: #f4f4f4; padding: 10px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #000;">${code}</span>
        </div>
        <p>Este código expira em 10 minutos.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888;">Se você não solicitou este código, por favor ignore este e-mail.</p>
      </div>
    `;

    //await this.emailService.sendEmail(email, subject, text, html);
    await this.emailService.sendBrevo(email, subject, text, html);
    console.log('code send successfully =>', code);

    return { message: `code sent to ${email}` };
  }

  async validateCode(
    email: string,
    code: string,
    purpose: 'signup' | 'reset' | 'update',
  ) {
    const key = this.getRedisKey(email, purpose);
    const storedCode = await this.redis.get(key);

    if (!storedCode || storedCode !== code) {
      throw new BadRequestException('invalid or expired code');
    }

    return true;
  }

  async forceResetPassword(userId: string, newPassword: string) {
    const user = await this.userService.getUserById(userId);
    await this.userService.resetPasswordByEmail(user.email, newPassword);

    return { message: 'password updated successfully by admin' };
  }
}
