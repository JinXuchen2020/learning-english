import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PlanService } from './plan.service';
import { StudyPlan } from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';
import { TasksService } from '../tasks/tasks.service';
import { CoursesService } from '../courses/courses.service';
import { AI_PROVIDER_TOKEN, ChatResult } from '../ai/ai-provider.interface';

/**
 * `PlanService.generateCoursesForPlan` 单测（AI-801）。
 * 用桩 AiProvider / CoursesService / 仓储验证：计划不存在→404、AI 正常产出→degraded:false、
 * 校验失败重试（附 retryNote）、AI 不可达/连续失败→降级模板课程 degraded:true。
 */
describe('PlanService.generateCoursesForPlan (AI-801)', () => {
  let service: PlanService;
  let ai: { chat: jest.Mock };
  let coursesService: { createCourseFromPlan: jest.Mock; findOne: jest.Mock };
  let planRepo: { findOne: jest.Mock };

  const planWithDays = (days: Partial<StudyPlanDay>[]) => ({
    id: 'p1',
    days: days.map((d, i) => ({ dayIndex: i, title: `Theme · 第 ${i + 1} 天`, content: '[]', ...d })),
  });

  beforeEach(async () => {
    ai = { chat: jest.fn() };
    coursesService = { createCourseFromPlan: jest.fn(), findOne: jest.fn() };
    planRepo = { findOne: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        PlanService,
        { provide: AI_PROVIDER_TOKEN, useValue: ai },
        { provide: CoursesService, useValue: coursesService },
        { provide: TasksService, useValue: { replacePlanTasks: jest.fn() } },
        { provide: getRepositoryToken(StudyPlan), useValue: planRepo },
        { provide: getRepositoryToken(StudyPlanDay), useValue: {} },
      ],
    }).compile();
    service = mod.get(PlanService);
  });

  it('计划不存在 → 404 且不调用 AI', async () => {
    planRepo.findOne.mockResolvedValue(null);
    await expect(service.generateCoursesForPlan('p1', 5)).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('AI 正常产出 → degraded:false，落库 AI 规格', async () => {
    planRepo.findOne.mockResolvedValue(planWithDays([{}, {}]));
    const aiCourse = {
      course: { title: 'AI Course', description: 'd', icon: 'book', color: '#abcdef' },
      lessons: [{ title: 'L', words: [{ text: 'a', phonics: '/a/', meaning: '甲', options: ['a', 'b'], correctIndex: 0 }] }],
    };
    ai.chat.mockResolvedValue({ text: JSON.stringify(aiCourse), model: 'agnes' } as ChatResult);
    coursesService.createCourseFromPlan.mockResolvedValue({ courseId: 'c2', lessonCount: 1, wordCount: 1 });

    const res = await service.generateCoursesForPlan('p1');
    expect(res.degraded).toBe(false);
    expect(res.model).toBe('agnes');
    expect(ai.chat).toHaveBeenCalledTimes(1);
    expect(coursesService.createCourseFromPlan).toHaveBeenCalledTimes(1);
    expect(coursesService.createCourseFromPlan.mock.calls[0][0].course.title).toBe('AI Course');
  });

  it('校验失败重试：第 1 次 lessons 空 → 第 2 次合法，附 retryNote', async () => {
    planRepo.findOne.mockResolvedValue(planWithDays([{}]));
    const bad = { course: { title: 'X', description: 'd', icon: 'book', color: '#fff' }, lessons: [] };
    const good = {
      course: { title: 'X', description: 'd', icon: 'book', color: '#fff' },
      lessons: [{ title: 'L', words: [{ text: 'a', phonics: '/a/', meaning: '甲', options: ['a', 'b'], correctIndex: 0 }] }],
    };
    ai.chat
      .mockResolvedValueOnce({ text: JSON.stringify(bad), model: 'm' } as ChatResult)
      .mockResolvedValueOnce({ text: JSON.stringify(good), model: 'm' } as ChatResult);
    coursesService.createCourseFromPlan.mockResolvedValue({ courseId: 'c3', lessonCount: 1, wordCount: 1 });

    const res = await service.generateCoursesForPlan('p1');
    expect(res.degraded).toBe(false);
    expect(ai.chat).toHaveBeenCalledTimes(2);
    const secondUserMsg = (ai.chat.mock.calls[1][0] as { role: string; content: string }[])[1].content;
    expect(secondUserMsg).toContain('retryNote');
  });

  it('AI 连续失败（不可达）→ 降级模板课程 degraded:true，仍落库', async () => {
    planRepo.findOne.mockResolvedValue(planWithDays([{}, {}]));
    ai.chat.mockRejectedValue(new Error('network down'));
    coursesService.createCourseFromPlan.mockResolvedValue({ courseId: 'c1', lessonCount: 2, wordCount: 10 });

    const res = await service.generateCoursesForPlan('p1', 5);
    expect(res.degraded).toBe(true);
    expect(res.model).toBe('template');
    expect(ai.chat).toHaveBeenCalledTimes(3);
    expect(coursesService.createCourseFromPlan).toHaveBeenCalledTimes(1);
    const spec = coursesService.createCourseFromPlan.mock.calls[0][0];
    expect(spec.lessons).toHaveLength(2); // 模板按天数生成 2 节
  });

  it('幂等：计划已有配套课程（refs 指向存在且标题匹配派生主题）→ 直接返回不调 AI', async () => {
    planRepo.findOne.mockResolvedValue(planWithDays([
      { lessonRefsJson: JSON.stringify([{ skillType: 'vocab', courseId: 'c9', lessonId: 'l1', title: 'T' }]) },
      { lessonRefsJson: JSON.stringify([{ skillType: 'vocab', courseId: 'c9', lessonId: 'l2', title: 'T' }]) },
    ]));
    // deriveCourseSpec(['Theme', 'Theme']).title === 'Theme · English'
    coursesService.findOne.mockResolvedValue({ id: 'c9', title: 'Theme · English', totalLessons: 2, wordCount: 10 });

    const res = await service.generateCoursesForPlan('p1');
    expect(res).toEqual({
      courseId: 'c9',
      title: 'Theme · English',
      lessonCount: 2,
      wordCount: 10,
      degraded: false,
      model: 'idempotent',
    });
    expect(ai.chat).not.toHaveBeenCalled();
    expect(coursesService.createCourseFromPlan).not.toHaveBeenCalled();
  });

  it('幂等不误判：refs 指向标题不同的种子课程 → 仍正常生成新课程', async () => {
    planRepo.findOne.mockResolvedValue(planWithDays([
      { lessonRefsJson: JSON.stringify([{ skillType: 'vocab', courseId: 'seed1', lessonId: 'sl1', title: 'S' }]) },
    ]));
    coursesService.findOne.mockResolvedValue({ id: 'seed1', title: 'Animal Friends', totalLessons: 5, wordCount: 25 });
    const aiCourse = {
      course: { title: 'New Course', description: 'd', icon: 'book', color: '#abcdef' },
      lessons: [{ title: 'L', words: [{ text: 'a', phonics: '/a/', meaning: 'm', options: ['a', 'b'], correctIndex: 0 }] }],
    };
    ai.chat.mockResolvedValue({ text: JSON.stringify(aiCourse), model: 'agnes' } as ChatResult);
    coursesService.createCourseFromPlan.mockResolvedValue({ courseId: 'c-new', lessonCount: 1, wordCount: 1 });

    const res = await service.generateCoursesForPlan('p1');
    expect(res.degraded).toBe(false);
    expect(res.model).toBe('agnes');
    expect(ai.chat).toHaveBeenCalledTimes(1);
    expect(coursesService.createCourseFromPlan).toHaveBeenCalledTimes(1);
  });

  it('幂等失效回退：引用课程已被删除 → 正常走 AI 重新生成', async () => {
    planRepo.findOne.mockResolvedValue(planWithDays([
      { lessonRefsJson: JSON.stringify([{ skillType: 'vocab', courseId: 'gone', lessonId: 'l1', title: 'T' }]) },
    ]));
    coursesService.findOne.mockRejectedValue(new Error('Course not found'));
    const aiCourse = {
      course: { title: 'Regenerated', description: 'd', icon: 'book', color: '#abcdef' },
      lessons: [{ title: 'L', words: [{ text: 'a', phonics: '/a/', meaning: 'm', options: ['a', 'b'], correctIndex: 0 }] }],
    };
    ai.chat.mockResolvedValue({ text: JSON.stringify(aiCourse), model: 'agnes' } as ChatResult);
    coursesService.createCourseFromPlan.mockResolvedValue({ courseId: 'c-regen', lessonCount: 1, wordCount: 1 });

    const res = await service.generateCoursesForPlan('p1');
    expect(res.degraded).toBe(false);
    expect(res.courseId).toBe('c-regen');
    expect(ai.chat).toHaveBeenCalledTimes(1);
  });
});
