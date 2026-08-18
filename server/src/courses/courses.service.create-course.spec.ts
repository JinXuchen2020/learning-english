import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoursesService } from './courses.service';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { appEntities } from '../config/database.config';
import { CoursePlanSpec } from '../plan/courses-from-plan.schema';

/**
 * `CoursesService.createCourseFromPlan` 落库单测（AI-801）。
 * 用 in-memory better-sqlite3 + 真实 `Course/Lesson/Word` 实体验证
 * 事务内 Course→Lessons→Words 级联落库、计数正确、外键关联、simple-array 往返。
 */
describe('CoursesService.createCourseFromPlan (AI-801)', () => {
  let moduleRef: TestingModule;
  let service: CoursesService;
  let courseRepo: Repository<Course>;
  let lessonRepo: Repository<Lesson>;
  let wordRepo: Repository<Word>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: appEntities,
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Course, Lesson, Word, LessonProgress]),
      ],
      providers: [CoursesService],
    }).compile();

    service = moduleRef.get(CoursesService);
    courseRepo = moduleRef.get<Repository<Course>>(getRepositoryToken(Course));
    lessonRepo = moduleRef.get<Repository<Lesson>>(getRepositoryToken(Lesson));
    wordRepo = moduleRef.get<Repository<Word>>(getRepositoryToken(Word));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('事务内落库 Course+Lessons+Words 并返回正确计数与关联', async () => {
    const spec: CoursePlanSpec = {
      course: { title: 'Space English', description: 'A space-themed course', icon: 'book', color: '#123456' },
      lessons: [
        {
          title: 'L1',
          estimatedMinutes: 8,
          words: [
            { text: 'star', phonics: '/stɑːr/', meaning: '星星', options: ['star', 'sun', 'moon', 'sky'], correctIndex: 0 },
            { text: 'sun', phonics: '/sʌn/', meaning: '太阳', options: ['sun', 'star', 'moon', 'sky'], correctIndex: 0 },
          ],
        },
        {
          title: 'L2',
          words: [{ text: 'moon', phonics: '/muːn/', meaning: '月亮', options: ['moon', 'sky'], correctIndex: 0 }],
        },
      ],
    };

    const res = await service.createCourseFromPlan(spec);

    expect(res.lessonCount).toBe(2);
    expect(res.wordCount).toBe(3);

    const course = await courseRepo.findOne({ where: { id: res.courseId } });
    expect(course).not.toBeNull();
    expect(course!.title).toBe('Space English');

    const lessons = await lessonRepo.find({
      where: { courseId: res.courseId },
      order: { sortOrder: 'ASC' },
    });
    expect(lessons).toHaveLength(2);
    expect(lessons[0].title).toBe('L1');
    expect(lessons[0].estimatedMinutes).toBe(8);
    expect(lessons[1].title).toBe('L2');
    // estimatedMinutes 缺省值 5
    expect(lessons[1].estimatedMinutes).toBe(5);

    const words0 = await wordRepo.find({ where: { lessonId: lessons[0].id }, order: { sortOrder: 'ASC' } });
    expect(words0).toHaveLength(2);
    expect(words0[0].correctIndex).toBe(0);
    expect(Array.isArray(words0[0].options)).toBe(true); // simple-array 已解析回数组
    expect(words0[0].options).toEqual(['star', 'sun', 'moon', 'sky']);
    expect(words0[0].category).toBe('Space English');
    expect(words0[0].color).toBe('#123456');
    expect(words0[0].illustration).toBeNull();
  });

  it('空 lessons 仍落库空课程（边界，不应报错）', async () => {
    const spec: CoursePlanSpec = {
      course: { title: 'Empty', description: 'd', icon: 'book', color: '#000000' },
      lessons: [],
    };
    const res = await service.createCourseFromPlan(spec);
    expect(res.lessonCount).toBe(0);
    expect(res.wordCount).toBe(0);
    const course = await courseRepo.findOne({ where: { id: res.courseId } });
    expect(course).not.toBeNull();
  });
});
