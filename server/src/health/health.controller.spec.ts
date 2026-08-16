import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('get returns ok status with an ISO timestamp', () => {
    const c = new HealthController();
    const res = c.get();
    expect(res.status).toBe('ok');
    expect(typeof res.timestamp).toBe('string');
    expect(() => new Date(res.timestamp).toISOString()).not.toThrow();
  });
});
