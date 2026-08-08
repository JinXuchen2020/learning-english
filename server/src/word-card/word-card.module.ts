import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiWordCard } from './ai-word-card.entity';
import { AiWordCardService } from './ai-word-card.service';
import { AiWordCardController } from './ai-word-card.controller';

/**
 * AI 单词卡片模块（AI-601）。
 * 注册 `AiWordCard` 实体仓库，提供生成/列表/审核能力。
 * `AiProvider` 由 `AiModule`（`@Global()`）注入，无需在此 import。
 *
 * @module word-card/word-card.module
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiWordCard])],
  controllers: [AiWordCardController],
  providers: [AiWordCardService],
  exports: [AiWordCardService],
})
export class WordCardModule {}
