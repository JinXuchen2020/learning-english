import { QueryFailedError } from 'typeorm';
import { AiReportService, DailyReportStats } from './ai-report.service';
import { AiReport } from './ai-report.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { AiSpeechAttempt } from './ai-speech-attempt.entity';
import { AiProvider } from './ai-provider.interface';
import { parseReportAgentOutput, DEFAULT_SUMMARY, DEFAULT_SUGGESTION } from './report-agent';

function makeService(overrides: {
  reportRepo?: any;
  taskCompletionRepo?: any;
  wordProgressRepo?: any;
  lessonProgressRepo?: any;
  speechAttemptRepo?: any;
  aiProvider?: any;
}) {
  const reportRepo = overrides.reportRepo || {
    create: (e: any) => e,
    save: jest.fn(async (e: any) => ({ ...e, id: 'r1', createdAt: new Date() })),
    findOne: jest.fn(),
  };
  const taskCompletionRepo = overrides.taskCompletionRepo || { count: jest.fn(async () => 0) };
  const wordProgressRepo = overrides.wordProgressRepo || { find: jest.fn(async () => []) };
  const lessonProgressRepo = overrides.lessonProgressRepo || { find: jest.fn(async () => []) };
  const speechAttemptRepo = overrides.speechAttemptRepo || { find: jest.fn(async () => []) };
  const aiProvider: AiProvider = overrides.aiProvider || {
    name: 'mock',
    chat: jest.fn(async () => ({ text: '{}' })),
    chatWithImage: jest.fn(),
    transcribe: jest.fn(),
    assessPronunciation: jest.fn(),
    synthesize: jest.fn(),
  };
  const svc = new AiReportService(
    reportRepo,
    taskCompletionRepo,
    wordProgressRepo,
    lessonProgressRepo,
    speechAttemptRepo,
    aiProvider,
  );
  return { svc, reportRepo, taskCompletionRepo, wordProgressRepo, lessonProgressRepo, speechAttemptRepo, aiProvider };
}

const DATE = '2026-08-07';

describe('AiReportService.getDailyStats (AI-502 聚合口径)', () => {
  it('正确聚合四类统计（含口语平均分四舍五入）', async () => {
    const { svc, taskCompletionRepo, wordProgressRepo, lessonProgressRepo, speechAttemptRepo } =
      makeService({
        taskCompletionRepo: { count: jest.fn(async () => 2) },
        wordProgressRepo: { find: jest.fn(async () => [{ id: 'w1' }, { id: 'w2' }]) },
        lessonProgressRepo: { find: jest.fn(async () => [{ id: 'l1' }]) },
        speechAttemptRepo: { find: jest.fn(async () => [{ score: 80 }, { score: 61 }]) },
      });

    const stats: DailyReportStats = await svc.getDailyStats('u1', DATE);

    expect(stats).toEqual({
      date: DATE,
      taskComplete: 2,
      wordsPracticed: 2,
      lessonsCompleted: 1,
      speechAttempts: 2,
      avgSpeechScore: 71, // round((80+61)/2)=round(70.5)=71
      weakWordCandidates: [], // 无 word/attempts 详情 → 无候选
    });
  });

  it('弱项候选：当日低正确率真实单词入选、全对单词排除、去重上限5（AI-503）', async () => {
    const { svc } = makeService({
      wordProgressRepo: {
        find: jest.fn(async () => [
          { attempts: 3, correctCount: 1, word: { text: 'apple' } }, // 1/3≈0.33 <0.6 → 入选
          { attempts: 2, correctCount: 0, word: { text: 'banana' } }, // 0 <0.6 → 入选
          { attempts: 5, correctCount: 5, word: { text: 'cat' } }, // 1.0 → 排除
          { attempts: 1, correctCount: 0, word: { text: 'apple' } }, // 重复 → 去重
          { attempts: 4, correctCount: 2, word: { text: 'dog' } }, // 0.5 <0.6 → 入选
          { attempts: 0, correctCount: 0, word: { text: 'egg' } }, // attempts<1 → 排除
        ]),
      },
    });

    const stats = await svc.getDailyStats('u1', DATE);

    expect(stats.weakWordCandidates).toEqual(['apple', 'banana', 'dog']); // 去重后 3 个、均<0.6、cat/egg 排除
    expect(stats.wordsPracticed).toBe(6);
  });

  it('弱项候选：WordProgress 无 word 关联时安全跳过，不抛', async () => {
    const { svc } = makeService({
      wordProgressRepo: {
        find: jest.fn(async () => [{ attempts: 3, correctCount: 0 }]), // 无 word
      },
    });
    const stats = await svc.getDailyStats('u1', DATE);
    expect(stats.weakWordCandidates).toEqual([]);
  });

  it('无口语尝试时 avgSpeechScore 为 null', async () => {
    const { svc } = makeService({ speechAttemptRepo: { find: jest.fn(async () => []) } });
    const stats = await svc.getDailyStats('u1', DATE);
    expect(stats.avgSpeechScore).toBeNull();
    expect(stats.speechAttempts).toBe(0);
  });
});

describe('AiReportService.generateDailyReport (AI-502 生成流程)', () => {
  it('无当日活动 → 友好默认报告（isDefault=true），不调 AI，且持久化', async () => {
    const { svc, reportRepo, aiProvider } = makeService({
      reportRepo: {
        create: (e: any) => e,
        save: jest.fn(async (e: any) => ({ ...e, id: 'r1', createdAt: new Date() })),
        findOne: jest.fn(async () => null), // 无已有
      },
    });

    const res = await svc.generateDailyReport('u1', DATE);

    expect(res.isDefault).toBe(true);
    expect(res.summaryText).toContain('还没有开始学习');
    expect(res.weakWords).toEqual([]);
    expect(aiProvider.chat).not.toHaveBeenCalled();
    expect(reportRepo.save).toHaveBeenCalledTimes(1);
  });

  it('有当日活动 → 调 AI 生成真实报告（isDefault=false），解析落库', async () => {
    const agentText = JSON.stringify({
      summaryText: '今天你很棒！',
      weakWords: ['apple', 'banana'],
      suggestionText: '明天复习一下哦',
      mascotExpr: 'cheer',
    });
    const { svc, reportRepo, aiProvider } = makeService({
      taskCompletionRepo: { count: jest.fn(async () => 1) }, // 有活动
      wordProgressRepo: {
        find: jest.fn(async () => [{ attempts: 3, correctCount: 1, word: { text: 'apple' } }]),
      },
      aiProvider: {
        name: 'mock',
        chat: jest.fn(async () => ({ text: agentText })),
        chatWithImage: jest.fn(),
        transcribe: jest.fn(),
        assessPronunciation: jest.fn(),
        synthesize: jest.fn(),
      },
      reportRepo: {
        create: (e: any) => e,
        save: jest.fn(async (e: any) => ({ ...e, id: 'r2', createdAt: new Date() })),
        findOne: jest.fn(async () => null),
      },
    });

    const res = await svc.generateDailyReport('u1', DATE);

    expect(aiProvider.chat).toHaveBeenCalledTimes(1);
    // AI-503 验收：user 消息把真实弱项候选随统计一起喂给模型
    const userMsg = (aiProvider.chat as jest.Mock).mock.calls[0][0][1].content as string;
    const payload = JSON.parse(userMsg);
    expect(payload).toHaveProperty('weakWordCandidates');
    expect(Array.isArray(payload.weakWordCandidates)).toBe(true);
    expect(res.isDefault).toBe(false);
    expect(res.summaryText).toBe('今天你很棒！');
    expect(res.weakWords).toEqual(['apple', 'banana']);
    expect(res.suggestionText).toBe('明天复习一下哦');
    expect(res.mascotExpr).toBe('cheer');
    expect(reportRepo.save).toHaveBeenCalledTimes(1);
    const savedArg = (reportRepo.save as jest.Mock).mock.calls[0][0];
    expect(savedArg.summaryText).toBe('今天你很棒！');
  });

  it('同日已有报告 → 直接返回已有（幂等），不调 AI、不 save', async () => {
    const existing: AiReport = {
      id: 'existing',
      userId: 'u1',
      date: DATE,
      summaryText: '已有小结',
      weakWords: ['cat'],
      suggestionText: '已有建议',
      isDefault: false,
      createdAt: new Date(),
    };
    const { svc, reportRepo, aiProvider } = makeService({
      reportRepo: {
        create: (e: any) => e,
        save: jest.fn(async (e: any) => e),
        findOne: jest.fn(async () => existing),
      },
    });

    const res = await svc.generateDailyReport('u1', DATE);

    expect(res.id).toBe('existing');
    expect(res.summaryText).toBe('已有小结');
    expect(res.isDefault).toBe(false);
    expect(res.stats).toBeNull(); // 快照语义
    expect(aiProvider.chat).not.toHaveBeenCalled();
    expect(reportRepo.save).not.toHaveBeenCalled();
  });

  it('幂等读回：已存默认报告再次请求 → 同一份且 isDefault 保持 true（前端 encourage 态不丢）', async () => {
    const existingDefault: AiReport = {
      id: 'default-existing',
      userId: 'u1',
      date: DATE,
      summaryText: DEFAULT_SUMMARY,
      weakWords: [],
      suggestionText: DEFAULT_SUGGESTION,
      isDefault: true,
      createdAt: new Date(),
    };
    const { svc, reportRepo, aiProvider } = makeService({
      reportRepo: {
        create: (e: any) => e,
        save: jest.fn(async (e: any) => e),
        findOne: jest.fn(async () => existingDefault),
      },
    });

    const res = await svc.generateDailyReport('u1', DATE);

    expect(res.id).toBe('default-existing'); // 同一行，未新建
    expect(res.isDefault).toBe(true); // 读回如实返回默认标志
    expect(aiProvider.chat).not.toHaveBeenCalled();
    expect(reportRepo.save).not.toHaveBeenCalled();
  });

  it('AI 调用失败 → 降级友好默认（isDefault=true）且不持久化，不抛', async () => {
    const { svc, reportRepo, aiProvider } = makeService({
      taskCompletionRepo: { count: jest.fn(async () => 1) }, // 有活动
      aiProvider: {
        name: 'mock',
        chat: jest.fn(async () => {
          throw new Error('provider boom');
        }),
        chatWithImage: jest.fn(),
        transcribe: jest.fn(),
        assessPronunciation: jest.fn(),
        synthesize: jest.fn(),
      },
      reportRepo: {
        create: (e: any) => e,
        save: jest.fn(async (e: any) => e),
        findOne: jest.fn(async () => null),
      },
    });

    const res = await svc.generateDailyReport('u1', DATE);

    expect(res.isDefault).toBe(true);
    expect(aiProvider.chat).toHaveBeenCalledTimes(1);
    expect(reportRepo.save).not.toHaveBeenCalled(); // 降级不缓存
  });

  it('落库唯一约束 race → 回查已有返回（不 500）', async () => {
    const existing: AiReport = {
      id: 'race-existing',
      userId: 'u1',
      date: DATE,
      summaryText: 'race',
      weakWords: [],
      suggestionText: '',
      isDefault: false,
      createdAt: new Date(),
    };
    const { svc, reportRepo } = makeService({
      taskCompletionRepo: { count: jest.fn(async () => 1) },
      aiProvider: {
        name: 'mock',
        chat: jest.fn(async () => ({
          text: JSON.stringify({ summaryText: 'x', weakWords: [], suggestionText: 'y', mascotExpr: 'happy' }),
        })),
        chatWithImage: jest.fn(),
        transcribe: jest.fn(),
        assessPronunciation: jest.fn(),
        synthesize: jest.fn(),
      },
      reportRepo: {
        create: (e: any) => e,
        save: jest.fn(async () => {
          throw new QueryFailedError('INSERT', [], new Error('SQLITE_CONSTRAINT_UNIQUE: unique'));
        }),
        findOne: jest.fn(async () => existing),
      },
    });

    const res = await svc.generateDailyReport('u1', DATE);
    expect(res.id).toBe('race-existing');
    expect(res.isDefault).toBe(false);
  });
});

describe('parseReportAgentOutput (AI-502 鲁棒解析)', () => {
  it('纯 JSON → 解析成功', () => {
    const out = parseReportAgentOutput(
      JSON.stringify({ summaryText: 's', weakWords: ['a'], suggestionText: 't', mascotExpr: 'happy' }),
    );
    expect(out).toEqual({ summaryText: 's', weakWords: ['a'], suggestionText: 't', mascotExpr: 'happy' });
  });

  it('带 ```json 围栏 → 仍解析成功', () => {
    const out = parseReportAgentOutput('```json\n{"summaryText":"s","weakWords":[],"suggestionText":"t","mascotExpr":"cheer"}\n```');
    expect(out.summaryText).toBe('s');
    expect(out.mascotExpr).toBe('cheer');
  });

  it('前后夹带说明文字 → 截取首个 JSON 对象', () => {
    const out = parseReportAgentOutput(
      '好的，这是报告：{"summaryText":"s","weakWords":["x"],"suggestionText":"t","mascotExpr":"encourage"} 完毕',
    );
    expect(out.weakWords).toEqual(['x']);
  });

  it('缺字段 → 安全默认（summaryText/suggestionText 空串、weakWords []、mascotExpr encourage）', () => {
    const out = parseReportAgentOutput('{"summaryText":"只有这个"}');
    expect(out.summaryText).toBe('只有这个');
    expect(out.weakWords).toEqual([]);
    expect(out.suggestionText).toBe('');
    expect(out.mascotExpr).toBe('encourage');
  });

  it('weakWords 非数组 → 兜底 []', () => {
    const out = parseReportAgentOutput('{"summaryText":"s","weakWords":"apple","suggestionText":"t","mascotExpr":"thinking"}');
    expect(out.weakWords).toEqual([]);
  });

  it('非法 mascotExpr → 兜底 encourage', () => {
    const out = parseReportAgentOutput('{"summaryText":"s","weakWords":[],"suggestionText":"t","mascotExpr":"angry"}');
    expect(out.mascotExpr).toBe('encourage');
  });

  it('完全无法解析 → 抛错（由 service 降级）', () => {
    expect(() => parseReportAgentOutput('no json here')).toThrow();
    expect(() => parseReportAgentOutput('')).toThrow();
  });
});
