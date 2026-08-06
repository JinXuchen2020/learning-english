/**
 * 对话场景包注册表（AI-405）。
 *
 * 5 个儿童英文陪练场景，每个场景包含三部分：
 * - `systemPrompt`：注入 LLM 的情境引导（狐狸人设 `FOX_PERSONA` 由
 *   `chat-system-prompt.ts` 的 `buildChatSystemPrompt` 统一前置，本处只承载情境引导）；
 * - `openingLine`：进入场景时狐狸的起始语（前端 `/chat` 页 AI-407 首次气泡）；
 * - `targetVocabulary`：本场景 A1 简单目标词汇（前端词库提示 / 跟读候选）。
 *
 * 纯数据 + 纯函数模块（无 Nest / DB 依赖），便于 node 环境单元测试，
 * 并被 `ChatScenesService`（Nest 注入 seam）与 `chat-system-prompt.ts` 复用，
 * 作为场景数据的**单一数据源**（single source of truth）。
 */

/** 已知场景 id（与 `ai_chat_sessions.sceneId` 取值对齐）。 */
export type SceneId = 'greeting' | 'zoo' | 'shopping' | 'weather' | 'body';

/** 完整场景包（含内部 systemPrompt，不向前端暴露）。 */
export interface ScenePackage {
  id: SceneId;
  /** 中文场景名（前端场景卡标题）。 */
  title: string;
  /** 注入 LLM 的情境引导提示（不含狐狸人设）。 */
  systemPrompt: string;
  /** 进入场景时狐狸的起始语（前端首次气泡）。 */
  openingLine: string;
  /** 本场景目标词汇（A1 简单词）。 */
  targetVocabulary: string[];
}

/** 对外场景摘要（去 systemPrompt，供 `GET /api/ai/chat/scenes` 返回）。 */
export interface SceneSummary {
  id: SceneId;
  title: string;
  openingLine: string;
  targetVocabulary: string[];
}

/** 5 个场景包（数组顺序即前端展示顺序）。兜底内容安全、词汇 A1 级。 */
export const SCENE_PACKAGES: readonly ScenePackage[] = [
  {
    id: 'greeting',
    title: '打招呼',
    systemPrompt: [
      '当前场景：打招呼（greeting）。',
      '引导小朋友练习日常问候：Hello! / Hi! / How are you? / I am fine, thank you. / What is your name? / My name is ...',
      '可以先和小朋友互相介绍，再聊今天的心情。',
    ].join('\n'),
    openingLine: "Hello! I'm Fox Teacher. What is your name?",
    targetVocabulary: [
      'hello', 'hi', 'name', 'how', 'are', 'you', 'fine', 'thank',
      'good', 'bye', 'morning', 'afternoon',
    ],
  },
  {
    id: 'zoo',
    title: '动物园',
    systemPrompt: [
      '当前场景：动物园（zoo）。',
      '和小朋友聊动物：What do you see? / I see a ... / It is a ... / What color is it?',
      '鼓励说出动物名字（cat, dog, bird, rabbit, bear...）和颜色（red, blue, yellow...）。',
    ].join('\n'),
    openingLine: 'Welcome to the zoo! What animal do you see?',
    targetVocabulary: [
      'cat', 'dog', 'bird', 'rabbit', 'bear', 'lion', 'tiger', 'elephant',
      'monkey', 'fish', 'red', 'blue', 'yellow', 'big', 'small',
    ],
  },
  {
    id: 'shopping',
    title: '买东西',
    systemPrompt: [
      '当前场景：买东西（shopping）。',
      '和小朋友演练购物对话：I want ... / How much? / It is ... yuan. / Here you are. / Thank you!',
      '可以卖水果或玩具，练习数字和礼貌用语。',
    ].join('\n'),
    openingLine: "Let's go shopping! What do you want?",
    targetVocabulary: [
      'apple', 'banana', 'orange', 'toy', 'want', 'how', 'much', 'yuan',
      'thank', 'please', 'here', 'red', 'yellow',
    ],
  },
  {
    id: 'weather',
    title: '天气',
    systemPrompt: [
      '当前场景：天气（weather）。',
      '和小朋友聊天气与穿衣：What is the weather like? / It is sunny / rainy / cloudy. / I wear my ...',
      '鼓励用简单形容词描述今天。',
    ].join('\n'),
    openingLine: 'Look outside! What is the weather like today?',
    targetVocabulary: [
      'sun', 'sunny', 'rain', 'rainy', 'cloud', 'cloudy', 'wind', 'windy',
      'hot', 'cold', 'warm', 'coat', 'hat',
    ],
  },
  {
    id: 'body',
    title: '身体部位',
    systemPrompt: [
      '当前场景：身体部位（body）。',
      '和小朋友玩"指一指"游戏：Touch your head / nose / hand / foot. / This is my ...',
      '引导说出身体部位单词并配合动作。',
    ].join('\n'),
    openingLine: "Let's play 'Touch your body'! Touch your nose!",
    targetVocabulary: [
      'head', 'hair', 'eye', 'ear', 'nose', 'mouth', 'face', 'hand',
      'arm', 'leg', 'foot', 'body',
    ],
  },
];

/** id → 场景包 映射（由数组派生，保证单一数据源）。 */
const sceneMap: Record<SceneId, ScenePackage> = {} as Record<SceneId, ScenePackage>;
for (const pkg of SCENE_PACKAGES) {
  sceneMap[pkg.id] = pkg;
}
export const SCENE_PACKAGE_MAP: Readonly<Record<SceneId, ScenePackage>> = sceneMap;

/**
 * 按 id 取完整场景包；未知 / 空 id 返回 undefined（自由对话）。
 * @param id 场景 id（可为 null/undefined/未知字符串）
 */
export function getScenePackage(id: string | null | undefined): ScenePackage | undefined {
  if (!id) return undefined;
  return SCENE_PACKAGE_MAP[id as SceneId];
}

/** 已知场景判定（前端选择 / 后端落库前校验可用）。 */
export function sceneExists(id: string | null | undefined): boolean {
  return getScenePackage(id) !== undefined;
}

/** 完整场景包 → 对外摘要（剥离内部 systemPrompt）。 */
export function toSceneSummary(pkg: ScenePackage): SceneSummary {
  const { id, title, openingLine, targetVocabulary } = pkg;
  return { id, title, openingLine, targetVocabulary };
}

/** 枚举全部场景摘要（供 `GET /api/ai/chat/scenes`）。 */
export function listSceneSummaries(): SceneSummary[] {
  return SCENE_PACKAGES.map(toSceneSummary);
}

/** 枚举全部完整场景包（内部使用，如系统提示组装）。 */
export function listScenePackages(): readonly ScenePackage[] {
  return SCENE_PACKAGES;
}
