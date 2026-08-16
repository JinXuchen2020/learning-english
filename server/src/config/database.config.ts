import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { User } from '../entities/user.entity';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';
import { DailyTask } from '../entities/daily-task.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { AiUsage } from '../ai/ai-usage.entity';
import { AiCallLog } from '../ai/ai-call-log.entity';
import { AiSpeechAttempt } from '../ai/ai-speech-attempt.entity';
import { AiReport } from '../ai/ai-report.entity';
import { AiParentEmailLog } from '../ai/ai-parent-email-log.entity';
import { Sentence } from '../entities/sentence.entity';
import { StudyPlan } from '../plan/study-plan.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';
import { AiChatSession } from '../chat/ai-chat-session.entity';
import { AiChatMessage } from '../chat/ai-chat-message.entity';
import { AiWordCard } from '../word-card/ai-word-card.entity';
import { MascotStory } from '../ai/mascot-story.entity';
import { PictureBook } from '../ai/picture-book.entity';
import { ProviderConfig } from '../ai/provider-config/provider-config.entity';
import { ScannedWord } from '../entities/scanned-word.entity';
import { UserPoints } from '../rewards/user-points.entity';
import { Reward } from '../rewards/reward.entity';
import { RewardRedemption } from '../rewards/reward-redemption.entity';
import { InitSchema20260816200000 } from '../migrations/InitSchema';

/**
 * All entities registered in one place so both the NestJS module and the
 * standalone seed DataSource stay in sync.
 */
export const appEntities = [
  User,
  Course,
  Lesson,
  Word,
  DailyTask,
  LessonProgress,
  WordProgress,
  TaskCompletion,
  AiUsage,
  AiCallLog,
  AiSpeechAttempt,
  AiReport,
  AiParentEmailLog,
  Sentence,
  StudyPlan,
  StudyPlanDay,
  AiChatSession,
  AiChatMessage,
  AiWordCard,
  MascotStory,
  PictureBook,
  ProviderConfig,
  ScannedWord,
  UserPoints,
  Reward,
  RewardRedemption,
];

export type DbType = 'sqlite' | 'postgres';

/**
 * Strips Postgres SSL-related query parameters from a connection URL.
 * pg>=8 warns about / can mis-parse `sslmode` in the URL when an explicit
 * `ssl` option is also provided. Neon also appends `channel_binding`, which
 * pg does not understand. We remove both and enforce SSL via the `ssl`
 * TypeORM option instead.
 */
export function cleanPostgresUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('channel_binding');
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Reads DB_TYPE from the environment. Defaults to sqlite so the dev
 * experience is zero-config (no database server required). Set
 * DB_TYPE=postgres to switch seamlessly to PostgreSQL.
 */
export function getDbType(): DbType {
  const raw = (process.env.DB_TYPE || 'sqlite').toLowerCase();
  return raw === 'postgres' || raw === 'postgresql' ? 'postgres' : 'sqlite';
}

/**
 * Builds TypeORM DataSource options for the active database driver.
 * The same entity definitions work for both drivers: uuid primary keys
 * are stored as varchar in sqlite and native uuid in postgres, and the
 * `simple-array` column type is portable across both.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const type = getDbType();
  const isProd = type === 'postgres';

  // 生产(Postgres/Vercel)默认关闭 synchronize，改用 migration（启动期自动 run）；
  // 显式 DB_SYNCHRONIZE=true 可临时回退到 synchronize（仅应急，不推荐长期使用）。
  // dev(sqlite)保留 synchronize 方便本地零配置开发，不跑 migration。
  const synchronize = isProd
    ? process.env.DB_SYNCHRONIZE === 'true'
    : process.env.DB_SYNCHRONIZE !== 'false';
  const migrationsRun = isProd ? process.env.DB_SYNCHRONIZE !== 'true' : false;
  const migrations = [InitSchema20260816200000];

  if (isProd) {
    // Neon / Vercel / Supabase hand out a single connection string; prefer it.
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    // Managed Postgres always forces TLS — honor it (set DB_SSL=false to opt out,
    // e.g. for a local Postgres without SSL).
    const ssl = process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false };

    if (url) {
      return {
        type: 'postgres',
        url: cleanPostgresUrl(url),
        ssl,
        entities: appEntities,
        migrations,
        synchronize,
        migrationsRun,
      };
    }

    // Fallback: individual PG* / POSTGRES_* / DB_* vars (e.g. local Postgres).
    return {
      type: 'postgres',
      host:
        process.env.DB_HOST || process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
      username:
        process.env.DB_USERNAME || process.env.PGUSER || process.env.POSTGRES_USER || 'postgres',
      password:
        process.env.DB_PASSWORD ||
        process.env.PGPASSWORD ||
        process.env.POSTGRES_PASSWORD ||
        'postgres',
      database:
        process.env.DB_DATABASE ||
        process.env.PGDATABASE ||
        process.env.POSTGRES_DATABASE ||
        'kids_english',
      ssl,
      entities: appEntities,
      migrations,
      synchronize,
      migrationsRun,
    };
  }

  return {
    type: 'better-sqlite3',
    database: process.env.SQLITE_PATH || 'dev.sqlite',
    entities: appEntities,
    migrations,
    synchronize,
    migrationsRun,
  };
}

/**
 * NestJS-flavored options (identical shape for forRoot).
 */
export function buildTypeOrmModuleOptions(): TypeOrmModuleOptions {
  return buildDataSourceOptions() as TypeOrmModuleOptions;
}
