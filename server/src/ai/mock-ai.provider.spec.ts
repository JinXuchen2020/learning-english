import { MockAiProvider } from './mock-ai.provider';

describe('MockAiProvider', () => {
  const p = new MockAiProvider();

  it('exposes name "mock"', () => {
    expect(p.name).toBe('mock');
  });

  describe('chat intent fixtures', () => {
    it('returns a fixed plan text for plan intent', async () => {
      const r = await p.chat([
        { role: 'system', content: 'sys' },
        { role: 'user', content: '帮我生成一个每周学习计划' },
      ]);
      expect(r.text).toContain('[Mock 计划]');
      expect(r.text).toContain('颜色王国');
      expect(r.model).toBe('mock-model');
    });

    it('returns a fixed report text for report intent', async () => {
      const r = await p.chat([{ role: 'user', content: '给我今天的 AI 小结' }]);
      expect(r.text).toContain('[Mock 今日小结]');
      expect(r.text).toContain('th / v');
      expect(r.model).toBe('mock-model');
    });

    it('returns a generic demo reply for unrelated intent', async () => {
      const r = await p.chat([{ role: 'user', content: '你好呀' }]);
      expect(r.text).toContain('[Mock]');
      expect(r.text).not.toContain('[Mock 计划]');
      expect(r.text).not.toContain('[Mock 今日小结]');
    });

    it('detects plan intent case-insensitively (english keyword)', async () => {
      const r = await p.chat([{ role: 'user', content: 'Make me a study PLAN please' }]);
      expect(r.text).toContain('[Mock 计划]');
    });

    it('handles empty messages without crashing (generic reply)', async () => {
      const r = await p.chat([]);
      expect(r.text).toContain('[Mock]');
      expect(r.model).toBe('mock-model');
    });
  });

  it('chatWithImage returns text with mime type and prompt', async () => {
    const r = await p.chatWithImage('identify', { data: 'AAAA', mimeType: 'image/png' });
    expect(r.text).toContain('image/png');
    expect(r.text).toContain('identify');
  });

  it('transcribe returns a readable sample sentence', async () => {
    const r = await p.transcribe({ data: Buffer.from('x'), mimeType: 'audio/webm' });
    expect(r.text).toContain('[Mock]');
    expect(r.text).toContain('red apple');
    expect(r.confidence).toBe(1);
  });

  it('assessPronunciation returns a realistic (non-perfect) score with weak phonemes', async () => {
    const r = await p.assessPronunciation(
      { data: Buffer.from('x'), mimeType: 'audio/webm' },
      'three',
    );
    expect(r.score).toBe(88);
    expect(r.readableText).toBe('three');
    expect(r.weakPhonemes).toEqual(['θ', 'v']);
    expect(r.mascotExpr).toBe('encourage');
  });

  it('synthesize returns a silent audio placeholder', async () => {
    const r = await p.synthesize('hi');
    expect(r.mimeType).toBe('audio/mp3');
    expect(r.audioBase64).toBe('');
  });
});
