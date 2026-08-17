import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
} from 'typeorm';

/**
 * 全表 schema 对账迁移（根治「旧 synchronize 建表 → InitSchema 对已存在表 no-op → 实体新增列缺失」）。
 *
 * 背景：
 * - 生产 Postgres 最初由旧 `synchronize:true` 建表；08-16 切到 `InitSchema` 迁移后，
 *   `createTable(..., ifNotExist=true)` 对**已存在**的表是 no-op，实体之后新增的列不会补上。
 * - 已因此两次线上故障：`provider_configs.model` 缺列（启动期 resolveSystemChain 抛错）、
 *   `ai_call_logs.errorStack` 缺列（审计落库失败）。
 *
 * 本迁移做法（幂等、可重复跑、对线上数据表安全）：
 * 1. 遍历所有实体元数据，用 `Table.create(metadata, driver)` 拿到实体期望的完整列集合。
 * 2. 对每个线上已存在的表，逐列比对：实体有而实际表没有的列 → `addColumn` 补齐。
 * 3. 对「NOT NULL 且无默认」的列注入类型默认值，保证 `ALTER TABLE ADD COLUMN ... NOT NULL`
 *    在已有数据表上不会因「列含 null 值」而失败（Postgres 单语句带 DEFAULT 不重写历史行）。
 * 4. 只对「缺列」做 ADD，不做 DROP / ALTER TYPE，避免误伤线上数据；遗留列（如已删的
 *    `modelsJson`）由专用迁移 `ProviderConfigReconcile` 处理。
 *
 * 仅 production(Postgres) 由 migrationsRun 自动跑；本地 sqlite(dev) 走 synchronize，不执行本迁移。
 */
export class ReconcileSchema20260817090000 implements MigrationInterface {
  name = 'ReconcileSchema20260817090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const connection = queryRunner.connection;
    const metadatas = connection.entityMetadatas.filter(
      (m) => m.tableType !== 'view',
    );

    for (const metadata of metadatas) {
      const full = Table.create(metadata, connection.driver);
      const existing = await queryRunner.getTable(full.name);
      // 表完全不存在时交给 InitSchema 建全表；本迁移只补「表在但列缺」的情况。
      if (!existing) continue;

      for (const col of full.columns) {
        if (existing.columns.find((c) => c.name === col.name)) continue;
        await queryRunner.addColumn(full.name, this.safeColumn(col));
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const connection = queryRunner.connection;
    const metadatas = connection.entityMetadatas.filter(
      (m) => m.tableType !== 'view',
    );

    for (const metadata of metadatas) {
      const full = Table.create(metadata, connection.driver);
      const existing = await queryRunner.getTable(full.name);
      if (!existing) continue;

      for (const col of full.columns) {
        if (existing.columns.find((c) => c.name === col.name)) {
          await queryRunner.dropColumn(full.name, col.name);
        }
      }
    }
  }

  /**
   * 对「NOT NULL 且无默认」的列注入类型默认值，避免 ALTER 在已有数据表上失败。
   * 其余列原样返回。
   */
  private safeColumn(col: TableColumn): TableColumn {
    const hasDefault =
      col.default !== undefined && col.default !== null && col.default !== '';
    if (!col.isNullable && !hasDefault) {
      const cloned = new TableColumn({
        name: col.name,
        type: col.type as string,
        isNullable: false,
        default: defaultValueFor(col.type as string),
      });
      // 拷贝其余可能用到的属性
      cloned.length = col.length;
      cloned.precision = col.precision;
      cloned.scale = col.scale;
      cloned.comment = col.comment;
      return cloned;
    }
    return col;
  }
}

function defaultValueFor(type: string): string {
  switch (type) {
    case 'int':
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
    case 'decimal':
      return '0';
    case 'boolean':
      return 'false';
    case 'timestamp':
    case 'timestamptz':
    case 'datetime':
    case 'date':
      return 'now()';
    case 'varchar':
    case 'character varying':
    case 'text':
    case 'uuid':
    default:
      return "''";
  }
}
