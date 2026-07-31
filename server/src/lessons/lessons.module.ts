import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lesson, Word])],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
