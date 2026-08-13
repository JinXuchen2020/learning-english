import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { logger } from './common/logger/logger';

/**
 * Creates and initializes the Nest application and returns the underlying
 * Express instance (without calling `listen`). Shared by the local/dev server
 * (`main.ts`) and the Vercel serverless handler (`api/index.ts`).
 *
 * CORS allows localhost (dev/CI) plus any origins listed in FRONTEND_ORIGIN
 * (comma-separated), so the Vercel-hosted frontend can call this API.
 */
export async function createNestServer() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');

  const allowed = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
        return callback(null, true);
      }
      if (allowed.includes(requestOrigin)) return callback(null, true);
      return callback(null, false);
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  await app.init();
  return app.getHttpAdapter().getInstance();
}
