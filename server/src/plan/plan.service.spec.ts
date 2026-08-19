import { Test, TestingModule } from '@nestjs/testing';
import { AI_PROVIDER_TOKEN, AiProvider, ChatResult } from '../ai/ai-provider.interface';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlanService, extractJson } from './plan.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { StudyPlan } from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';
import { TasksService } from '../tasks/tasks.service';
import { CoursesService } from '../courses/courses.service';
import { PlanCatalog } from './plan.types';
import { PLAN_SYSTEM_PROMPT } from './plan-agent.prompt';

/**
 * PlanService 单测（AI-202 编排 + AI-203 提示词 + AI-204 Schema 校验/重试/模板降级
 * + AI-206 save/apply 持久化与应用 + AI-803 目录注入/Plan A 拆课/写回）：
 * 覆盖有逻辑分支——合法 JSON 首轮通过、Markdown 围栏、坏 JSON/坏 Schema 自动重试 ≤3
 * 次后降级模板、provider 异常传播、重试带 retryNote、发出的 system/user 消息形态、
 * 以及 AI-206 的 savePlan（落库草稿/非法 plan 拒绝）与 applyPlan（404/重复确认/重应用）；
 * AI-803 额外覆盖：目录注入后 user 消息含 curriculumCatalog、buildStudyPlan 持久化
 * lessonRefsJson、applyPlan Plan A 每节独立任务 + 真实存在性校验（有效写深链/无效降级）、
 * 以及 generateCoursesForPlan 把生成课程 id 写回计划 lessons 引用。
 * 直接用 mock provider + mock repo + mock TasksService/CoursesService 注入，避免依赖真实 LLM / DB。
 */

const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

const validPlanJson = JSON.stringify({
  weeks: [{ week: 1, days: [{ day: 1, skillType: 'vocab', title: '颜色王国', lessons: [{ type: 'main', title: '颜色' }] }] }],
});

const validDto: GeneratePlanDto = {
  childId: UUID,
  ageRange: '6-8',
  level: 'a1',
  dailyMinutes: 20,
  interests: ['动物'],
  weeks: 2,
};

/** AI-803 默认目录：空（保持旧测试「无目录」分支语义，curriculumCatalog 应为 undefined）。 */
const emptyCatalog: PlanCatalog = { courses: [], lessons: [] };

/** AI-803 非空目录：含 1 门课程 + 2 课时，供目录注入测试。 */
const sampleCatalog: PlanCatalog = {
  courses: [{ courseId: 'course-1', title: '动物王国' }],
  lessons: [
    { lessonId: 'lesson-1', title: '颜色', courseId: 'course-1', skillType: 'vocab', level: 'a1', estimatedMinutes: 5 },
    { lessonId: 'lesson-2', title: '动物', courseId: 'course-1', skillType: 'vocab', level: 'a1', estimatedMinutes: 5 },
  ],
};

/** AI-803 生成课程写回测试用的「已生成课程」结构（findOne 返回）。 */
const generatedCourse = {
  id: 'gen-course-1',
  lessons: [{ id: 'gen-lesson-0' }, { id: 'gen-lesson-1' }],
};

function makeProvider(text: string | Error, model = 'mock-model'): AiProvider {
  const chat = jest.fn(async (): Promise<ChatResult> => {
    if (text instanceof Error) throw text;
    return { text, model };
  });
  return { name: 'mock', chat } as unknown as AiProvider;
}

interface Mocks {
  planRepo: any;
  dayRepo: any;
  tasksService: any;
  coursesService: any;
}

/** 默认 CoursesService mock：空目录（保旧分支语义）+ lessonExists/courseExists 返回真 + 写回用 findOne/createCourseFromPlan。 */
function defaultCoursesService(): any {
  return {
    getCatalog: jest.fn(async () => emptyCatalog),
    lessonExists: jest.fn(async (id: string) => !!id),
    courseExists: jest.fn(async (id: string) => !!id),
    findOne: jest.fn(async (id: string) => ({ id, lessons: generatedCourse.lessons })),
    createCourseFromPlan: jest.fn(async () => ({ courseId: 'gen-course-1', lessonCount: 2, wordCount: 10 })),
  };
}

async function setup(provider: AiProvider, mocks?: Partial<Mocks>): Promise<PlanService> {
  const planRepo = mocks?.planRepo ?? {
    save: jest.fn(async (e: any) => ({ ...e, id: e.id ?? 'plan-1', status: e.status ?? 'draft' })),
    findOne: jest.fn(),
  };
  const dayRepo = mocks?.dayRepo ?? { save: jest.fn(async (e: any) => e) };
  const tasksService = mocks?.tasksService ?? { replacePlanTasks: jest.fn(async () => {}) };
  const coursesService = mocks?.coursesService ?? defaultCoursesService();

  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      PlanService,
      { provide: AI_PROVIDER_TOKEN, useValue: provider },
      { provide: getRepositoryToken(StudyPlan), useValue: planRepo },
      { provide: getRepositoryToken(StudyPlanDay), useValue: dayRepo },
      { provide: TasksService, useValue: tasksService },
      { provide: CoursesService, useValue: coursesService },
    ],
  }).compile();
  return mod.get(PlanService);
}

describe('PlanService (AI-204)', () => {
  it('provider 返回合法 JSON → degraded:false 且 plan 透传（仅调用 1 次）', async () => {
    const provider = makeProvider(validPlanJson);
    const service = await setup(provider);
    const res = await service.generatePlan(validDto);

    expect(res.degraded).toBe(false);
    expect(res.model).toBe('mock-model');
    expect(res.plan.weeks).toHaveLength(1);
    expect(res.plan.weeks![0].days![0].title).toBe('颜色王国');
    expect((provider.chat as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('provider 返回 Markdown 代码围栏 JSON → 仍正确解析', async () => {
    const json = '```json\n{"weeks":[{"week":1,"days":[{"day":1,"lessons":[{"type":"main","title":"颜色"}]}]}]}\n```';
    const service = await setup(makeProvider(json));
    const res = await service.generatePlan(validDto);

    expect(res.degraded).toBe(false);
    expect(res.plan.weeks).toHaveLength(1);
  });

  it('provider 返回非 JSON → 直接抛 BadRequestException（不重试、不降级模板，chat 仅 1 次）', async () => {
    const provider = makeProvider('[Mock 计划] 一周趣味学习：周一主课颜色王国…');
    const service = await setup(provider);
    await expect(service.generatePlan(validDto)).rejects.toMatchObject({
      response: { code: 'PLAN_INVALID_JSON' },
    });
    expect((provider.chat as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('provider 返回坏 Schema（weeks:[]）→ 直接抛 BadRequestException（含 errors）', async () => {
    const provider = makeProvider('{"weeks":[]}');
    const service = await setup(provider);
    const { BadRequestException } = await import('@nestjs/common');
    await expect(service.generatePlan(validDto)).rejects.toBeInstanceOf(BadRequestException);
    expect((provider.chat as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('AI 输出被 max_tokens 截断（finish_reason=length）→ 抛 PLAN_TRUNCATED', async () => {
    const chat = jest.fn(async (): Promise<ChatResult> => ({
      text: '{"weeks":[{"week":1,"days":[{"day":1',
      model: 'm',
      finishReason: 'length',
    }));
    const provider = { name: 'mock', chat } as unknown as AiProvider;
    const service = await setup(provider);
    await expect(service.generatePlan(validDto)).rejects.toMatchObject({
      response: { code: 'PLAN_TRUNCATED' },
    });
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('provider.chat 抛错 → 异常向上传播（不在本层重试，避免与 AI-106 叠加）', async () => {
    const service = await setup(makeProvider(new Error('provider down')));
    await expect(service.generatePlan(validDto)).rejects.toThrow('provider down');
  });

  it('调用 provider 时传入 user payload（含全部字段）+ temperature 0.4', async () => {
    const provider = makeProvider(validPlanJson);
    const service = await setup(provider);
    await service.generatePlan(validDto);
    const chatMock = provider.chat as jest.Mock;
    expect(chatMock).toHaveBeenCalledTimes(1);
    const [messages, options] = chatMock.mock.calls[0];
    const userMsg = messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(JSON.parse(userMsg.content).learnerProfile).toMatchObject({
      level: 'a1',
      weeks: 2,
      interests: ['动物'],
    });
    expect(options?.temperature).toBe(0.4);
    expect(options?.maxTokens).toBe(8000);
    // 关闭思考链（覆盖种子 enable_thinking:true），提速并避免截断。
    expect(options?.extraBody).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(options?.timeoutMs).toBe(55_000);
  });

  it('发出的 system 消息即 AI-203 双语 PlanAgent 提示词（防回退占位）', async () => {
    const provider = makeProvider(validPlanJson);
    const service = await setup(provider);
    await service.generatePlan(validDto);
    const chatMock = provider.chat as jest.Mock;
    const [messages] = chatMock.mock.calls[0];
    const systemMsg = messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toBe(PLAN_SYSTEM_PROMPT);
    expect(systemMsg.content).toContain('狐狸老师');
  });

  it('user 消息为学习者画像 JSON（含 learnerProfile，未提供目录时含 catalogNote）', async () => {
    const provider = makeProvider(validPlanJson);
    const service = await setup(provider);
    await service.generatePlan(validDto);
    const chatMock = provider.chat as jest.Mock;
    const [messages] = chatMock.mock.calls[0];
    const userMsg = messages.find((m: { role: string }) => m.role === 'user');
    const parsed = JSON.parse(userMsg.content);
    expect(parsed.learnerProfile).toMatchObject({
      childId: UUID,
      ageRange: '6-8',
      level: 'a1',
      dailyMinutes: 20,
      interests: ['动物'],
      weeks: 2,
    });
    expect(parsed.catalogNote).toBeDefined();
    expect(parsed.curriculumCatalog).toBeUndefined();
  });

  it('useTemplate=true → 跳过 LLM 直出模板（degraded:false, model:template, chat 0 调用）', async () => {
    const provider = makeProvider(validPlanJson);
    const service = await setup(provider);
    const res = await service.generatePlan({ ...validDto, useTemplate: true });

    expect((provider.chat as jest.Mock)).toHaveBeenCalledTimes(0);
    expect(res.degraded).toBe(false);
    expect(res.model).toBe('template');
    expect(res.plan.weeks).toBeDefined();
    expect(res.plan.weeks).toHaveLength(2); // weeks=2 透传
    expect(res.plan.weeks![0].days![0].lessons!.length).toBe(4); // 20min → standard 档
  });

  it('useTemplate=false / 缺省 → 仍走 LLM（与 AI-204 路径一致）', async () => {
    const provider = makeProvider(validPlanJson);
    const service = await setup(provider);

    await service.generatePlan({ ...validDto, useTemplate: false });
    await service.generatePlan(validDto); // 缺省

    expect((provider.chat as jest.Mock)).toHaveBeenCalledTimes(2);
  });
});

describe('PlanService (AI-206) — 保存草稿 savePlan', () => {
  const plan = JSON.parse(validPlanJson);

  it('合法 plan → 落库草稿并返回 { id, status:"draft" }', async () => {
    const service = await setup(makeProvider(validPlanJson));
    const res = await service.savePlan({ childId: UUID, plan });
    expect(res.status).toBe('draft');
    expect(res.id).toBeDefined();
  });

  it('非法 plan（weeks:[]）→ 抛 BadRequestException（含 errors）', async () => {
    const { BadRequestException } = await import('@nestjs/common');
    const service = await setup(makeProvider(validPlanJson));
    await expect(service.savePlan({ childId: UUID, plan: { weeks: [] } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('PlanService (AI-206) — 应用 applyPlan', () => {
  const plan = JSON.parse(validPlanJson);
  const draftPlan = {
    id: 'plan-1',
    userId: UUID,
    status: 'draft',
    days: [
      { id: 'd1', dayIndex: 0, skillType: 'vocab', title: '第1天', content: '[{"title":"颜色"}]', isDone: false, date: null },
      { id: 'd2', dayIndex: 1, skillType: 'speak', title: '第2天', content: '[{"title":"口语"}]', isDone: false, date: null },
    ],
  };
  const appliedPlan = { ...draftPlan, status: 'applied' };

  it('计划不存在 → 抛 NotFoundException', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => null) };
    const service = await setup(makeProvider(validPlanJson), { planRepo });
    await expect(service.applyPlan('missing', false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('草稿 → 置 applied 并写入每日任务（AI-803 Plan A：每天按节拆课，tasksCreated = 各天引用数之和）', async () => {
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => draftPlan) };
    const tasksService = { replacePlanTasks: jest.fn(async () => {}) };
    const service = await setup(makeProvider(validPlanJson), { planRepo, tasksService });

    const res = await service.applyPlan('plan-1', false);

    expect(res.status).toBe('applied');
    expect(res.appliedDays).toBe(2);
    // 每天 content 含 1 节引用（无 lessonId）→ 1 任务/天；引用无效（缺 lessonId）→ 无深链。
    expect(res.tasksCreated).toBe(2);
    expect(res.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(planRepo.save).toHaveBeenCalledTimes(1);
    expect(tasksService.replacePlanTasks).toHaveBeenCalledTimes(1);
    const [, planDayIds, entries] = (tasksService.replacePlanTasks as jest.Mock).mock.calls[0];
    expect(planDayIds).toEqual(['d1', 'd2']);
    expect(entries).toHaveLength(2);
    expect(entries[0].userId).toBe(UUID);
    expect(entries[0].planDayId).toBe('d1');
    expect(entries[0].date).toBe(res.appliedAt);
    expect(entries[0].icon).toBe('pencil'); // vocab → pencil
    expect(entries[1].icon).toBe('mic'); // speak → mic
    // AI-803：计划生成任务统一打 source:'plan'；本节无真实 lessonId → 深链字段为 null（降级）。
    expect(entries[0].source).toBe('plan');
    expect(entries[0].lessonId).toBeNull();
    expect(entries[0].courseId).toBeNull();
    expect(entries[0].skillType).toBeNull();
  });

  it('已 applied 且 confirm=false → 抛 ConflictException(needsConfirm:true)', async () => {
    const { ConflictException } = await import('@nestjs/common');
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => appliedPlan) };
    const tasksService = { replacePlanTasks: jest.fn(async () => {}) };
    const service = await setup(makeProvider(validPlanJson), { planRepo, tasksService });

    await expect(service.applyPlan('plan-1', false)).rejects.toMatchObject({
      response: { code: 'PLAN_ALREADY_APPLIED', needsConfirm: true },
    });
    expect(tasksService.replacePlanTasks).not.toHaveBeenCalled();
  });

  it('已 applied 且 confirm=true → 覆盖式重应用（replacePlanTasks 被调用）', async () => {
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => appliedPlan) };
    const tasksService = { replacePlanTasks: jest.fn(async () => {}) };
    const service = await setup(makeProvider(validPlanJson), { planRepo, tasksService });

    const res = await service.applyPlan('plan-1', true);
    expect(res.status).toBe('applied');
    expect(tasksService.replacePlanTasks).toHaveBeenCalledTimes(1);
  });
});

describe('PlanService (AI-803) — 目录注入 generatePlan', () => {
  it('注入非空目录 → user 消息含 curriculumCatalog（含真实课程/课时 id）且不含 catalogNote', async () => {
    const provider = makeProvider(validPlanJson);
    const coursesService = defaultCoursesService();
    coursesService.getCatalog = jest.fn(async () => sampleCatalog);
    const service = await setup(provider, { coursesService });

    await service.generatePlan(validDto);

    const chatMock = provider.chat as jest.Mock;
    expect(chatMock).toHaveBeenCalledTimes(1);
    const [messages] = chatMock.mock.calls[0];
    const userMsg = messages.find((m: { role: string }) => m.role === 'user');
    const parsed = JSON.parse(userMsg.content);
    expect(parsed.curriculumCatalog).toBeDefined();
    expect(parsed.curriculumCatalog.courses).toEqual(sampleCatalog.courses);
    expect(parsed.curriculumCatalog.lessons.map((l: { lessonId: string }) => l.lessonId)).toEqual([
      'lesson-1',
      'lesson-2',
    ]);
    expect(parsed.catalogNote).toBeUndefined();
  });

  it('getCatalog 抛错 → 降级为无目录分支（不阻断计划生成，curriculumCatalog 仍 undefined）', async () => {
    const provider = makeProvider(validPlanJson);
    const coursesService = defaultCoursesService();
    coursesService.getCatalog = jest.fn(async () => {
      throw new Error('db down');
    });
    const service = await setup(provider, { coursesService });

    const res = await service.generatePlan(validDto); // 不应抛
    expect(res.degraded).toBe(false);
    const chatMock = provider.chat as jest.Mock;
    const messages = chatMock.mock.calls[0][0];
    const parsed = JSON.parse(messages.find((m: any) => m.role === 'user').content);
    expect(parsed.curriculumCatalog).toBeUndefined();
  });
});

describe('PlanService (AI-803) — savePlan 持久化 lessonRefsJson', () => {
  const planWithRealIds = JSON.parse(
    JSON.stringify({
      weeks: [
        {
          week: 1,
          days: [
            {
              day: 1,
              skillType: 'vocab',
              title: '颜色王国',
              lessons: [
                { type: 'main', title: '颜色', skillType: 'vocab', courseId: 'course-1', lessonId: 'lesson-1' },
                { type: 'review', title: '听音', skillType: 'listen', courseId: 'course-1', lessonId: 'lesson-2' },
              ],
            },
          ],
        },
      ],
    }),
  );

  it('buildStudyPlan 把每节引用提取进 lessonRefsJson（含 courseId/lessonId/skillType/title）', async () => {
    const planRepo = { save: jest.fn(async (e: any) => ({ ...e, id: 'plan-1', status: 'draft' })), findOne: jest.fn() };
    const service = await setup(makeProvider(validPlanJson), { planRepo });

    await service.savePlan({ childId: UUID, plan: planWithRealIds });

    const savedArg = (planRepo.save as jest.Mock).mock.calls[0][0];
    expect(savedArg.days).toHaveLength(1);
    const refs = JSON.parse(savedArg.days[0].lessonRefsJson);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ courseId: 'course-1', lessonId: 'lesson-1', skillType: 'vocab', title: '颜色' });
    expect(refs[1]).toMatchObject({ courseId: 'course-1', lessonId: 'lesson-2', skillType: 'listen', title: '听音' });
    // content 仍保留 lessons（向后兼容解析）。
    expect(JSON.parse(savedArg.days[0].content)).toHaveLength(2);
  });
});

describe('PlanService (AI-803) — applyPlan Plan A 拆课与真实存在性校验', () => {
  // 每次返回全新对象，避免上一个测试把 status 改成 applied 后污染后续用例（applyPlan 会就地改 plan）。
  function makePlanWithValidRefs() {
    return {
      id: 'plan-2',
      userId: UUID,
      status: 'draft',
      days: [
        {
          id: 'd1', dayIndex: 0, skillType: 'vocab', title: '第1天', content: '[]', isDone: false, date: null,
          lessonRefsJson: JSON.stringify([
            { skillType: 'vocab', courseId: 'course-1', lessonId: 'lesson-1', title: '颜色' },
            { skillType: 'listen', courseId: 'course-1', lessonId: 'lesson-2', title: '听音辨色' },
          ]),
        },
        {
          id: 'd2', dayIndex: 1, skillType: 'speak', title: '第2天', content: '[]', isDone: false, date: null,
          lessonRefsJson: JSON.stringify([
            { skillType: 'speak', courseId: 'course-1', lessonId: 'lesson-2', title: '口语' },
          ]),
        },
      ],
    };
  }

  it('有效引用（lessonExists=true）→ 按节拆课并写 courseId/lessonId/skillType/source：每天 N 节 → N 任务', async () => {
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => makePlanWithValidRefs()) };
    const tasksService = { replacePlanTasks: jest.fn(async () => {}) };
    const service = await setup(makeProvider(validPlanJson), { planRepo, tasksService });

    const res = await service.applyPlan('plan-2', false);

    expect(res.appliedDays).toBe(2);
    expect(res.tasksCreated).toBe(3); // d1 两节 + d2 一节
    const [, planDayIds, entries] = (tasksService.replacePlanTasks as jest.Mock).mock.calls[0];
    expect(planDayIds).toEqual(['d1', 'd2']);
    expect(entries).toHaveLength(3);
    // d1 节1：vocab → pencil，深链字段齐全。
    expect(entries[0]).toMatchObject({
      title: '颜色', planDayId: 'd1', icon: 'pencil',
      courseId: 'course-1', lessonId: 'lesson-1', skillType: 'vocab', source: 'plan',
    });
    // d1 节2：listen → headphones。
    expect(entries[1]).toMatchObject({
      title: '听音辨色', planDayId: 'd1', icon: 'headphones',
      courseId: 'course-1', lessonId: 'lesson-2', skillType: 'listen', source: 'plan',
    });
    // d2 节1：speak → mic。
    expect(entries[2]).toMatchObject({
      title: '口语', planDayId: 'd2', icon: 'mic',
      courseId: 'course-1', lessonId: 'lesson-2', skillType: 'speak', source: 'plan',
    });
  });

  it('引用 lessonId 不存在（lessonExists=false）→ 降级为无深链任务（不整计划失败），source 仍为 plan', async () => {
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => makePlanWithValidRefs()) };
    const tasksService = { replacePlanTasks: jest.fn(async () => {}) };
    const coursesService = defaultCoursesService();
    coursesService.lessonExists = jest.fn(async () => false); // 全部判定为不存在
    const service = await setup(makeProvider(validPlanJson), { planRepo, tasksService, coursesService });

    const res = await service.applyPlan('plan-2', false);

    expect(res.tasksCreated).toBe(3); // 任务数不减少（每节仍 1 任务），仅丢失深链
    const [, , entries] = (tasksService.replacePlanTasks as jest.Mock).mock.calls[0];
    for (const e of entries) {
      expect(e.courseId).toBeNull();
      expect(e.lessonId).toBeNull();
      expect(e.skillType).toBeNull();
      expect(e.source).toBe('plan'); // 仍标记为计划任务
    }
  });

  it('某天无引用（lessonRefsJson/content 皆空）→ 该天退化为 1 条通用任务（source:plan，无深链字段），不抛错', async () => {
    const planWithEmptyDay = {
      id: 'plan-3', userId: UUID, status: 'draft',
      days: [{ id: 'd1', dayIndex: 0, skillType: 'vocab', title: '复习日', content: '[]', isDone: false, date: null, lessonRefsJson: null }],
    };
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => planWithEmptyDay) };
    const tasksService = { replacePlanTasks: jest.fn(async () => {}) };
    const service = await setup(makeProvider(validPlanJson), { planRepo, tasksService });

    const res = await service.applyPlan('plan-3', false);
    expect(res.tasksCreated).toBe(1);
    const [, , entries] = (tasksService.replacePlanTasks as jest.Mock).mock.calls[0];
    expect(entries[0]).toMatchObject({ title: '复习日', icon: 'pencil', source: 'plan' });
    // 通用任务不携带深链字段（buildGenericEntry 仅写必要字段）。
    expect(entries[0].lessonId).toBeUndefined();
    expect(entries[0].courseId).toBeUndefined();
    expect(entries[0].skillType).toBeUndefined();
  });
});

describe('PlanService (AI-803) — generateCoursesForPlan 写回引用', () => {
  const planForCourses = {
    id: 'plan-c1', userId: UUID, status: 'draft',
    days: [
      { id: 'd0', dayIndex: 0, skillType: 'vocab', title: '颜色', content: '[]', isDone: false },
      { id: 'd1', dayIndex: 1, skillType: 'vocab', title: '动物', content: '[]', isDone: false },
    ],
  };

  it('生成配套课程后把 courseId/lessonId 写回每计划天的 lessonRefsJson（1:1 映射，计划天 i ↔ 课时 i）', async () => {
    const planRepo = { save: jest.fn(async (e) => e), findOne: jest.fn(async () => planForCourses) };
    const coursesService = defaultCoursesService();
    const service = await setup(makeProvider('{}'), { planRepo, coursesService });

    const res = await service.generateCoursesForPlan('plan-c1');
    expect(res.courseId).toBe('gen-course-1');
    expect(planRepo.save).toHaveBeenCalledTimes(1); // writeBack 调用

    const savedDays = (planRepo.save as jest.Mock).mock.calls[0][0].days;
    expect(savedDays).toHaveLength(2);
    const refs0 = JSON.parse(savedDays[0].lessonRefsJson);
    const refs1 = JSON.parse(savedDays[1].lessonRefsJson);
    expect(refs0[0]).toMatchObject({ courseId: 'gen-course-1', lessonId: 'gen-lesson-0', skillType: 'vocab', title: '颜色' });
    expect(refs1[0]).toMatchObject({ courseId: 'gen-course-1', lessonId: 'gen-lesson-1', skillType: 'vocab', title: '动物' });
  });

  it('写回失败时仅告警、不阻断课程生成主响应（createCourseFromPlan 已成功）', async () => {
    const planRepo = {
      save: jest.fn(async () => { throw new Error('save failed'); }),
      findOne: jest.fn(async () => planForCourses),
    };
    const coursesService = defaultCoursesService();
    const service = await setup(makeProvider('{}'), { planRepo, coursesService });

    // 不应抛（写回失败被 catch），主响应正常。
    const res = await service.generateCoursesForPlan('plan-c1');
    expect(res.courseId).toBe('gen-course-1');
  });
});

describe('PlanService (AI-804) — 流式生成 generatePlanStream', () => {
  /** 把流式生成器的事件全部收齐为数组，便于断言序列。 */
  async function collect(service: PlanService, dto: GeneratePlanDto, signal?: AbortSignal) {
    const events: any[] = [];
    for await (const ev of service.generatePlanStream(dto, signal)) {
      events.push(ev);
    }
    return events;
  }

  /** 构造一个带 streamChat 的 mock provider：把 text 按 chunkSize 切片逐块 yield（模拟逐字）。 */
  function makeStreamProvider(text: string, opts?: { truncated?: boolean; error?: Error }): AiProvider {
    return {
      name: 'mock-stream',
      chat: jest.fn(async (): Promise<ChatResult> => ({ text, model: 'mock-model' })),
      async *streamChat(): AsyncIterable<string> {
        if (opts?.error) throw opts.error;
        const chunkSize = 8;
        for (let i = 0; i < text.length; i += chunkSize) {
          yield text.slice(i, i + chunkSize);
        }
        if (opts?.truncated) {
          throw Object.assign(new Error('truncated'), { code: 'PLAN_TRUNCATED' });
        }
      },
    } as unknown as AiProvider;
  }

  it('provider 产出合法 JSON → 事件序列 start → 多 token → writing → done(plan)', async () => {
    const service = await setup(makeStreamProvider(validPlanJson));
    const events = await collect(service, validDto);

    expect(events[0]).toEqual({ type: 'start' });
    expect(events[1]).toEqual({ type: 'progress', phase: 'thinking' });
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(1); // 切片成多块
    expect(tokens.map((t) => t.text).join('')).toBe(validPlanJson);
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect((done as any).plan.weeks).toHaveLength(1);
    expect((done as any).model).toBe('ai');
  });

  it('provider 产出非法 JSON → 事件序列 start → token(s) → error(PLAN_INVALID_JSON)，不抛未捕获异常', async () => {
    const service = await setup(makeStreamProvider('这不是合法 JSON 的一堆文字…'));
    const events = await collect(service, validDto);

    expect(events[0].type).toBe('start');
    const last = events[events.length - 1];
    expect(last.type).toBe('error');
    expect((last as any).code).toBe('PLAN_INVALID_JSON');
  });

  it('provider 返回 Schema 不合法的合法 JSON → error(PLAN_SCHEMA_INVALID)，message 含错误明细', async () => {
    const badSchema = JSON.stringify({ foo: 'bar' }); // 缺 weeks
    const service = await setup(makeStreamProvider(badSchema));
    const events = await collect(service, validDto);

    const last = events[events.length - 1];
    expect(last.type).toBe('error');
    expect((last as any).code).toBe('PLAN_SCHEMA_INVALID');
    expect((last as any).message).toContain('结构校验未通过');
  });

  it('provider 流末抛 PLAN_TRUNCATED → error 事件 code 映射为 PLAN_TRUNCATED（非 AI_ERROR）', async () => {
    const service = await setup(makeStreamProvider(validPlanJson, { truncated: true }));
    const events = await collect(service, validDto);

    const last = events[events.length - 1];
    expect(last.type).toBe('error');
    expect((last as any).code).toBe('PLAN_TRUNCATED');
  });

  it('provider 流中抛其它异常 → error 事件 code=AI_ERROR', async () => {
    const service = await setup(makeStreamProvider('x', { error: new Error('boom') }));
    const events = await collect(service, validDto);

    const last = events[events.length - 1];
    expect(last.type).toBe('error');
    expect((last as any).code).toBe('AI_ERROR');
  });

  it('useTemplate=true → 跳过 LLM 直出模板计划（start → done, model=template）', async () => {
    const service = await setup(makeStreamProvider(validPlanJson));
    const events = await collect(service, { ...validDto, useTemplate: true });

    expect(events[0]).toEqual({ type: 'start' });
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect((done as any).model).toBe('template');
  });

  it('provider 无 streamChat（不支持）→ error(STREAM_UNSUPPORTED) 而非崩溃', async () => {
    const noStream = { name: 'no-stream', chat: jest.fn() } as unknown as AiProvider;
    const service = await setup(noStream);
    const events = await collect(service, validDto);
    const last = events[events.length - 1];
    expect(last.type).toBe('error');
    expect((last as any).code).toBe('STREAM_UNSUPPORTED');
  });
});

describe('PlanService (AI-209) — 计划完成度 getStatus', () => {
  const appliedPlanWithDays = {
    id: 'plan-1',
    userId: UUID,
    status: 'applied',
    days: [
      { id: 'd1', isDone: false },
      { id: 'd2', isDone: true },
      { id: 'd3', isDone: false },
    ],
    updatedAt: new Date('2026-08-05T10:00:00Z'),
  };

  it('有 applied 计划 → 返回 totalDays/doneDays/completionRatio/planId/appliedAt', async () => {
    const planRepo = { findOne: jest.fn(async () => appliedPlanWithDays) };
    const service = await setup(makeProvider(validPlanJson), { planRepo });

    const res = await service.getPlanStatus(UUID);

    expect(planRepo.findOne).toHaveBeenCalledWith({
      where: { userId: UUID, status: 'applied' },
      relations: ['days'],
      order: { updatedAt: 'DESC' },
    });
    expect(res.hasPlan).toBe(true);
    expect(res.totalDays).toBe(3);
    expect(res.doneDays).toBe(1);
    expect(res.completionRatio).toBeCloseTo(1 / 3);
    expect(res.planId).toBe('plan-1');
    expect(res.appliedAt).toBe('2026-08-05');
  });

  it('无 applied 计划 → hasPlan:false 且计数为 0', async () => {
    const planRepo = { findOne: jest.fn(async () => null) };
    const service = await setup(makeProvider(validPlanJson), { planRepo });

    const res = await service.getPlanStatus(UUID);
    expect(res).toEqual({ hasPlan: false, totalDays: 0, doneDays: 0, completionRatio: 0 });
  });

  it('applied 计划 days 为空 → completionRatio:0 不除零', async () => {
    const planRepo = {
      findOne: jest.fn(async () => ({ id: 'plan-1', status: 'applied', days: [], updatedAt: new Date() })),
    };
    const service = await setup(makeProvider(validPlanJson), { planRepo });

    const res = await service.getPlanStatus(UUID);
    expect(res.hasPlan).toBe(true);
    expect(res.totalDays).toBe(0);
    expect(res.doneDays).toBe(0);
    expect(res.completionRatio).toBe(0);
  });
});

describe('extractJson — 鲁棒提取（去散文/围栏/尾逗号，仍由调用方抛真坏 JSON）', () => {
  it('纯 JSON 原样返回', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('```json 围栏 → 取内部', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('JSON 前后夹散文 → 切片到首尾括号', () => {
    const raw = '这是你的计划：\n{"weeks":[{"week":1}]}\n希望你喜欢！';
    expect(extractJson(raw)).toBe('{"weeks":[{"week":1}]}');
  });

  it('对象尾随逗号 → 去除后可解析', () => {
    expect(extractJson('{"a":1,}')).toBe('{"a":1}');
  });

  it('数组尾随逗号 → 去除后可解析', () => {
    expect(extractJson('[1,2,3,]')).toBe('[1,2,3]');
  });

  it('围栏 + 散文 + 尾逗号混合 → 提取为合法 JSON', () => {
    const raw = '好的，计划如下：\n```json\n{"weeks":[{"week":1,"days":[{"day":1,}]}],\n}\n```\n祝学习愉快';
    const out = extractJson(raw);
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out)).toEqual({ weeks: [{ week: 1, days: [{ day: 1 }] }] });
  });

  it('完全无 JSON 结构 → 仍返回切片后的原文（调用方 JSON.parse 抛错，符合「出错即抛」）', () => {
    const out = extractJson('抱歉我无法生成计划，因为……');
    expect(() => JSON.parse(out)).toThrow();
  });
});
