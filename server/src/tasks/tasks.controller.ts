import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get('daily')
  getDailyTasks(@Request() req: any) {
    return this.tasksService.getDailyTasks(req.user.userId);
  }

  @Patch(':id/complete')
  completeTask(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.completeTask(req.user.userId, id);
  }
}
