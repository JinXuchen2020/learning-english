import {
  getDbType,
  buildDataSourceOptions,
  buildTypeOrmModuleOptions,
  appEntities,
} from './database.config';

describe('database.config', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('getDbType', () => {
    it('defaults to sqlite when DB_TYPE unset', () => {
      delete process.env.DB_TYPE;
      expect(getDbType()).toBe('sqlite');
    });
    it('returns postgres for "postgres"', () => {
      process.env.DB_TYPE = 'postgres';
      expect(getDbType()).toBe('postgres');
    });
    it('returns postgres for "postgresql"', () => {
      process.env.DB_TYPE = 'postgresql';
      expect(getDbType()).toBe('postgres');
    });
    it('is case-insensitive', () => {
      process.env.DB_TYPE = 'POSTGRES';
      expect(getDbType()).toBe('postgres');
    });
    it('falls back to sqlite for unknown values', () => {
      process.env.DB_TYPE = 'mysql';
      expect(getDbType()).toBe('sqlite');
    });
  });

  describe('buildDataSourceOptions', () => {
    it('builds sqlite (better-sqlite3) options by default', () => {
      delete process.env.DB_TYPE;
      const opt = buildDataSourceOptions() as any;
      expect(opt.type).toBe('better-sqlite3');
      expect(opt.entities).toBe(appEntities);
      expect(opt.synchronize).toBe(true);
    });
    it('builds postgres options honoring env overrides', () => {
      process.env.DB_TYPE = 'postgres';
      process.env.DB_HOST = 'db.example.com';
      process.env.DB_PORT = '6543';
      process.env.DB_USERNAME = 'u';
      process.env.DB_PASSWORD = 'p';
      process.env.DB_DATABASE = 'dbname';
      const opt = buildDataSourceOptions() as any;
      expect(opt.type).toBe('postgres');
      expect(opt.host).toBe('db.example.com');
      expect(opt.port).toBe(6543);
      expect(opt.username).toBe('u');
      expect(opt.password).toBe('p');
      expect(opt.database).toBe('dbname');
    });
    it('parses DB_PORT as int with default 5432', () => {
      process.env.DB_TYPE = 'postgres';
      delete process.env.DB_PORT;
      expect((buildDataSourceOptions() as any).port).toBe(5432);
    });
    it('respects DB_SYNCHRONIZE=false', () => {
      process.env.DB_SYNCHRONIZE = 'false';
      expect((buildDataSourceOptions() as any).synchronize).toBe(false);
    });
  });

  describe('buildTypeOrmModuleOptions', () => {
    it('returns the same shape as the DataSource options', () => {
      delete process.env.DB_TYPE;
      const opt = buildTypeOrmModuleOptions() as any;
      expect(opt.type).toBe('better-sqlite3');
      expect(opt.entities).toBe(appEntities);
    });
  });
});
