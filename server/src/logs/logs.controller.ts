import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { logger, LogLevel } from '../common/logger/logger';
import { LogEnvelopeDto } from './log-envelope.dto';

/**
 * Receives log lines emitted by the frontend (browser cannot write files) and
 * appends them to the SAME server log file as the backend's own logs, so all
 * errors live in one searchable place. Validation is enforced by the global
 * ValidationPipe (forbidNonWhitelisted + transform) via `LogEnvelopeDto`.
 */
@Controller('log')
export class LogsController {
  @Post()
  @HttpCode(201)
  ingest(@Body() env: LogEnvelopeDto) {
    logger.write(env.level as LogLevel, env.message, env.meta);
    return { ok: true };
  }
}
