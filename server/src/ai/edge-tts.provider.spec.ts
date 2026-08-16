import { EdgeTtsProvider } from './edge-tts.provider';
import { execFile, execFileSync } from 'child_process';
import * as fs from 'fs';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
  execFileSync: jest.fn(),
}));

describe('EdgeTtsProvider', () => {
  const execFileSyncMock = execFileSync as unknown as jest.Mock;
  const execFileMock = execFile as unknown as jest.Mock;

  beforeEach(() => {
    // 默认：探测不到 python（execFileSync 抛错）→ python=null
    execFileSyncMock.mockReset();
    execFileSyncMock.mockImplementation(() => {
      throw new Error('no python');
    });
    execFileMock.mockReset();
  });

  it('exposes provider name "edge-tts"', () => {
    const p = new EdgeTtsProvider();
    expect(p.name).toBe('edge-tts');
  });

  it('chat is unsupported (EdgeTts only provides TTS)', async () => {
    const p = new EdgeTtsProvider();
    await expect(p.chat([])).rejects.toThrow(/不受支持/);
  });

  it('chatWithImage is unsupported', async () => {
    const p = new EdgeTtsProvider();
    await expect(
      p.chatWithImage('prompt', { data: 'x', mimeType: 'image/png' }),
    ).rejects.toThrow(/不受支持/);
  });

  it('transcribe is unsupported', async () => {
    const p = new EdgeTtsProvider();
    await expect(p.transcribe({ data: 'x', mimeType: 'audio/wav' })).rejects.toThrow(
      /不受支持/,
    );
  });

  it('assessPronunciation is unsupported', async () => {
    const p = new EdgeTtsProvider();
    await expect(
      p.assessPronunciation({ data: 'x', mimeType: 'audio/wav' }, 'cat'),
    ).rejects.toThrow(/不受支持/);
  });

  it('synthesize throws when python/edge-tts unavailable', async () => {
    const p = new EdgeTtsProvider();
    await expect(p.synthesize('hello')).rejects.toThrow(/python\/edge-tts 不可用/);
  });

  it('synthesize returns base64 mp3 when python available', async () => {
    // 模拟探测到可用 python
    execFileSyncMock.mockImplementation(() => undefined);
    execFileMock.mockImplementation((_py: string, _args: string[], _opts: unknown, cb: (e: Error | null) => void) => cb(null));
    const readSpy = jest
      .spyOn(fs.promises, 'readFile')
      .mockResolvedValue(Buffer.from('FAKEMP3'));
    const unlinkSpy = jest
      .spyOn(fs.promises, 'unlink')
      .mockResolvedValue(undefined);

    const p = new EdgeTtsProvider();
    const res = await p.synthesize('Hello little fox', 'en-US-AriaNeural');

    expect(res.mimeType).toBe('audio/mp3');
    expect(res.audioBase64).toBe(Buffer.from('FAKEMP3').toString('base64'));

    readSpy.mockRestore();
    unlinkSpy.mockRestore();
  });
});
