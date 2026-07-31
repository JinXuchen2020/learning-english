import { Controller, Get, Patch, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Get()
  getOverview(@Request() req: any) {
    return this.progressService.getOverview(req.user.userId);
  }

  @Patch('lesson/:id')
  completeLesson(@Param('id') lessonId: string, @Request() req: any) {
    return this.progressService.completeLesson(req.user.userId, lessonId);
  }

  @Post('word')
  recordWord(
    @Body() body: { wordId: string; correct: boolean },
    @Request() req: any,
  ) {
    return this.progressService.recordWordAttempt(
      req.user.userId,
      body.wordId,
      body.correct,
    );
  }
}
