import { Test, TestingModule } from '@nestjs/testing';
import { AI_PROVIDER_TOKEN, AiProvider, ChatResult } from '../ai/ai-provider.interface';
import { PlanService } from './plan.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { PLAN_SYSTEM_PROMPT } from './plan-agent.prompt';

/**
 * PlanService 单测（AI-202 编排 + AI-203 提示词 + AI-204 Schema 校验/重试/模板降级）：
 * 覆盖有逻辑分支——合法 JSON 首轮通过、Markdown 围栏、坏 JSON/坏 Schema 自动重试 ≤3
 * 次后降级模板、provider 异常传播、重试带 retryNote、发出的 system/user 消息形态。
 * 直接用 mock provider 注入，避免依赖真实 LLM / DB。
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

function makeProvider(text: string | Error, model = 'mock-model'): AiProvider {
  const chat = jest.fn(async (): Promise<ChatResult> => {
    if (text instanceof Error) throw text;
    return { text, model };
  });
  return { name: 'mock', chat } as unknown as AiProvider;
}

async function setup(provider: AiProvider): Promise<PlanService> {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [PlanService, { provide: AI_PROVIDER_TOKEN, useValue: provider }],
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

  it('provider 返回非 JSON → 重试 3 次后降级模板（degraded:true, weeks 有效）', async () => {
    const provider = makeProvider('[Mock 计划] 一周趣味学习：周一主课颜色王国…');
    const service = await setup(provider);
    const res = await service.generatePlan(validDto);

    expect((provider.chat as jest.Mock)).toHaveBeenCalledTimes(PlanService.MAX_PLAN_ATTEMPTS);
    expect(res.degraded).toBe(true);
    expect(res.model).toBe('template');
    expect(res.plan.weeks).toBeDefined();
    expect(res.plan.weeks!.length).toBe(2);
    expect(res.plan.weeks![0].days![0].lessons!.length).toBe(4);
    expect(res.plan.rawText).toBeUndefined();
  });

  it('provider 返回坏 Schema（weeks:[]）→ 重试 3 次后降级模板', async () => {
    const provider = makeProvider('{"weeks":[]}');
    const service = await setup(provider);
    const res = await service.generatePlan(validDto);

    expect((provider.chat as jest.Mock)).toHaveBeenCalledTimes(PlanService.MAX_PLAN_ATTEMPTS);
    expect(res.degraded).toBe(true);
    expect(res.plan.weeks).toBeDefined();
  });

  it('坏 JSON 第 1 次、合法 JSON 第 2 次 → 第 2 次成功（degraded:false, 调用 2 次）', async () => {
    const chat = jest.fn()
      .mockResolvedValueOnce({ text: 'not json', model: 'm' })
      .mockResolvedValueOnce({ text: validPlanJson, model: 'm' });
    const provider = { name: 'mock', chat } as unknown as AiProvider;
    const service = await setup(provider);
    const res = await service.generatePlan(validDto);

    expect(chat).toHaveBeenCalledTimes(2);
    expect(res.degraded).toBe(false);
    expect(res.plan.weeks).toHaveLength(1);
  });

  it('重试请求（attempt>1）的 user 消息含 retryNote 自我纠正', async () => {
    const chat = jest.fn()
      .mockResolvedValueOnce({ text: '{"weeks":[]}', model: 'm' })
      .mockResolvedValueOnce({ text: validPlanJson, model: 'm' });
    const provider = { name: 'mock', chat } as unknown as AiProvider;
    const service = await setup(provider);
    await service.generatePlan(validDto);

    const firstUser = JSON.parse(chat.mock.calls[0][0].find((m: { role: string }) => m.role === 'user').content);
    const secondUser = JSON.parse(chat.mock.calls[1][0].find((m: { role: string }) => m.role === 'user').content);
    expect(firstUser.retryNote).toBeUndefined();
    expect(secondUser.retryNote).toBeDefined();
    expect(secondUser.retryNote).toContain('第 2 次');
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
