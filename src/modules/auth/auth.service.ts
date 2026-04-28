import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { randomBytes } from 'crypto';
import { DispatcherEmailService } from '../dispatcher-email/dispatcher-email.service';
import { User } from '../user/entity/user.entity';
import { UserService } from '../user/user.service';
import { AuthPayload } from './interfaces/auth.interface';
import { JwtPayload, JwtResponse } from './interfaces/jwt-payload.interface';
import { APP_CONSTANTS } from '../../common/constants';
import { supabase } from '../../common/config/supabase.config';

@Injectable()
export class AuthService {
  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly dispatcherEmailService: DispatcherEmailService,
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

  async validateUserByJwt(payload: JwtPayload): Promise<User> {
    const user = await this.userService.findByEmail(payload.email);
    if (!user) {
      throw new UnauthorizedException('invalid token');
    }
    return user;
  }

  private getRedisKey(email: string, purpose: 'signup' | 'reset' | 'update') {
    return `verification:${purpose}:${email}`;
  }

  async generateAndSendCode(
    email: string,
    purpose: 'signup' | 'reset' | 'update',
  ) {
    const cooldownKey = `cooldown:${purpose}:${email}`;
    const cooldownTtl = await this.redis.ttl(cooldownKey);
    if (cooldownTtl > 0) {
      throw new BadRequestException(`COOLDOWN:${cooldownTtl}`);
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const ttl = APP_CONSTANTS.VERIFICATION_CODE_TTL;
    const key = this.getRedisKey(email, purpose);

    await this.redis.set(key, code, 'EX', ttl);
    await this.redis.setex(cooldownKey, 60, '1');

    const subjectMap = {
      signup: 'FotoUai - Seu código de verificação',
      reset: 'FotoUai - Redefinição de senha',
      update: 'FotoUai - Atualização de dados',
    };

    const subject = subjectMap[purpose];
    const text = `Seu código de verificação é: ${code}. Válido por 10 minutos.`;

    const purposeText =
      purpose === 'signup'
        ? 'criar sua conta'
        : purpose === 'reset'
          ? 'redefinir sua senha'
          : 'atualizar seus dados';

    const purposeEmoji =
      purpose === 'signup' ? '🎉' : purpose === 'reset' ? '🔐' : '✏️';

    const codeDigits = code
      .split('')
      .map(
        (d) =>
          `<td style="width:44px;height:52px;background-color:#f0f4ff;border-radius:10px;text-align:center;vertical-align:middle;font-size:26px;font-weight:700;color:#3b82f6;font-family:'Segoe UI',Roboto,Arial,sans-serif;border:1px solid #dbe4ff;">${d}</td>`,
      )
      .join('<td style="width:8px;"></td>');

    const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FotoUai</h1>
        <p style="color: #dbeafe; margin: 8px 0 0; font-size: 14px;">${purposeEmoji} Código de Verificação</p>
      </div>
      <div style="padding: 32px 24px;">
        <p style="font-size: 16px; color: #1f2937; margin: 0 0 16px;">Olá!</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
          Você solicitou um código para <strong>${purposeText}</strong>. Use o código abaixo:
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
            <tr>${codeDigits}</tr>
          </table>
        </div>
        <div style="background: #fef3c7; border-radius: 8px; padding: 12px 16px; margin: 0 0 24px; border: 1px solid #fde68a; text-align: center;">
          <p style="font-size: 13px; color: #92400e; margin: 0; font-weight: 600;">
            ⏳ Este código expira em <strong>10 minutos</strong>
          </p>
        </div>
        <p style="font-size: 13px; color: #9ca3af; line-height: 1.5; margin: 0; text-align: center;">
          Se você não solicitou este código, ignore este e-mail com segurança.
        </p>
      </div>
      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">© ${new Date().getFullYear()} FotoUai — Suas memórias, compartilhadas com facilidade.</p>
      </div>
    </div>`;

    console.log(`[Auth] verification code generated for ${email} =>`, code);

    await this.dispatcherEmailService.sendEmail(email, subject, text, html);
    console.log(`[Auth] email sent successfully to ${email}`);

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

  async logout(token: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(token) as any;
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await this.redis.set(`blacklist:${token}`, '1', 'EX', ttl);
        }
      }
    } catch {}
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${token}`);
    return result !== null;
  }

  async socialLogin(supabaseToken: string): Promise<JwtResponse> {
    const {
      data: { user: supabaseUser },
      error,
    } = await supabase.auth.getUser(supabaseToken);

    if (error || !supabaseUser) {
      throw new UnauthorizedException('invalid supabase token');
    }

    const supabaseUid = supabaseUser.id;
    const email = supabaseUser.email;
    const name =
      supabaseUser.user_metadata?.full_name ||
      supabaseUser.user_metadata?.name ||
      email?.split('@')[0] ||
      'Usuário';
    const provider = supabaseUser.app_metadata?.provider || 'unknown';

    let user = await this.userService.findBySupabaseUid(supabaseUid);

    if (user) {
      return this.createJwtPayload(user);
    }

    if (email) {
      user = await this.userService.findByEmail(email);
      if (user) {
        await this.userService.linkSupabaseUid(user.id, supabaseUid, provider);
        return this.createJwtPayload(user);
      }
    }

    const randomPassword = `${randomBytes(8).toString('hex')}Aa@${randomBytes(4).toString('hex')}`;

    user = await this.userService.createUser({
      email: email || `${supabaseUid}@social.fotouai.com.br`,
      name,
      password: randomPassword,
      phone: '0000000000',
      dateOfBirth: '01/01/2000',
    });

    await this.userService.linkSupabaseUid(user.id, supabaseUid, provider);

    return this.createJwtPayload(user);
  }
}
