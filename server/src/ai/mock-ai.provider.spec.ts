import { MockAiProvider } from './mock-ai.provider';

describe('MockAiProvider', () => {
  const p = new MockAiProvider();

  it('exposes name "mock"', () => {
    expect(p.name).toBe('mock');
  });

  it('chat returns deterministic text echoing last user message', async () => {
    const r = await p.chat([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
    ]);
    expect(r.text).toContain('[Mock]');
    expect(r.text).toContain('hello');
    expect(r.model).toBe('mock-model');
  });

  it('chat handles empty messages without crashing', async () => {
    const r = await p.chat([]);
    expect(r.text).toContain('[Mock]');
    expect(r.model).toBe('mock-model');
  });

  it('chatWithImage returns text with mime type and prompt', async () => {
    const r = await p.chatWithImage('identify', { data: 'AAAA', mimeType: 'image/png' });
    expect(r.text).toContain('image/png');
    expect(r.text).toContain('identify');
  });

  it('transcribe returns a deterministic transcript', async () => {
    const r = await p.transcribe({ data: Buffer.from('x'), mimeType: 'audio/webm' });
    expect(r.text).toContain('[Mock]');
    expect(r.confidence).toBe(1);
  });

  it('assessPronunciation returns a perfect score', async () => {
    const r = await p.assessPronunciation(
      { data: Buffer.from('x'), mimeType: 'audio/webm' },
      'cat',
    );
    expect(r.score).toBe(100);
    expect(r.readableText).toBe('cat');
    expect(r.mascotExpr).toBe('cheer');
  });

  it('synthesize returns a silent audio placeholder', async () => {
    const r = await p.synthesize('hi');
    expect(r.mimeType).toBe('audio/mp3');
    expect(r.audioBase64).toBe('');
  });
});
