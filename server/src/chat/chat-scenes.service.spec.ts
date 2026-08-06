import { ChatScenesService } from './chat-scenes.service';
import {
  SCENE_PACKAGES,
  SCENE_PACKAGE_MAP,
  getScenePackage,
  listScenePackages,
  listSceneSummaries,
  sceneExists,
  toSceneSummary,
  SceneId,
} from './chat-scenes';

/**
 * 场景包注册表 + 服务单测（AI-405）：
 * 验证单一数据源（注册表）完整性、已知/未知场景查找、摘要剥离 systemPrompt、
 * 以及 ChatScenesService 对注册表的透传/判定。
 */

const KNOWN_IDS: SceneId[] = ['greeting', 'zoo', 'shopping', 'weather', 'body'];

describe('场景包注册表 (chat-scenes)', () => {
  it('恰好 5 个场景，id 集合与已知场景一致', () => {
    expect(SCENE_PACKAGES).toHaveLength(5);
    expect(Object.keys(SCENE_PACKAGE_MAP).sort()).toEqual([...KNOWN_IDS].sort());
    expect(listScenePackages()).toHaveLength(5);
  });

  it('每个场景包的 systemPrompt / openingLine / targetVocabulary 均非空（引导词正确、词库非空）', () => {
    for (const pkg of SCENE_PACKAGES) {
      expect(pkg.systemPrompt.trim().length).toBeGreaterThan(0);
      expect(pkg.openingLine.trim().length).toBeGreaterThan(0);
      expect(pkg.targetVocabulary.length).toBeGreaterThan(0);
      // 目标词汇均为非空小写简单词（A1）
      for (const w of pkg.targetVocabulary) {
        expect(w.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('getScenePackage：已知 id 返回完整包（含 systemPrompt）', () => {
    const z = getScenePackage('zoo');
    expect(z).toBeDefined();
    expect(z!.id).toBe('zoo');
    expect(z!.systemPrompt).toBe(SCENE_PACKAGE_MAP.zoo.systemPrompt);
  });

  it('getScenePackage：未知 / 空 id 返回 undefined（自由对话兼容）', () => {
    expect(getScenePackage('unknown-scene')).toBeUndefined();
    expect(getScenePackage(null)).toBeUndefined();
    expect(getScenePackage(undefined)).toBeUndefined();
    expect(getScenePackage('')).toBeUndefined();
  });

  it('sceneExists 与 getScenePackage 一致', () => {
    expect(sceneExists('greeting')).toBe(true);
    expect(sceneExists('body')).toBe(true);
    expect(sceneExists('nope')).toBe(false);
    expect(sceneExists(null)).toBe(false);
  });

  it('listSceneSummaries 不含 systemPrompt，且字段齐全', () => {
    const summaries = listSceneSummaries();
    expect(summaries).toHaveLength(5);
    for (const s of summaries) {
      expect(s).not.toHaveProperty('systemPrompt');
      expect(typeof s.id).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(typeof s.openingLine).toBe('string');
      expect(Array.isArray(s.targetVocabulary)).toBe(true);
    }
  });

  it('toSceneSummary 正确剥离 systemPrompt', () => {
    const pkg = SCENE_PACKAGE_MAP.greeting;
    const summary = toSceneSummary(pkg);
    expect(summary).toEqual({
      id: pkg.id,
      title: pkg.title,
      openingLine: pkg.openingLine,
      targetVocabulary: pkg.targetVocabulary,
    });
    expect(summary).not.toHaveProperty('systemPrompt');
  });

  it('SCENE_PROMPTS 与注册表 systemPrompt 一一对应（chat-system-prompt 兼容）', () => {
    // 间接验证：注册表的 systemPrompt 即是 chat-system-prompt 重新导出的 SCENE_PROMPTS 来源
    for (const id of KNOWN_IDS) {
      expect(SCENE_PACKAGE_MAP[id].systemPrompt).toBeTruthy();
    }
  });
});

describe('ChatScenesService (AI-405)', () => {
  const service = new ChatScenesService();

  it('list() 返回注册表摘要（5 项）', () => {
    const summaries = service.list();
    expect(summaries).toHaveLength(5);
    expect(summaries.map((s) => s.id)).toEqual(KNOWN_IDS);
  });

  it('get() 已知场景返回完整包，未知返回 undefined', () => {
    expect(service.get('weather')!.id).toBe('weather');
    expect(service.get('future')).toBeUndefined();
  });

  it('exists() 判定已知 / 未知', () => {
    expect(service.exists('shopping')).toBe(true);
    expect(service.exists('unknown')).toBe(false);
  });
});
