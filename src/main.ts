import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigType } from '@nestjs/config';
import appConfig from './config/app.config';

async function bootstrap() {
  const start = Date.now();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = new Logger('Bootstrap');

  const envs = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(envs.port);

  const startupTime = Date.now() - start;
  const baseUrl = `http://localhost:${envs.port}`;

  logger.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 APPLICATION READY IN ${startupTime}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 Environment : ${envs.nodeEnv}
📡 API         : ${baseUrl}/api
📚 Swagger     : ${
    envs.enableSwagger && envs.nodeEnv !== 'production'
      ? baseUrl + '/docs'
      : 'DISABLED'
  }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

bootstrap();
