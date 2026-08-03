import { Test } from '@nestjs/testing';
import { WordsController } from './words.controller';
import { WordsService } from './words.service';

describe('WordsController', () => {
  let controller: WordsController;
  let wordsService: any;

  beforeEach(async () => {
    wordsService = {
      findByLesson: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [WordsController],
      providers: [{ provide: WordsService, useValue: wordsService }],
    }).compile();
    controller = moduleRef.get(WordsController);
  });

  it('findAll with lessonId calls findByLesson', async () => {
    await controller.findAll('l1');
    expect(wordsService.findByLesson).toHaveBeenCalledWith('l1');
  });

  it('findAll without lessonId calls findAll', async () => {
    await controller.findAll();
    expect(wordsService.findAll).toHaveBeenCalled();
  });
});
