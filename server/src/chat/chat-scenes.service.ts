import { Injectable } from '@nestjs/common';
import {
  getScenePackage,
  listSceneSummaries,
  sceneExists,
  ScenePackage,
  SceneSummary,
} from './chat-scenes';

/**
 * 场景包服务（AI-405）。
 *
 * 作为 Nest 注入 seam，把纯数据注册表 `chat-scenes.ts` 暴露给
 * `ChatController`，便于控制器单测通过 mock 注入。
 * 场景包为静态配置（编译期常量），本服务无 DB / 无状态、幂等。
 *
 * 提供：
 * - `list()`：枚举全部场景摘要（供前端 `/chat` 场景卡 + 起始语 + 词库）；
 * - `get(id)`：取完整场景包（含 systemPrompt），未知返回 undefined；
 * - `exists(id)`：已知场景判定（前端选择 / 后端落库前校验可用）。
 */
@Injectable()
export class ChatScenesService {
  /** 枚举全部场景摘要（不含内部 systemPrompt）。顺序即展示顺序。 */
  list(): SceneSummary[] {
    return listSceneSummaries();
  }

  /** 按 id 取完整场景包（含 systemPrompt）；未知 / 空 id 返回 undefined。 */
  get(id: string | null | undefined): ScenePackage | undefined {
    return getScenePackage(id);
  }

  /** sceneId 是否为已知场景。 */
  exists(id: string | null | undefined): boolean {
    return sceneExists(id);
  }
}
