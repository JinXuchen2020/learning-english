import 'reflect-metadata';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('passes with valid data', async () => {
    const dto = Object.assign(new LoginDto(), { username: 'abc', password: 'abcd' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails when username shorter than 3', async () => {
    const dto = Object.assign(new LoginDto(), { username: 'ab', password: 'abcd' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('fails when password shorter than 4', async () => {
    const dto = Object.assign(new LoginDto(), { username: 'abc', password: 'abc' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('fails when username is not a string', async () => {
    const dto = Object.assign(new LoginDto(), { username: 123 as any, password: 'abcd' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
