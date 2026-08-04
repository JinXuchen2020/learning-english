import { validate } from 'class-validator';
import { LogsController } from './logs.controller';
import { LogEnvelopeDto } from './log-envelope.dto';
import { logger } from '../common/logger/logger';

describe('LogsController', () => {
  it('writes a valid envelope via the logger and returns ok', () => {
    const spy = jest.spyOn(logger, 'write').mockImplementation(() => {});
    const ctrl = new LogsController();
    const res = ctrl.ingest({
      level: 'error',
      message: 'boom',
      meta: { a: 1 },
    } as LogEnvelopeDto);
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('error', 'boom', { a: 1 });
    spy.mockRestore();
  });

  it('writes an envelope without meta (undefined meta passes through)', () => {
    const spy = jest.spyOn(logger, 'write').mockImplementation(() => {});
    const ctrl = new LogsController();
    ctrl.ingest({ level: 'info', message: 'hi' } as LogEnvelopeDto);
    expect(spy).toHaveBeenCalledWith('info', 'hi', undefined);
    spy.mockRestore();
  });

  it('rejects an invalid level via class-validator', async () => {
    const dto = new LogEnvelopeDto();
    (dto as unknown as { level: string }).level = 'fatal';
    (dto as unknown as { message: string }).message = 'x';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-string message via class-validator', async () => {
    const dto = new LogEnvelopeDto();
    (dto as unknown as { level: string }).level = 'info';
    (dto as unknown as { message: number }).message = 123;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
