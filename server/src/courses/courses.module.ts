import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Course, Lesson, LessonProgress])],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
