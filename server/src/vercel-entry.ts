import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { logger } from './common/logger/logger';
import { ensureSeed } from './seed/bootstrap-seed';

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

  // 自举种子：Vercel 等无构建期 seed 的环境，启动即确保 provider 配置与初始内容存在
  // （幂等、不 clear）。test 环境跳过，避免污染测试 DB / 拖慢测试。
  const shouldBootstrapSeed =
    process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;
  if (shouldBootstrapSeed) {
    try {
      const ds = app.get(DataSource);
      await ensureSeed(ds);
    } catch (err) {
      logger.error('[Bootstrap] ensureSeed 调用失败（不影响启动）:', err);
    }
  }

  return app.getHttpAdapter().getInstance();
}
