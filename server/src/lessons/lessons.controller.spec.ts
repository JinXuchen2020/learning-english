import { Test } from '@nestjs/testing';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

describe('LessonsController', () => {
  let controller: LessonsController;
  let lessonsService: { findByCourse: jest.Mock; getWords: jest.Mock };

  beforeEach(async () => {
    lessonsService = {
      findByCourse: jest.fn().mockResolvedValue([]),
      getWords: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [LessonsController],
      providers: [{ provide: LessonsService, useValue: lessonsService }],
    }).compile();
    controller = moduleRef.get(LessonsController);
  });

  it('findByCourse forwards courseId', async () => {
    await controller.findByCourse('c1');
    expect(lessonsService.findByCourse).toHaveBeenCalledWith('c1');
  });

  it('getWords forwards lesson id', async () => {
    await controller.getWords('l1');
    expect(lessonsService.getWords).toHaveBeenCalledWith('l1');
  });
});
