import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { ProgressService } from './progress.service';
import { RecordWordAttemptDto } from './dto/record-word-attempt.dto';
import { ScheduleReviewDto } from './dto/schedule-review.dto';
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

  // ===== AI-605 复习提醒 =====

  /** 到期/今日待复习单词列表。 */
  @Get('review/due')
  getDueReviews(@Request() req: any) {
    return this.progressService.getDueReviews(req.user.userId);
  }

  /** 当前复习节奏配置（间隔阶梯可经环境变量配置）。 */
  @Get('review/settings')
  getReviewSettings(@Request() req: any) {
    return this.progressService.getReviewSettings();
  }

  /** 手动调整某词下一次复习时间（家长/老师可用）。 */
  @Post('review/schedule')
  async scheduleReview(
    @Body() body: ScheduleReviewDto,
    @Request() req: any,
  ) {
    const updated = await this.progressService.scheduleReview(
      req.user.userId,
      body.wordId,
      new Date(body.dueDate),
    );
    if (!updated) {
      throw new NotFoundException('该单词尚未练习，无法调整复习计划');
    }
    return {
      wordId: updated.wordId,
      dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
      intervalDays: updated.intervalDays,
      easeFactor: updated.easeFactor,
      reviewCount: updated.reviewCount,
    };
  }
}
