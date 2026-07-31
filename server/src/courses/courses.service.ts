import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private coursesRepo: Repository<Course>,
    @InjectRepository(Lesson)
    private lessonsRepo: Repository<Lesson>,
    @InjectRepository(LessonProgress)
    private progressRepo: Repository<LessonProgress>,
  ) {}

  async findAll() {
    const courses = await this.coursesRepo.find({
      order: { sortOrder: 'ASC' },
      relations: ['lessons'],
    });

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      icon: course.icon,
      color: course.color,
      totalLessons: course.lessons.length,
      wordCount: 0, // computed from lessons
    }));
  }

  async findOne(id: string, userId?: string) {
    const course = await this.coursesRepo.findOne({
      where: { id },
      relations: ['lessons', 'lessons.words'],
      order: { lessons: { sortOrder: 'ASC' } },
    });

    if (!course) throw new NotFoundException('Course not found');

    let completedIds: Set<string> = new Set();
    if (userId) {
      const progress = await this.progressRepo.find({
        where: { userId, completed: true },
      });
      completedIds = new Set(progress.map((p) => p.lessonId));
    }

    const lessons = course.lessons.map((lesson, index) => {
      const isCompleted = completedIds.has(lesson.id);
      const prevCompleted = index === 0 || completedIds.has(course.lessons[index - 1]?.id);
      const state = isCompleted ? 'completed' : prevCompleted ? 'available' : 'locked';

      return {
        id: lesson.id,
        title: lesson.title,
        state,
        wordCount: lesson.words.length,
        estimatedMinutes: lesson.estimatedMinutes,
      };
    });

    const completedLessons = lessons.filter((l) => l.state === 'completed').length;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      icon: course.icon,
      color: course.color,
      totalLessons: lessons.length,
      completedLessons,
      wordCount: course.lessons.reduce((sum, l) => sum + l.words.length, 0),
      lessons,
    };
  }
}
