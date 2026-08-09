import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { MascotStoryService } from './mascot-story.service';
import type { MascotStoryResponse } from './mascot-story.service';
import type { MascotLevelInfo } from './mascot-level.util';

/**
 * 吉祥物成长剧情控制器（AI-603）。
 *
 * 路由（全局前缀 `api`）：
 *  - `GET /api/ai/mascot/level?userId=`   当前等级与进度（驱动前端等级环）
 *  - `GET /api/ai/mascot/story/:level?userId=`  获取/生成该等级成长剧情（幂等）
 *
 * 鉴权：与 AI 模块约定一致（无 `JwtAuthGuard`，`userId` 由 query 传入），
 * 已知限制（继承自 AI 模块）：userId 客户端传入、未做租户隔离，待全局鉴权落地后统一收紧。
 */
@Controller('ai/mascot')
export class MascotStoryController {
  constructor(private readonly storyService: MascotStoryService) {}

  @Get('level')
  async level(@Query('userId') userId: string): Promise<MascotLevelInfo> {
    return this.storyService.getLevelInfo(userId);
  }

  @Get('story/:level')
  async story(
    @Query('userId') userId: string,
    @Param('level', ParseIntPipe) level: number,
  ): Promise<MascotStoryResponse> {
    return this.storyService.getOrGenerateStory(userId, level);
  }
}
