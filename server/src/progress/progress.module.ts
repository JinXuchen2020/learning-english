import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressService } from './progress.service';
import { ProgressController } from './progress.controller';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LessonProgress, WordProgress, User])],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
