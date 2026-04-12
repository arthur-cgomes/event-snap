import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisProvider } from '../../common/config/redis.config';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.AUTH_SECRET;
        if (!secret) {
          throw new Error('AUTH_SECRET environment variable is required');
        }
        return {
          secret,
          signOptions: {
            expiresIn: Number(process.env.EXPIRE_IN) || 7200,
          },
        };
      },
    }),
    UserModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RedisProvider],
})
export class AuthModule {}
