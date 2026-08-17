import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 生产库 `provider_configs` 表 schema 对齐迁移（AI-714 后续修复）。
 *
 * 背景：
 * - 旧配置在生产(Postgres/Vercel)用 `synchronize:true` 自动建表，旧实体带
 *   `modelsJson` 列、无 `model` 列。
 * - 2026-08-16 起生产切到 `migrationsRun` + `InitSchema`（仅跑一次、按名去重）。
 *   `InitSchema` 的 `createTable(skipIfExists=true)` 对**已存在**的表是 no-op，
 *   不会补列。
 * - AI-714（2026-08-17）把实体 `modelsJson` 换成 `model`，但旧 `InitSchema` 已跑过、
 *   新列未同步 → 启动期 `resolveSystemChain` 查询 `model` 抛
 *   `QueryFailedError: column ProviderConfig.model does not exist`，AI 服务链初始化失败。
 *
 * 本迁移幂等地对齐 `provider_configs` 到当前实体：补 `model`（AI-714 新增）、
 * 删遗留 `modelsJson`；并对 `systemFallbackRank` / `extraJson`（更早提交新增、
 * 旧 synchronize 期应已存在，这里 IF NOT EXISTS 兜底防二次返工）做补列。
 * 仅生产(Postgres)会执行；dev(sqlite) 走 synchronize，不跑迁移。
 *
 * 临时应急替代方案（不推荐长期使用）：在 Vercel 设 `DB_SYNCHRONIZE=true`
 * 让 TypeORM 一次性 diff 补齐，但会引入生产环境 schema 漂移风险，故优先用本迁移。
 */
export class ProviderConfigReconcile20260817000000 implements MigrationInterface {
  name = 'ProviderConfigReconcile20260817000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // AI-714 新增：模型名（varchar 120, nullable，兼容历史 null 行）。
    await queryRunner.query(
      `ALTER TABLE "provider_configs" ADD COLUMN IF NOT EXISTS "model" varchar(120)`,
    );
    // AI-714 取代的遗留列：删除（若不存在则 no-op）。
    await queryRunner.query(
      `ALTER TABLE "provider_configs" DROP COLUMN IF EXISTS "modelsJson"`,
    );
    // 更早提交新增、旧 synchronize 期应已存在；IF NOT EXISTS 兜底，存在则跳过。
    await queryRunner.query(
      `ALTER TABLE "provider_configs" ADD COLUMN IF NOT EXISTS "systemFallbackRank" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "provider_configs" ADD COLUMN IF NOT EXISTS "extraJson" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚 AI-714：撤 model、恢复 modelsJson（text, nullable）。
    await queryRunner.query(
      `ALTER TABLE "provider_configs" DROP COLUMN IF EXISTS "model"`,
    );
    await queryRunner.query(
      `ALTER TABLE "provider_configs" ADD COLUMN IF NOT EXISTS "modelsJson" text`,
    );
  }
}
