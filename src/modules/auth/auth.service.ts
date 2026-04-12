import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { User } from '../user/entity/user.entity';
import { UserService } from '../user/user.service';
import { AuthPayload } from './interfaces/auth.interface';
import { JwtPayload, JwtResponse } from './interfaces/jwt-payload.interface';
import { APP_CONSTANTS } from '../../common/constants';
import { getFirebaseAuth } from '../../common/config/firebase.config';

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
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="420" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:32px 40px;text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <div style="width:36px;height:36px;background-color:rgba(255,255,255,0.2);border-radius:8px;text-align:center;line-height:36px;font-size:18px;">📸</div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">FotoUai</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 20px;">
            <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1e293b;">${purposeEmoji} Olá!</p>
            <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6;">
              Você solicitou um código para <strong style="color:#1e293b;">${purposeText}</strong>. Use o código abaixo:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 28px;" align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>${codeDigits}</tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;" align="center">
            <div style="display:inline-block;background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 20px;">
              <span style="font-size:13px;color:#92400e;">⏳ Este código expira em <strong>10 minutos</strong></span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px;">
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;"/>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.5;">
              Se você não solicitou este código, ignore este e-mail com segurança.
            </p>
            <p style="margin:0;font-size:11px;color:#cbd5e1;">
              © ${new Date().getFullYear()} FotoUai — Capture cada momento.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    console.log(`[Auth] verification code generated for ${email} =>`, code);

    await this.emailService.sendBrevo(email, subject, text, html);
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

  async socialLogin(firebaseToken: string): Promise<JwtResponse> {
    try {
      const decodedToken = await getFirebaseAuth().verifyIdToken(firebaseToken);

      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email;
      const name = decodedToken.name || email?.split('@')[0] || 'Usuário';
      const provider = decodedToken.firebase?.sign_in_provider || 'unknown';

      let user = await this.userService.findByFirebaseUid(firebaseUid);

      if (user) {
        return this.createJwtPayload(user);
      }

      if (email) {
        user = await this.userService.findByEmail(email);
        if (user) {
          await this.userService.linkFirebaseUid(
            user.id,
            firebaseUid,
            provider,
          );
          return this.createJwtPayload(user);
        }
      }

      const randomPassword = `${randomBytes(8).toString('hex')}Aa@${randomBytes(4).toString('hex')}`;

      user = await this.userService.createUser({
        email: email || `${firebaseUid}@social.fotouai.com.br`,
        name,
        password: randomPassword,
        phone: '0000000000',
        dateOfBirth: '01/01/2000',
      });

      await this.userService.linkFirebaseUid(user.id, firebaseUid, provider);

      return this.createJwtPayload(user);
    } catch {
      throw new UnauthorizedException('invalid firebase token');
    }
  }
}
