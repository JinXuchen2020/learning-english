import { MockAiProvider } from './mock-ai-provider';

/**
 * MockAiProvider 安全桩单测：5 种能力均返回确定性安全结果，**绝不抛错**。
 */
describe('MockAiProvider (AI-重构：安全桩)', () => {
  const p = new MockAiProvider();

  it('name 为 Mock AI', () => {
    expect(p.name).toBe('Mock AI');
  });

  it('chat 返回固定友好文案', async () => {
    const r = await p.chat([{ role: 'user', content: 'hi' }]);
    expect(r.text).toBe('AI 助手暂时不可用，请稍后再试。');
    expect(r.model).toBe('Mock AI');
  });

  it('chatWithImage 返回固定文案', async () => {
    const r = await p.chatWithImage('p', { data: 'd', mimeType: 'image/png' });
    expect(r.text).toBe('暂时无法识别图片内容。');
  });

  it('transcribe 返回空文本（下游识别为降级，不静默失败）', async () => {
    const r = await p.transcribe({ data: Buffer.from('x'), mimeType: 'audio/webm' });
    expect(r.text).toBe('');
    expect(r.confidence).toBe(0);
  });

  it('assessPronunciation 返回 0 分 + 说明文案', async () => {
    const r = await p.assessPronunciation(
      { data: Buffer.from('x'), mimeType: 'audio/webm' },
      'cat',
    );
    expect(r.score).toBe(0);
    expect(r.readableText).toBe('cat');
    expect(r.feedback).toContain('暂未配置');
    expect(r.mascotExpr).toBe('encourage');
  });

  it('synthesize 返回空音频（前端 Web Speech 兜底）', async () => {
    const r = await p.synthesize('hi');
    expect(r.audioBase64).toBe('');
    expect(r.mimeType).toBe('audio/mpeg');
  });
});
