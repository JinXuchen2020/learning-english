import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessonsService } from './lessons.service';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';

describe('LessonsService', () => {
  let service: LessonsService;
  let lessonsRepo: any;
  let wordsRepo: any;

  beforeEach(async () => {
    lessonsRepo = { find: jest.fn(), findOne: jest.fn() };
    wordsRepo = { find: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: getRepositoryToken(Lesson), useValue: lessonsRepo },
        { provide: getRepositoryToken(Word), useValue: wordsRepo },
      ],
    }).compile();
    service = moduleRef.get(LessonsService);
  });

  it('findByCourse queries by courseId ordered with relations', async () => {
    lessonsRepo.find.mockResolvedValue([{ id: 'l1' }]);
    const res = await service.findByCourse('c1');
    expect(lessonsRepo.find).toHaveBeenCalledWith({
      where: { courseId: 'c1' },
      order: { sortOrder: 'ASC' },
      relations: ['words'],
    });
    expect(res).toEqual([{ id: 'l1' }]);
  });

  it('getWords throws NotFound when lesson missing', async () => {
    lessonsRepo.findOne.mockResolvedValue(null);
    await expect(service.getWords('l1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getWords returns words ordered', async () => {
    lessonsRepo.findOne.mockResolvedValue({ id: 'l1' });
    wordsRepo.find.mockResolvedValue([{ id: 'w1' }]);
    const res = await service.getWords('l1');
    expect(wordsRepo.find).toHaveBeenCalledWith({ where: { lessonId: 'l1' }, order: { sortOrder: 'ASC' } });
    expect(res).toEqual([{ id: 'w1' }]);
  });
});
