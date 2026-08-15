import { stripMetaMarkers } from './chat-text.util';

describe('chat-text.util', () => {
  describe('stripMetaMarkers', () => {
    it('去掉半角括号中的 (这次没有语音)', () => {
      expect(stripMetaMarkers('Hello! (这次没有语音)')).toBe('Hello!');
    });

    it('去掉全角括号中的 （这次没有语音）', () => {
      expect(stripMetaMarkers('Can you say hello? （这次没有语音）')).toBe(
        'Can you say hello?',
      );
    });

    it('去掉全角括号中的 （暂无语音）', () => {
      expect(stripMetaMarkers('Hi! （暂无语音）')).toBe('Hi!');
    });

    it('保留中文翻译，只去掉元注释', () => {
      const text =
        'Can you say hello to me? （你能跟我说你好吗？）(这次没有语音)';
      expect(stripMetaMarkers(text)).toBe(
        'Can you say hello to me? （你能跟我说你好吗？）',
      );
    });

    it('没有标记时原样返回', () => {
      expect(stripMetaMarkers('Hello! How are you?')).toBe(
        'Hello! How are you?',
      );
    });
  });
});
