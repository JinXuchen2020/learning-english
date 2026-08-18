import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AI_PROVIDER_TOKEN, AiProvider, ChatResult } from '../ai/ai-provider.interface';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { StudyPlan } from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';
import { TasksService } from '../tasks/tasks.service';
import { CoursesService } from '../courses/courses.service';

/**
 * PlanController 单测（AI-202 生成 + AI-206 save/apply 路由装配）：验证 DTO 经全局
 * ValidationPipe 拦截非法入参（等价 400）。Controller 调 PlanService，后者注入
 * mock provider + mock repo + mock TasksService（仅验证装配与 DTO 校验，不触真实逻辑）。
 */

const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

const validPlain = {
  childId: UUID,
  ageRange: '6-8',
  level: 'a1',
  dailyMinutes: 20,
  interests: ['动物'],
  weeks: 2,
};

function makeProvider(json: string): AiProvider {
  return {
    name: 'mock',
    chat: jest.fn(async (): Promise<ChatResult> => ({ text: json, model: 'mock-model' })),
  } as unknown as AiProvider;
}

describe('PlanController (AI-202/AI-206)', () => {
  let controller: PlanController;
  let pipe: ValidationPipe;

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      controllers: [PlanController],
      providers: [
        PlanService,
        {
          provide: AI_PROVIDER_TOKEN,
          useValue: makeProvider('{"weeks":[{"week":1,"days":[{"day":1,"lessons":[{"type":"main","title":"颜色"}]}]}]}'),
        },
        { provide: getRepositoryToken(StudyPlan), useValue: { save: jest.fn(), findOne: jest.fn() } },
        { provide: getRepositoryToken(StudyPlanDay), useValue: { save: jest.fn() } },
        { provide: TasksService, useValue: { replacePlanTasks: jest.fn() } },
        // AI-803：PlanService 现注入 CoursesService（目录注入 + 引用校验），测试模块需提供。
        {
          provide: CoursesService,
          useValue: {
            getCatalog: jest.fn(async () => ({ courses: [], lessons: [] })),
            lessonExists: jest.fn(async () => false),
            courseExists: jest.fn(async () => false),
            findOne: jest.fn(async () => ({ id: 'x', lessons: [] })),
            createCourseFromPlan: jest.fn(async () => ({ courseId: 'x', lessonCount: 0, wordCount: 0 })),
          },
        },
      ],
    }).compile();
    controller = mod.get(PlanController);
    // 与 main.ts 完全一致：whitelist + transform + forbidNonWhitelisted
    pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  });

  it('合法 body → 返回结构化 GeneratePlanResponse', async () => {
    const dto = (await pipe.transform(validPlain, { type: 'body', metatype: GeneratePlanDto })) as GeneratePlanDto;
    const res = await controller.generate(dto);
    expect(res.degraded).toBe(false);
    expect(res.plan.weeks).toHaveLength(1);
  });

  it('非法 body（缺 weeks + level 越界）→ ValidationPipe 抛 BadRequestException（400）', async () => {
    const badPlain = { childId: UUID, ageRange: '6-8', level: 'z9', dailyMinutes: 20, interests: ['动物'] };
    await expect(
      pipe.transform(badPlain, { type: 'body', metatype: GeneratePlanDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('非 uuid childId → ValidationPipe 抛 400', async () => {
    const badPlain = { ...validPlain, childId: 'xyz' };
    await expect(
      pipe.transform(badPlain, { type: 'body', metatype: GeneratePlanDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('interests 为空数组 → ValidationPipe 抛 400', async () => {
    const badPlain = { ...validPlain, interests: [] };
    await expect(
      pipe.transform(badPlain, { type: 'body', metatype: GeneratePlanDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
