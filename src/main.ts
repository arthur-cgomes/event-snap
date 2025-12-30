import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { version } from '../package.json';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
  });
  app.useGlobalPipes(new ValidationPipe());

  const options = new DocumentBuilder()
    .setTitle(`Projeto EventSnap - ${process.env.NODE_ENV}`)
    .setDescription('Back-end do Projeto EventSnap')
    .setVersion(version)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);
  const PORT = Number(process.env.PORT) || 3000;

  await app.listen(PORT, '0.0.0.0');
  console.log(
    `📸 project eventsnap is in ${process.env.NODE_ENV} mode and is listening on port:`,
    PORT,
  );
}
bootstrap();
