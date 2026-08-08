import { parseScanOutput, extractJson, buildScanPrompt } from './scan-agent';

describe('scan-agent', () => {
  describe('extractJson', () => {
    it('提取裸 JSON 数组', () => {
      expect(extractJson('[{"word":"apple","meaning":"苹果"}]')).toBe(
        '[{"word":"apple","meaning":"苹果"}]',
      );
    });

    it('剥离 ```json 围栏', () => {
      const text = '这是结果：\n```json\n[{"word":"cat","meaning":"猫"}]\n```\n谢谢';
      expect(extractJson(text)).toBe('[{"word":"cat","meaning":"猫"}]');
    });

    it('从夹杂说明文字中提取对象', () => {
      const text = '好的，这是卡片：{"word":"dog","meaning":"狗"} 希望帮到你';
      expect(extractJson(text)).toBe('{"word":"dog","meaning":"狗"}');
    });

    it('无 JSON 结构返回 null', () => {
      expect(extractJson('抱歉，没有认出单词')).toBeNull();
      expect(extractJson('')).toBeNull();
    });
  });

  describe('parseScanOutput', () => {
    it('解析标准 JSON 数组', () => {
      const text = JSON.stringify([
        { word: 'apple', meaning: '苹果', example: 'I eat an apple.', imagePrompt: 'a red apple' },
        { word: 'cat', meaning: '猫', example: 'The cat is cute.' },
      ]);
      const cards = parseScanOutput(text);
      expect(cards).toHaveLength(2);
      expect(cards[0]).toMatchObject({ wordText: 'apple', meaning: '苹果' });
      expect(cards[0].example).toBe('I eat an apple.');
      expect(cards[1].imagePrompt).toBeNull();
    });

    it('围栏包裹 + 单对象也能解析', () => {
      const text = '```json\n{"word":"sun","meaning":"太阳"}\n```';
      const cards = parseScanOutput(text);
      expect(cards).toHaveLength(1);
      expect(cards[0].wordText).toBe('sun');
    });

    it('过滤缺 meaning 的无效卡', () => {
      const text = JSON.stringify([
        { word: 'apple', meaning: '苹果' },
        { word: 'broken', example: 'no meaning' },
        { meaning: '狗' },
      ]);
      const cards = parseScanOutput(text);
      expect(cards).toHaveLength(1);
      expect(cards[0].wordText).toBe('apple');
    });

    it('容忍 translation 别名作为中文释义', () => {
      const text = JSON.stringify([{ word: 'book', translation: '书' }]);
      const cards = parseScanOutput(text);
      expect(cards).toHaveLength(1);
      expect(cards[0].meaning).toBe('书');
    });

    it('非 JSON 文本返回空数组（不抛）', () => {
      expect(parseScanOutput('图片太模糊，认不出来')).toEqual([]);
    });

    it('空数组返回空', () => {
      expect(parseScanOutput('[]')).toEqual([]);
    });
  });

  describe('buildScanPrompt', () => {
    it('始终含识别/单词关键词（驱动 Mock OCR 夹具）', () => {
      const p = buildScanPrompt();
      expect(p).toContain('识别');
      expect(p).toContain('单词');
    });

    it('拼接用户提示', () => {
      const p = buildScanPrompt('水果');
      expect(p).toContain('水果');
    });
  });
});
