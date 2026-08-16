/**
 * text-similarity.util 单元测试（AI-305）
 * 覆盖 levenshteinDistance / similarityRatio / scoreFromSimilarity / selectScoringStrategy /
 * inferMascotExpr / parseLlmAssessment / buildSimilarityFallbackFeedback 全分支。
 */

import {
  buildSimilarityFallbackFeedback,
  inferMascotExpr,
  levenshteinDistance,
  parseLlmAssessment,
  scoreFromSimilarity,
  selectScoringStrategy,
  similarityRatio,
} from './text-similarity.util';

describe('text-similarity.util (AI-305)', () => {
  describe('levenshteinDistance', () => {
    it('相等字符串距离为 0', () => {
      expect(levenshteinDistance('apple', 'apple')).toBe(0);
    });
    it('空串与自身 → 另一串长度', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
      expect(levenshteinDistance('', '')).toBe(0);
    });
    it('单字符替换距离为 1', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1);
    });
    it('插入/删除距离为差异长度', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('flaw', 'lawn')).toBe(2);
    });
  });

  describe('similarityRatio', () => {
    it('完全相同（归一化后）→ 1', () => {
      expect(similarityRatio('Hello, World!', 'hello world')).toBe(1);
    });
    it('一侧为空 → 0（参考非空）', () => {
      expect(similarityRatio('apple', '')).toBe(0);
      expect(similarityRatio('', 'apple')).toBe(0);
    });
    it('两侧皆空 → 1', () => {
      expect(similarityRatio('', '')).toBe(1);
    });
    it('部分差异 → 0~1 之间', () => {
      const r = similarityRatio('i see a red apple', 'i see a red apply');
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
    });
  });

  describe('scoreFromSimilarity', () => {
    it('边界 clamp 到 [0,100]', () => {
      expect(scoreFromSimilarity(-0.5)).toBe(0);
      expect(scoreFromSimilarity(1.5)).toBe(100);
    });
    it('round 取整', () => {
      expect(scoreFromSimilarity(0.885)).toBe(89);
      expect(scoreFromSimilarity(0.884)).toBe(88);
      expect(scoreFromSimilarity(0)).toBe(0);
      expect(scoreFromSimilarity(1)).toBe(100);
    });
  });

  describe('selectScoringStrategy', () => {
    it('azure → phoneme 首选', () => {
      expect(selectScoringStrategy({ providerName: 'azure' })).toBe('phoneme');
    });
    it('bigmodel / nvidia → similarity 兜底', () => {
      expect(selectScoringStrategy({ providerName: 'bigmodel' })).toBe('similarity');
      expect(selectScoringStrategy({ providerName: 'nvidia' })).toBe('similarity');
    });
    it('显式 strategy 覆盖自动推断', () => {
      expect(selectScoringStrategy({ providerName: 'azure', strategy: 'similarity' })).toBe('similarity');
      expect(selectScoringStrategy({ providerName: 'bigmodel', strategy: 'phoneme' })).toBe('phoneme');
      expect(selectScoringStrategy({ strategy: 'phoneme' })).toBe('phoneme');
      expect(selectScoringStrategy({ strategy: 'similarity' })).toBe('similarity');
    });
  });

  describe('inferMascotExpr', () => {
    it('≥85 → happy', () => {
      expect(inferMascotExpr(85)).toBe('happy');
      expect(inferMascotExpr(100)).toBe('happy');
    });
    it('≥60 → encourage', () => {
      expect(inferMascotExpr(60)).toBe('encourage');
      expect(inferMascotExpr(84)).toBe('encourage');
    });
    it('<60 → thinking', () => {
      expect(inferMascotExpr(59)).toBe('thinking');
      expect(inferMascotExpr(0)).toBe('thinking');
    });
  });

  describe('parseLlmAssessment', () => {
    it('解析合法 JSON 提取 feedback/weakPhonemes/mascotExpr', () => {
      const out = parseLlmAssessment(
        '前缀\n{"feedback":"很棒！","weakPhonemes":["θ","v"],"mascotExpr":"encourage"}\n后缀',
      );
      expect(out.feedback).toBe('很棒！');
      expect(out.weakPhonemes).toEqual(['θ', 'v']);
      expect(out.mascotExpr).toBe('encourage');
    });
    it('弱音素过滤非字符串项', () => {
      const out = parseLlmAssessment('{"weakPhonemes":["θ", 5, null, "v"]}');
      expect(out.weakPhonemes).toEqual(['θ', 'v']);
    });
    it('mascotExpr 非枚举值被忽略', () => {
      const out = parseLlmAssessment('{"mascotExpr":"dance","feedback":"x"}');
      expect(out.mascotExpr).toBeUndefined();
      expect(out.feedback).toBe('x');
    });
    it('feedback 字段含未转义英文双引号时仍能提取正文', () => {
      const out = parseLlmAssessment(
        '{"feedback":"别灰心，像小蛇吐信子一样，"think" 和 "three" 都要用到它。[θ]","weakPhonemes":["θ"],"mascotExpr":"encourage"}',
      );
      expect(out.feedback).toContain('think');
      expect(out.feedback).not.toContain('{');
      expect(out.weakPhonemes).toEqual(['θ']);
      expect(out.mascotExpr).toBe('encourage');
    });
    it('非 JSON 文本 → 全文作 feedback', () => {
      const out = parseLlmAssessment('注意 th 和 v 的发音～');
      expect(out.feedback).toBe('注意 th 和 v 的发音～');
      expect(out.weakPhonemes).toEqual([]);
    });
    it('空串 → 空弱音素', () => {
      expect(parseLlmAssessment('')).toEqual({ weakPhonemes: [] });
    });
  });

  describe('buildSimilarityFallbackFeedback', () => {
    it('≥85 → 高度鼓励', () => {
      expect(buildSimilarityFallbackFeedback(90, 'apple', 'apple')).toContain('几乎一模一样');
    });
    it('≥60 → 中等鼓励', () => {
      expect(buildSimilarityFallbackFeedback(70, 'apple', 'apply')).toContain('很接近');
    });
    it('<60 → 引导重试（含转写或没听清）', () => {
      expect(buildSimilarityFallbackFeedback(30, 'apple', 'banana')).toContain('banana');
      expect(buildSimilarityFallbackFeedback(10, 'apple', '')).toContain('没听清');
    });
  });
});
