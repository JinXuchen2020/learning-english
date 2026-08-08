import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { LessonsModule } from './lessons/lessons.module';
import { WordsModule } from './words/words.module';
import { SentencesModule } from './sentences/sentences.module';
import { TasksModule } from './tasks/tasks.module';
import { ProgressModule } from './progress/progress.module';
import { buildTypeOrmModuleOptions } from './config/database.config';
import { HealthModule } from './health/health.module';
import { LogsModule } from './logs/logs.module';
import { AiModule } from './ai/ai.module';
import { PlanModule } from './plan/plan.module';
import { ChatModule } from './chat/chat.module';
import { WordCardModule } from './word-card/word-card.module';
import { ScanModule } from './scan/scan.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildTypeOrmModuleOptions()),
    HealthModule,
    LogsModule,
    AiModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    LessonsModule,
    WordsModule,
    SentencesModule,
    TasksModule,
    ProgressModule,
    PlanModule,
    ChatModule,
    WordCardModule,
    ScanModule,
  ],
})
export class AppModule {}
