import { DataSource } from 'typeorm';
import { Course } from '../entities/course.entity';
import { logger } from '../common/logger/logger';
import { ensureProviderConfigs, seedContent } from '../seed';

/**
 * 自举种子（Vercel / 本地启动期幂等确保）。
 *
 * 用于 serverless（Vercel）等「没有构建期 seed 步骤」的环境：在应用冷启动时
 * 确保数据库具备运行所需的最小数据，而**不依赖** `npm run seed` 在部署时被调用。
 *
 * 设计原则（与一次性 `seed()` 的 clear+重播 不同）：
 * - **provider 配置**：幂等确保（按 name 查重，绝不 clear）。即使多次冷启动也安全，
 *   保证 AI 调用链（`resolveSystemChain`）始终有系统默认 provider，chat 不会因
 *   「未 seed」而落到空 key 兜底。
 * - **内容（课程/单词/句子/任务）**：仅当内容表为空时才播种，**绝不 clear**。
 *   避免每次部署/冷启动覆盖生产数据，也避免与手动 `npm run seed` 的 clear 行为冲突。
 * - 任何失败仅告警、**不阻断启动**（数据库暂不可用时 API 仍应起得来）。
 *
 * 调用方：`vercel-entry.ts` 的 `createNestServer()` 在 `app.init()` 后调用，
 * 且仅在非 test 环境（`NODE_ENV !== 'test' && !JEST_WORKER_ID`）执行。
 */
export async function ensureSeed(ds: DataSource): Promise<void> {
  try {
    // 1) 系统 provider 配置：始终幂等确保（AI 链可用性的关键）。
    await ensureProviderConfigs(ds);

    // 2) 初始内容：仅空表时播种，避免重复/覆盖。
    const courseRepo = ds.getRepository(Course);
    const courseCount = await courseRepo.count();
    if (courseCount === 0) {
      logger.info('[BootstrapSeed] 内容表为空，播种初始课程/单词/句子/任务...');
      await seedContent(ds);
      logger.info('[BootstrapSeed] 初始内容播种完成');
    } else {
      logger.info('[BootstrapSeed] 内容已存在（courses=%d），跳过内容播种', courseCount);
    }
  } catch (err) {
    logger.error('[BootstrapSeed] 自举种子失败（不影响 API 启动）:', err);
  }
}
