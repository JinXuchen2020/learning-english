/**
 * TypeORM 的 `@Column()` 在运行时依赖 reflect-metadata 推断 Date 字段类型。
 * 不同驱动支持的类型名不同：
 *   - better-sqlite3 接受 `datetime`
 *   - postgres 不支持 `datetime`，需要 `timestamp`（或 `timestamptz`）
 *
 * 该辅助函数让实体装饰器显式传入驱动对应类型，避免循环依赖
 * （database.config.ts 已经引用实体，实体不能再反向引用它）。
 */
export function dateColumnType(): 'datetime' | 'timestamp' {
  const raw = (process.env.DB_TYPE || '').toLowerCase();
  return raw === 'postgres' || raw === 'postgresql' ? 'timestamp' : 'datetime';
}
