import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sentence } from '../entities/sentence.entity';
import { SentencesService } from './sentences.service';
import { SentencesController } from './sentences.controller';

/**
 * 句子跟读库模块（AI-309）。
 *
 * 注册 `Sentence` 实体并提供查询能力；`SentencesService` 导出供 `AiModule`
 * 的 `AiSpeechEvaluatorService` 在 AI-303 的 `sentenceId` 路径里查 `Sentence.text`。
 * 与 `WordsModule`（Word 实体 + WordsService）同口径。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Sentence])],
  controllers: [SentencesController],
  providers: [SentencesService],
  exports: [SentencesService],
})
export class SentencesModule {}
