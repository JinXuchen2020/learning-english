import { DataSource, DataSourceOptions } from 'typeorm';
import { appEntities } from './src/config/database.config';

/**
 * TypeORM CLI 配置（生成/运行 migration 用），不参与 Nest 构建（在 src 之外）。
 *
 * 用法：
 *   # 生成迁移（需先连到目标库：Postgres 设 DATABASE_URL，sqlite 设 SQLITE_PATH）
 *   npm run typeorm -- -d ormconfig.ts migration:generate -n AddXxx
 *   # 手动跑迁移
 *   npm run typeorm -- -d ormconfig.ts migration:run
 *
 * 注意：生产(Vercel/Postgres)的 DDL 应由「连到真实 Postgres」生成，
 * 不要对着 sqlite 生成再用于 Postgres（两者类型/约束翻译不同）。
 */
const isPostgres =
  (process.env.DB_TYPE || '').toLowerCase() === 'postgres' || !!process.env.DATABASE_URL;

const options: DataSourceOptions = isPostgres
  ? {
      type: 'postgres',
      url: process.env.DATABASE_URL || process.env.POSTGRES_URL,
      ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
      entities: appEntities,
      migrations: ['server/src/migrations/*.ts'],
    }
  : {
      type: 'better-sqlite3',
      database: process.env.SQLITE_PATH || 'dev.sqlite',
      entities: appEntities,
      migrations: ['server/src/migrations/*.ts'],
    };

export default new DataSource(options);
