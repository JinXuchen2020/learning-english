import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Word } from '../entities/word.entity';

@Injectable()
export class WordsService {
  constructor(
    @InjectRepository(Word)
    private wordsRepo: Repository<Word>,
  ) {}

  async findByLesson(lessonId: string) {
    return this.wordsRepo.find({
      where: { lessonId },
      order: { sortOrder: 'ASC' },
    });
  }

  async findAll() {
    return this.wordsRepo.find({ order: { sortOrder: 'ASC' } });
  }
}
