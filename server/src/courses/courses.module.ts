import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Course, Lesson, Word, LessonProgress])],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
