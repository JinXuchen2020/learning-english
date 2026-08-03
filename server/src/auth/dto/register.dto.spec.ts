import 'reflect-metadata';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  const valid = { username: 'abc', password: 'abcd' };

  it('passes with valid data (no nickname)', async () => {
    const dto = Object.assign(new RegisterDto(), valid);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('passes with optional nickname', async () => {
    const dto = Object.assign(new RegisterDto(), { ...valid, nickname: 'Nick' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails when username too short', async () => {
    const dto = Object.assign(new RegisterDto(), { ...valid, username: 'ab' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('fails when username too long', async () => {
    const dto = Object.assign(new RegisterDto(), { ...valid, username: 'a'.repeat(21) });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('fails when password too short', async () => {
    const dto = Object.assign(new RegisterDto(), { ...valid, password: 'abc' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('fails when password too long', async () => {
    const dto = Object.assign(new RegisterDto(), { ...valid, password: 'a'.repeat(33) });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('fails when nickname too long', async () => {
    const dto = Object.assign(new RegisterDto(), { ...valid, nickname: 'a'.repeat(21) });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
