import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sentence } from '../entities/sentence.entity';

/** `GET /api/sentences` 的过滤查询（均为可选）。 */
export interface SentenceQuery {
  /** 仅返回该分级（如 `L1`）。 */
  level?: string;
  /** 仅返回 `wordTexts` 含该词汇文本的句（不区分大小写，按包含匹配）。 */
  wordText?: string;
}

/**
 * 句子跟读库服务（AI-309）。
 *
 * 仅做查询（句库为预置静态内容，写由 seed 负责）：全量 / 分级 / 按词汇过滤，
 * 与 `WordsService` 同口径（`findAll` / `findByLesson`）。
 */
@Injectable()
export class SentencesService {
  constructor(
    @InjectRepository(Sentence)
    private readonly sentenceRepo: Repository<Sentence>,
  ) {}

  /**
   * 查询句库。先拉全量（库规模小，几十~上百条），在内存做 `level` 等值过滤 +
   * `wordText` 包含过滤（simple-array 存逗号串，DB 层 LIKE 不可靠，内存过滤确定性强
   * 且零方言差异），最后按 level 升序 + sortOrder 升序排序，保证前端展示顺序稳定
   * （不依赖 DB 的 ORDER BY 行为）。
   */
  async findAll(query: SentenceQuery = {}): Promise<Sentence[]> {
    let rows = await this.sentenceRepo.find();

    if (query.level && query.level.trim().length > 0) {
      const level = query.level.trim();
      rows = rows.filter((s) => s.level === level);
    }

    if (query.wordText && query.wordText.trim().length > 0) {
      const needle = query.wordText.trim().toLowerCase();
      if (needle) {
        rows = rows.filter((s) => s.wordTexts.map((w) => w.toLowerCase()).includes(needle));
      }
    }

    return rows.sort(
      (a, b) => a.level.localeCompare(b.level) || a.sortOrder - b.sortOrder,
    );
  }

  /** 按 id 取单句（评分链路用）；未命中返回 null 由调用方决策。 */
  async findById(id: string): Promise<Sentence | null> {
    return this.sentenceRepo.findOne({ where: { id } });
  }
}
