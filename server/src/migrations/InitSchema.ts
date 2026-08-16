import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * 初始 schema 迁移（基线）。
 *
 * 设计要点（AI-713 后续：生产改用 migration 替代 synchronize）：
 * - 复用 TypeORM 自身的 `Table.create(metadata, driver)`，产出的 DDL 与 `synchronize`
 *   完全一致，且按当前 driver（sqlite/postgres）正确翻译，无需手写列类型。
 * - 两阶段：先建所有表（不含外键，ifNotExist=true，幂等），再补外键。
 *   这样无论实体遍历顺序如何，外键引用的表一定已存在；在**已存在**的库上
 *   所有 `createTable` 均为 no-op，外键按「引用表+引用列」判重（兼容历史
 *   synchronize 生成的约束名差异），绝不重复创建 → 对线上库安全。
 * - 本地 sqlite(dev) 仍走 synchronize，不会执行本迁移；本迁移仅在
 *   production(Postgres) 由 `migrationsRun:true` 启动期自动跑。
 */
export class InitSchema20260816200000 implements MigrationInterface {
  name = 'InitSchema20260816200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const connection = queryRunner.connection;
    const metadatas = connection.entityMetadatas.filter((m) => m.tableType !== 'view');

    // 阶段 1：建表（不含外键），若表已存在则跳过（幂等）。
    for (const metadata of metadatas) {
      const table = Table.create(metadata, connection.driver);
      table.foreignKeys = [];
      await queryRunner.createTable(table, true, false, true);
    }

    // 阶段 2：补外键，按「引用表 + 引用列」判重，避免重复创建（线上库安全）。
    for (const metadata of metadatas) {
      const full = Table.create(metadata, connection.driver);
      if (!full.foreignKeys || full.foreignKeys.length === 0) continue;

      const existing = await queryRunner.getTable(full.name);
      const toAdd = full.foreignKeys.filter((fk) => !fkExists(existing, fk));
      if (toAdd.length > 0) {
        await queryRunner.createForeignKeys(
          new Table({ name: full.name, foreignKeys: toAdd }),
          toAdd,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const connection = queryRunner.connection;
    const metadatas = connection.entityMetadatas.filter((m) => m.tableType !== 'view');
    // 倒序丢弃，先破外键引用。
    for (let i = metadatas.length - 1; i >= 0; i--) {
      const table = Table.create(metadatas[i], connection.driver);
      await queryRunner.dropTable(table, true, true, true);
    }
  }
}

function fkExists(existing: Table | undefined, fk: TableForeignKey): boolean {
  if (!existing) return false;
  const wantCols = [...fk.columnNames].sort().join(',');
  const wantRefCols = [...fk.referencedColumnNames].sort().join(',');
  return existing.foreignKeys.some((e) => {
    const sameCols = [...e.columnNames].sort().join(',') === wantCols;
    const sameRef =
      e.referencedTableName === fk.referencedTableName &&
      [...e.referencedColumnNames].sort().join(',') === wantRefCols;
    return sameCols && sameRef;
  });
}
