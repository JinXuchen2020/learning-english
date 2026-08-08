import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProgressService } from './progress.service';
import { RecordWordAttemptDto } from './dto/record-word-attempt.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Get()
  getOverview(@Request() req: any) {
    return this.progressService.getOverview(req.user.userId);
  }

  @Get('word-difficulty')
  getWordDifficulties(@Request() req: any) {
    return this.progressService
      .getWordDifficulties(req.user.userId)
      .then((items) => ({ items }));
  }

  @Patch('lesson/:id')
  completeLesson(@Param('id') lessonId: string, @Request() req: any) {
    return this.progressService.completeLesson(req.user.userId, lessonId);
  }

  @Post('word')
  recordWord(
    @Body() body: RecordWordAttemptDto,
    @Request() req: any,
  ) {
    return this.progressService.recordWordAttempt(
      req.user.userId,
      body.wordId,
      body.correct,
    );
  }
}
