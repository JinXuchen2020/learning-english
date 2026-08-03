import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CoursesService } from './courses.service';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';

describe('CoursesService', () => {
  let service: CoursesService;
  let coursesRepo: any;
  let progressRepo: any;

  beforeEach(async () => {
    coursesRepo = { find: jest.fn(), findOne: jest.fn() };
    progressRepo = { find: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: getRepositoryToken(Course), useValue: coursesRepo },
        { provide: getRepositoryToken(Lesson), useValue: {} },
        { provide: getRepositoryToken(LessonProgress), useValue: progressRepo },
      ],
    }).compile();
    service = moduleRef.get(CoursesService);
  });

  it('findAll maps courses with totalLessons', async () => {
    coursesRepo.find.mockResolvedValue([
      { id: 'c1', title: 'T', description: 'd', icon: 'i', color: '#fff', lessons: [{ id: 'l1' }, { id: 'l2' }] },
    ]);
    const res = await service.findAll();
    expect(coursesRepo.find).toHaveBeenCalledWith({ order: { sortOrder: 'ASC' }, relations: ['lessons'] });
    expect(res[0]).toMatchObject({ id: 'c1', totalLessons: 2, wordCount: 0 });
  });

  it('findOne throws NotFound when missing', async () => {
    coursesRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne without userId: first lesson available, rest locked', async () => {
    coursesRepo.findOne.mockResolvedValue({
      id: 'c1', title: 'T', description: 'd', icon: 'i', color: '#fff',
      lessons: [
        { id: 'l1', title: 'L1', words: [{ id: 'w1' }], estimatedMinutes: 5 },
        { id: 'l2', title: 'L2', words: [], estimatedMinutes: 5 },
      ],
    });
    const res = await service.findOne('c1');
    expect(res.lessons[0].state).toBe('available');
    expect(res.lessons[1].state).toBe('locked');
    expect(res.completedLessons).toBe(0);
    expect(res.wordCount).toBe(1);
  });

  it('findOne with userId + progress: completed/available/locked states', async () => {
    coursesRepo.findOne.mockResolvedValue({
      id: 'c1', title: 'T', description: 'd', icon: 'i', color: '#fff',
      lessons: [
        { id: 'l1', title: 'L1', words: [], estimatedMinutes: 5 },
        { id: 'l2', title: 'L2', words: [], estimatedMinutes: 5 },
        { id: 'l3', title: 'L3', words: [], estimatedMinutes: 5 },
      ],
    });
    progressRepo.find.mockResolvedValue([{ lessonId: 'l1', completed: true }]);
    const res = await service.findOne('c1', 'u1');
    expect(res.lessons[0].state).toBe('completed');
    expect(res.lessons[1].state).toBe('available');
    expect(res.lessons[2].state).toBe('locked');
    expect(res.completedLessons).toBe(1);
  });
});
