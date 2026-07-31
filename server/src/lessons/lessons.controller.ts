import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('lessons')
@UseGuards(JwtAuthGuard)
export class LessonsController {
  constructor(private lessonsService: LessonsService) {}

  @Get()
  findByCourse(@Query('courseId') courseId: string) {
    return this.lessonsService.findByCourse(courseId);
  }

  @Get(':id/words')
  getWords(@Param('id') id: string) {
    return this.lessonsService.getWords(id);
  }
}
