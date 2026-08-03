import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WordsService } from './words.service';
import { Word } from '../entities/word.entity';

describe('WordsService', () => {
  let service: WordsService;
  let wordsRepo: any;

  beforeEach(async () => {
    wordsRepo = { find: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WordsService,
        { provide: getRepositoryToken(Word), useValue: wordsRepo },
      ],
    }).compile();
    service = moduleRef.get(WordsService);
  });

  it('findByLesson queries by lessonId ordered', async () => {
    wordsRepo.find.mockResolvedValue([{ id: 'w1' }]);
    const res = await service.findByLesson('l1');
    expect(wordsRepo.find).toHaveBeenCalledWith({ where: { lessonId: 'l1' }, order: { sortOrder: 'ASC' } });
    expect(res).toEqual([{ id: 'w1' }]);
  });

  it('findAll returns ordered all', async () => {
    wordsRepo.find.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
    const res = await service.findAll();
    expect(wordsRepo.find).toHaveBeenCalledWith({ order: { sortOrder: 'ASC' } });
    expect(res).toHaveLength(2);
  });
});
