/**
 * AI-704 E2E 种子：为指定用户写入「昨日」补学数据。
 *
 * 为何需要独立脚本：`recordWordAttempt` 永远写 `lastPracticedAt=now`，而补学队列
 * 的核心是「昨日」数据（lastPracticedAt 落于昨日 UTC 整天），API 无法伪造该时间戳，
 * 故此处直连同一 SQLite 文件写入。脚本先用相同凭据登录拿到 userId（与浏览器登录的
 * 是同一用户），再插入：
 *   1) 一条昨日弱词 word_progress（mastery=0 < 阈值，lastPracticedAt=昨日）
 *   2) 一条昨日未完成计划日 study_plan_days（date=昨日，isDone=false，归属该用户计划）
 *
 * 运行（与服务器同 DB 文件，env 继承 SQLITE_PATH）：
 *   node server/node_modules/ts-node/dist/bin.js server/src/scripts/seed-makeup.ts <user> <pass>
 * 末尾打印一行 JSON：{ ok, userId, wordId, wordText, planDayId }
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';
import { Word } from '../entities/word.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { StudyPlan } from '../plan/study-plan.entity';
import { StudyPlanDay } from '../plan/study-plan-day.entity';

const API_BASE =
  process.env.E2E_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000/api';

async function login(
  username: string,
  password: string,
): Promise<{ userId: string; token: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`login failed (${res.status}) for user ${username}`);
  }
  const body = (await res.json()) as { user: { id: string }; accessToken: string };
  return { userId: body.user.id, token: body.accessToken };
}

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  if (!username || !password) {
    throw new Error('Usage: seed-makeup.ts <username> <password>');
  }

  const { userId } = await login(username, password);

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  try {
    const wordRepo = ds.getRepository(Word);
    const wpRepo = ds.getRepository(WordProgress);
    const planRepo = ds.getRepository(StudyPlan);
    const dayRepo = ds.getRepository(StudyPlanDay);

    const words = await wordRepo.find({ order: { sortOrder: 'ASC' }, take: 20 });
    const word =
      words.find((w) => w.text.toLowerCase() === 'cat') ?? words[0];
    if (!word) {
      throw new Error('No words in catalog; run the server seed first');
    }

    // 确定性「昨日」锚点：UTC 昨天中午。无论 E2E 何时运行都稳落于
    // backend 的 [yStart, yEnd) 昨日窗口内（避免 now-24h 在 UTC 午夜边界漂移）。
    const now = new Date();
    const yesterday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1,
        12,
        0,
        0,
      ),
    );

    // 1) 昨日弱词：0 正确率 → mastery 0（< 阈值 60），lastPracticedAt=昨日。
    const existing = await wpRepo.findOne({ where: { userId, wordId: word.id } });
    const wp = existing ?? wpRepo.create({ userId, wordId: word.id });
    wp.attempts = (existing?.attempts ?? 0) + 1;
    wp.correctCount = existing?.correctCount ?? 0;
    wp.mastery = 0;
    wp.difficulty = 'easy';
    wp.intervalDays = 0;
    wp.easeFactor = 2.5;
    wp.reviewCount = 0;
    wp.dueDate = null;
    wp.lastPracticedAt = yesterday;
    await wpRepo.save(wp);

    // 2) 昨日未完成计划日（归属该用户计划；无则建一份 applied 计划）。
    let plan = await planRepo.findOne({ where: { userId } });
    if (!plan) {
      plan = planRepo.create({ userId, skillType: 'vocab', status: 'applied' });
      plan = await planRepo.save(plan);
    }
    const day = dayRepo.create({
      planId: plan.id,
      dayIndex: 0,
      date: yesterday.toISOString().split('T')[0],
      skillType: 'vocab',
      title: '补学：昨日的听力练习',
      content: '',
      isDone: false,
    });
    await dayRepo.save(day);

    // 末尾单行 JSON，供 E2E 直接解析（忽略上方可能的连接日志）。
    console.log(
      JSON.stringify({
        ok: true,
        userId,
        wordId: word.id,
        wordText: word.text,
        planDayId: day.id,
      }),
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('seed-makeup failed:', err);
  process.exit(1);
});
