import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { WordsService } from './words.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('words')
@UseGuards(JwtAuthGuard)
export class WordsController {
  constructor(private wordsService: WordsService) {}

  @Get()
  findAll(@Query('lessonId') lessonId?: string) {
    if (lessonId) {
      return this.wordsService.findByLesson(lessonId);
    }
    return this.wordsService.findAll();
  }
}
