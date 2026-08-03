import { Test } from '@nestjs/testing';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

describe('CoursesController', () => {
  let controller: CoursesController;
  let coursesService: { findAll: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    coursesService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [{ provide: CoursesService, useValue: coursesService }],
    }).compile();
    controller = moduleRef.get(CoursesController);
  });

  it('findAll forwards to service', async () => {
    await controller.findAll();
    expect(coursesService.findAll).toHaveBeenCalled();
  });

  it('findOne forwards id + req.user.userId', async () => {
    await controller.findOne('c1', { user: { userId: 'u1' } } as any);
    expect(coursesService.findOne).toHaveBeenCalledWith('c1', 'u1');
  });

  it('findOne passes undefined userId when no user', async () => {
    await controller.findOne('c1', {} as any);
    expect(coursesService.findOne).toHaveBeenCalledWith('c1', undefined);
  });
});
