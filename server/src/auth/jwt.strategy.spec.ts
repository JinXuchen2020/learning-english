import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy();

  it('validate maps payload to {userId, username}', async () => {
    const out = await strategy.validate({ sub: 'u1', username: 'foo' });
    expect(out).toEqual({ userId: 'u1', username: 'foo' });
  });

  it('validate returns the same ids from payload', async () => {
    const out = await strategy.validate({ sub: 'abc', username: 'kid' });
    expect(out.userId).toBe('abc');
    expect(out.username).toBe('kid');
  });
});
