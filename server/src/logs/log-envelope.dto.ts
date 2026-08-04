import { IsString, IsIn, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Body accepted by `POST /api/log`. Validated by the global ValidationPipe
 * (whitelist + transform). `meta` is passed through verbatim and serialized by
 * the Logger, so it keeps an open `unknown` type.
 */
export class LogEnvelopeDto {
  @IsString()
  @IsIn(['error', 'warn', 'info', 'debug'])
  level!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  meta?: unknown;
}
