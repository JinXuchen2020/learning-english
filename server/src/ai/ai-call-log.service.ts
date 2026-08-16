import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCallLog, AiCallLogEntry } from './ai-call-log.entity';
import { logger } from '../common/logger/logger';

/** 失败原因摘要截断长度（对应 `ai_call_logs.errorMessage` 列 TEXT，预留 1 字符给省略号）。 */
const MAX_ERROR_MESSAGE = 255;
/** 失败堆栈截断长度（对应 `errorStack` 列 TEXT，存全文但限制规模）。 */
const MAX_ERROR_STACK = 4000;
/** 请求/响应摘要截断长度（对应 `requestSnippet`/`responseSnippet` 列 TEXT）。 */
const MAX_SNIPPET = 200;

/** 截断为安全长度摘要；null/undefined 透传 null；超长则前 N 字符 + '…'。 */
function truncate(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * AI 调用审计日志服务（AI-108）。
 *
 * 把每次 LLM 调用的元数据落 `ai_call_logs` 表，供成本审计与排查。
 * 设计原则：**best-effort，绝不阻断主流程**——DB 写失败（磁盘满/连接抖动）
 * 只告警吞异常，绝不让审计拖垮用户的 AI 调用。
 *
 * 作为持久化边界，本服务对文本字段做**二次截断兜底**（调用方已截断的情况下
 * 是幂等的），确保直接调用 `record` 也不会写出超长内容。
 */
@Injectable()
export class AiCallLogService {
  constructor(
    @InjectRepository(AiCallLog)
    private readonly repo: Repository<AiCallLog>,
  ) {}

  /** 写入一条审计记录；任何异常（含 DB 失败）都被吞掉并返回 false，不影响主流程。 */
  async record(entry: AiCallLogEntry): Promise<boolean> {
    try {
      const row = this.repo.create({
        userId: entry.userId,
        provider: entry.provider,
        operation: entry.operation,
        moduleTag: entry.moduleTag,
        promptTokens: entry.promptTokens ?? 0,
        completionTokens: entry.completionTokens ?? 0,
        totalTokens: entry.totalTokens ?? 0,
        durationMs: entry.durationMs,
        status: entry.status,
        errorMessage: truncate(entry.errorMessage, MAX_ERROR_MESSAGE),
        errorStack: truncate(entry.errorStack, MAX_ERROR_STACK),
        requestSnippet: truncate(entry.requestSnippet, MAX_SNIPPET),
        responseSnippet: truncate(entry.responseSnippet, MAX_SNIPPET),
      });
      await this.repo.save(row);
      return true;
    } catch (err) {
      // 审计失败绝不应影响主 AI 调用：仅记录告警后继续。
      logger.warn('[AI-LOG] 审计落库失败（已忽略，不影响主流程）', {
        operation: entry.operation,
        error: (err as Error)?.message,
      });
      return false;
    }
  }
}
