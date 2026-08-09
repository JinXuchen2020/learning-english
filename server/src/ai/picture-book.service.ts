import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { PictureBook } from './picture-book.entity';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import {
  PICTURE_BOOK_SYSTEM_PROMPT,
  parsePictureBookOutput,
  computeWordCoverage,
  DEFAULT_BOOK_TITLE,
  DEFAULT_BOOK_COVER,
  DEFAULT_BOOK_PAGES,
  PictureBookPage,
  PictureBookAgentOutput,
} from './picture-book-agent';
import { logger } from '../common/logger/logger';

/** `GET /api/ai/picture-book` 响应（AI-604）。 */
export interface PictureBookResponse {
  id?: string;
  courseId: string;
  title: string;
  pages: PictureBookPage[];
  /** true = 模板降级（AI 失败/解析失败）。 */
  isDefault: boolean;
  createdAt?: string;
}

/**
 * AI 绘本服务（AI-604）。
 *
 * 职责：
 * - `getOrGenerateBook`：幂等获取/生成某 (userId, courseId) 绘本——已存在直接返回；
 *   否则取本课单词 → 调 `AiProvider.chat`（PictureBookAgent）生成、解析、落库；
 *   失败降级模板绘本（不 5xx）。
 * - `synthesizeTts`：给定文本返回可播放的 ttsUrl（供前端「朗读」）。
 *
 * 详见 `features/ai-604.md`。
 */
@Injectable()
export class PictureBookService {
  constructor(
    @InjectRepository(PictureBook)
    private bookRepo: Repository<PictureBook>,
    @InjectRepository(Course)
    private courseRepo: Repository<Course>,
    @InjectRepository(Lesson)
    private lessonRepo: Repository<Lesson>,
    @InjectRepository(Word)
    private wordRepo: Repository<Word>,
    @Inject(AI_PROVIDER_TOKEN)
    private aiProvider: AiProvider,
  ) {}

  /** 获取（或按需生成）某课程的绘本，幂等。courseId 可空（示例/默认绘本）。 */
  async getOrGenerateBook(userId: string, courseId?: string): Promise<PictureBookResponse> {
    const cid = courseId && courseId.trim() ? courseId.trim() : '';

    // 1) 幂等：该 (userId, courseId) 已有绘本直接返回（快照语义）。
    const existing = await this.bookRepo.findOne({ where: { userId, courseId: cid } });
    if (existing) {
      return this.toResponse(existing, false);
    }

    // 2) 取本课单词（courseId 为空或课程不存在 → 空单词列表，仍生成不绑课程的绘本）。
    const words = await this.collectCourseWords(cid);

    // 3) 调 PictureBookAgent 生成。
    try {
      const out = await this.callAgent(words);
      const storyText = [out.title, ...out.pages.map((p) => p.text)].join('\n');
      const saved = await this.persist({
        userId,
        courseId: cid,
        title: out.title,
        storyText,
        pages: JSON.stringify(out.pages),
        coverImagePrompt: out.coverImagePrompt,
        isDefault: false,
      });
      return this.toResponse(saved, false);
    } catch (err) {
      // 4) AI 失败 / 解析失败 → 降级模板绘本（不持久化重试缓存，下次可重试真实生成）。
      logger.warn('[AI-604] PictureBookAgent 调用/解析失败，降级模板绘本', err as Error);
      const storyText = [DEFAULT_BOOK_TITLE, ...DEFAULT_BOOK_PAGES.map((p) => p.text)].join('\n');
      const saved = await this.persist({
        userId,
        courseId: cid,
        title: DEFAULT_BOOK_TITLE,
        storyText,
        pages: JSON.stringify(DEFAULT_BOOK_PAGES),
        coverImagePrompt: DEFAULT_BOOK_COVER,
        isDefault: true,
      });
      return this.toResponse(saved, true);
    }
  }

  /**
   * 合成绘本页朗读音频，返回可播放 URL：
   * - `audioUrl` 直接用；
   * - 否则 `audioBase64` 包成 `data:` URL；
   * - 都没有 → `null`（前端优雅降级无声）。
   */
  async synthesizeTts(text: string): Promise<{ ttsUrl: string | null }> {
    const audio = await this.aiProvider.synthesize(text);
    if (audio.audioUrl) return { ttsUrl: audio.audioUrl };
    if (audio.audioBase64) return { ttsUrl: `data:${audio.mimeType};base64,${audio.audioBase64}` };
    return { ttsUrl: null };
  }

  /** 取某课程的全部单词（course → lessons → words 摊平）。 */
  private async collectCourseWords(courseId: string): Promise<{ text: string }[]> {
    if (!courseId) return [];
    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['lessons', 'lessons.words'],
    });
    if (!course) return [];
    const words: { text: string }[] = [];
    for (const lesson of course.lessons ?? []) {
      for (const w of lesson.words ?? []) {
        words.push({ text: w.text });
      }
    }
    return words;
  }

  /** 调用 PictureBookAgent（AI-106 抽象），把课程单词喂给模型并解析结构化输出。 */
  private async callAgent(words: { text: string }[]): Promise<PictureBookAgentOutput> {
    const result = await this.aiProvider.chat(
      [
        { role: 'system', content: PICTURE_BOOK_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            task: '生成绘本故事(picture book)',
            courseWords: words.map((w) => w.text),
            mascotName: '小狐狸',
            childName: '宝贝',
          }),
        },
      ],
      { temperature: 0.85, maxTokens: 1200, timeoutMs: 60000 },
    );
    return parsePictureBookOutput(result.text);
  }

  /**
   * 持久化绘本，捕获唯一约束 race（并发同 (userId, courseId) 落库）。
   * 命中唯一约束 → 回查已有返回，保证不 500。
   */
  private async persist(
    partial: Pick<
      PictureBook,
      'userId' | 'courseId' | 'title' | 'storyText' | 'pages' | 'coverImagePrompt' | 'isDefault'
    >,
  ): Promise<PictureBook> {
    try {
      return await this.bookRepo.save(this.bookRepo.create(partial));
    } catch (err) {
      if (err instanceof QueryFailedError && /UNIQUE/i.test(String(err.message))) {
        const existing = await this.bookRepo.findOne({
          where: { userId: partial.userId, courseId: partial.courseId },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  /** 把实体转换为前端响应，安全解析 pages JSON。 */
  private toResponse(book: PictureBook, isDefaultOverride: boolean): PictureBookResponse {
    let pages: PictureBookPage[] = [];
    try {
      const parsed = JSON.parse(book.pages || '[]');
      if (Array.isArray(parsed)) {
        pages = parsed.map((p: PictureBookPage, i: number) => ({
          pageNumber: typeof p.pageNumber === 'number' ? p.pageNumber : i + 1,
          text: p.text ?? '',
          illustrationPrompt: p.illustrationPrompt ?? '',
        }));
      }
    } catch {
      // pages JSON 损坏 → 退回单页（用 storyText）。
      pages = [{ pageNumber: 1, text: book.storyText, illustrationPrompt: book.coverImagePrompt }];
    }
    if (pages.length === 0 && book.storyText) {
      pages = [{ pageNumber: 1, text: book.storyText, illustrationPrompt: book.coverImagePrompt }];
    }
    return {
      id: book.id,
      courseId: book.courseId,
      title: book.title,
      pages,
      isDefault: book.isDefault ?? isDefaultOverride,
      createdAt: book.createdAt ? book.createdAt.toISOString() : undefined,
    };
  }
}
