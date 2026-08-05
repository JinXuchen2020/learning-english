import { Test, TestingModule } from '@nestjs/testing';
import { AI_PROVIDER_TOKEN, AiProvider, ChatResult } from '../ai/ai-provider.interface';
import { PlanService } from './plan.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';

/**
 * PlanService 单测（AI-202）：覆盖有逻辑分支——JSON 解析成功、非 JSON 降级、
 * provider 异常传播。直接用 mock provider 注入，避免依赖真实 LLM / DB。
 */

const UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

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

describe('PlanService (AI-202)', () => {
  it('provider 返回合法 JSON → degraded:false 且 plan 透传', async () => {
    const json = JSON.stringify({
      weeks: [{ week: 1, days: [{ day: 1, skillType: 'vocab', title: '颜色王国', lessons: [{ type: 'main', title: '颜色' }] }] }],
    });
    const service = await setup(makeProvider(json));
    const res = await service.generatePlan(validDto);

    expect(res.degraded).toBe(false);
    expect(res.model).toBe('mock-model');
    expect(res.plan.weeks).toHaveLength(1);
    expect(res.plan.weeks![0].days![0].title).toBe('颜色王国');
  });

  it('provider 返回 Markdown 代码围栏 JSON → 仍正确解析', async () => {
    const json = '```json\n{"weeks":[{"week":1,"days":[]}]}\n```';
    const service = await setup(makeProvider(json));
    const res = await service.generatePlan(validDto);

    expect(res.degraded).toBe(false);
    expect(res.plan.weeks).toHaveLength(1);
  });

  it('provider 返回非 JSON 文本 → degraded:true 且 rawText 兜底', async () => {
    const service = await setup(makeProvider('[Mock 计划] 一周趣味学习：周一主课颜色王国…'));
    const res = await service.generatePlan(validDto);

    expect(res.degraded).toBe(true);
    expect(res.plan.rawText).toContain('[Mock 计划]');
    expect(res.plan.weeks).toBeUndefined();
  });

  it('provider.chat 抛错 → 异常向上传播', async () => {
    const service = await setup(makeProvider(new Error('provider down')));
    await expect(service.generatePlan(validDto)).rejects.toThrow('provider down');
  });

  it('调用 provider 时传入 user payload（含全部字段）', async () => {
    const provider = makeProvider('{"weeks":[]}');
    const service = await setup(provider);
    await service.generatePlan(validDto);
    const chatMock = provider.chat as jest.Mock;
    expect(chatMock).toHaveBeenCalledTimes(1);
    const [messages, options] = chatMock.mock.calls[0];
    const userMsg = messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(JSON.parse(userMsg.content)).toMatchObject({ level: 'a1', weeks: 2, interests: ['动物'] });
    expect(options?.temperature).toBe(0.4);
  });
});
