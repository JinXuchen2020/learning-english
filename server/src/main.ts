import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  // Allow the API to be called from the frontend dev/CI origins. We accept any
  // localhost/127.0.0.1 origin (any port) so the E2E suite works whether the
  // frontend is served on :3000 (CI) or another local port, and so a wrong
  // credential still reaches the 401 branch instead of being blocked by CORS.
  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (
        !requestOrigin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Fox English API running on http://localhost:${port}/api`);
}
bootstrap();
