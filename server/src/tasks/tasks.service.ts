import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyTask } from '../entities/daily-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(DailyTask)
    private tasksRepo: Repository<DailyTask>,
    @InjectRepository(TaskCompletion)
    private completionsRepo: Repository<TaskCompletion>,
  ) {}

  async getDailyTasks(userId: string) {
    const tasks = await this.tasksRepo.find({ order: { sortOrder: 'ASC' } });
    const today = new Date().toISOString().split('T')[0];

    const completions = await this.completionsRepo.find({
      where: { userId, date: today },
    });
    const completedIds = new Set(completions.map((c) => c.taskId));

    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      icon: task.icon,
      completed: completedIds.has(task.id),
    }));
  }

  async completeTask(userId: string, taskId: string) {
    const today = new Date().toISOString().split('T')[0];

    const existing = await this.completionsRepo.findOne({
      where: { userId, taskId, date: today },
    });
    if (existing) {
      return { success: true, alreadyCompleted: true };
    }

    await this.completionsRepo.save(
      this.completionsRepo.create({ userId, taskId, date: today }),
    );
    return { success: true, alreadyCompleted: false };
  }
}
