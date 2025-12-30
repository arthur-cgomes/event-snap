import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from 'dotenv';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { HealthCheckModule } from './health-check/health-check.module';
import { QrcodeModule } from './qrcode/qrcode.module';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './user/user.module';
import { BannerModule } from './banner/banner.module';
config();

@Module({
  imports: [
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
      }),
    }),
    AuthModule,
    UserModule,
    HealthCheckModule,
    UploadModule,
    EmailModule,
    QrcodeModule,
    BannerModule,
  ],
})
export class AppModule {}
