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
];

export type DbType = 'sqlite' | 'postgres';

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

  if (type === 'postgres') {
    return {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'kids_english',
      entities: appEntities,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false', // dev only — use migrations in production
    };
  }

  return {
    type: 'better-sqlite3',
    database: process.env.SQLITE_PATH || 'dev.sqlite',
    entities: appEntities,
    synchronize: process.env.DB_SYNCHRONIZE !== 'false', // dev only — use migrations in production
  };
}

/**
 * NestJS-flavored options (identical shape for forRoot).
 */
export function buildTypeOrmModuleOptions(): TypeOrmModuleOptions {
  return buildDataSourceOptions() as TypeOrmModuleOptions;
}
