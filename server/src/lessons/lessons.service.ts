import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';

@Injectable()
export class LessonsService {
  constructor(
    @InjectRepository(Lesson)
    private lessonsRepo: Repository<Lesson>,
    @InjectRepository(Word)
    private wordsRepo: Repository<Word>,
  ) {}

  async findByCourse(courseId: string) {
    return this.lessonsRepo.find({
      where: { courseId },
      order: { sortOrder: 'ASC' },
      relations: ['words'],
    });
  }

  async getWords(lessonId: string) {
    const lesson = await this.lessonsRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');

    return this.wordsRepo.find({
      where: { lessonId },
      order: { sortOrder: 'ASC' },
    });
  }
}
