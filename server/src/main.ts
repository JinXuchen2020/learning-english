import 'dotenv/config';
import { createNestServer } from './vercel-entry';
import { logger } from './common/logger/logger';

async function bootstrap() {
  const server = await createNestServer();
  const port = process.env.PORT || 4000;
  server.listen(port);
  logger.info(`Fox English API running on http://localhost:${port}/api`);
}

bootstrap();
