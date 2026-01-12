import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { config } from 'dotenv';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { HealthCheckModule } from './health-check/health-check.module';
import { QrcodeModule } from './qrcode/qrcode.module';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './user/user.module';
import { BannerModule } from './banner/banner.module';
import { CommonModule } from './common/common.module';
config();

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('TYPEORM_HOST'),
        port: configService.get('TYPEORM_PORT'),
        username: configService.get('TYPEORM_USERNAME'),
        password: configService.get('TYPEORM_PASSWORD'),
        database: configService.get('TYPEORM_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
        logging: configService.get('NODE_ENV') !== 'production',
        extra: {
          max: 20,
          min: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
        poolSize: 20,
      }),
    }),
    CommonModule,
    AuthModule,
    UserModule,
    HealthCheckModule,
    UploadModule,
    EmailModule,
    QrcodeModule,
    BannerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
