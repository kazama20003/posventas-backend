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
  const corsOrigin = envs.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigin.length === 1 ? corsOrigin[0] : corsOrigin,
    credentials: true,
  });

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
