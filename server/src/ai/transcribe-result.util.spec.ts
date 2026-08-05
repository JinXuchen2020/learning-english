/**
 * transcribe-result.util 纯逻辑单测（AI-304）
 * 覆盖 normalizeTranscript / classifyTranscript / summarizeTranscript 全分支。
 */
import {
  DEGRADED_CONFIDENCE_THRESHOLD,
  classifyTranscript,
  normalizeTranscript,
  summarizeTranscript,
} from './transcribe-result.util';
import { TranscriptResult } from './ai-provider.interface';

describe('normalizeTranscript', () => {
  it('转小写并剥离标点', () => {
    expect(normalizeTranscript('Hello, World!')).toBe('hello world');
  });

  it('折叠连续空白并去首尾空白', () => {
    expect(normalizeTranscript('  Multiple   SPACES ')).toBe('multiple spaces');
  });

  it('保留数字', () => {
    expect(normalizeTranscript('I have 3 apples!')).toBe('i have 3 apples');
  });

  it('空串返回空串', () => {
    expect(normalizeTranscript('')).toBe('');
  });

  it('剥离特殊符号（括号/连字符/问号等）', () => {
    expect(normalizeTranscript('What\'s (this)-a_test?')).toBe('what s this a test');
  });
});

describe('classifyTranscript', () => {
  it('空文本 → degraded:empty', () => {
    expect(classifyTranscript({ text: '' })).toEqual({ degraded: true, reason: 'empty' });
  });

  it('纯空白文本 → degraded:empty', () => {
    expect(classifyTranscript({ text: '   ' })).toEqual({ degraded: true, reason: 'empty' });
  });

  it('低置信度 → degraded:low_confidence', () => {
    expect(classifyTranscript({ text: 'thr', confidence: 0.1 })).toEqual({
      degraded: true,
      reason: 'low_confidence',
    });
  });

  it('等于阈值(0.3)不降级', () => {
    expect(classifyTranscript({ text: 'three', confidence: DEGRADED_CONFIDENCE_THRESHOLD })).toEqual({
      degraded: false,
    });
  });

  it('正常置信度 → 不降级', () => {
    expect(classifyTranscript({ text: 'three', confidence: 0.9 })).toEqual({ degraded: false });
  });

  it('缺失 confidence 不误判降级', () => {
    expect(classifyTranscript({ text: 'three' })).toEqual({ degraded: false });
  });

  it('缺失 confidence 且文本为空 → empty', () => {
    expect(classifyTranscript({ text: '' })).toEqual({ degraded: true, reason: 'empty' });
  });
});

describe('summarizeTranscript', () => {
  it('正常转写 → 归一化 + 词数 + 不降级', () => {
    const r: TranscriptResult = { text: 'Hello, World!', confidence: 0.9 };
    expect(summarizeTranscript(r)).toEqual({
      rawText: 'Hello, World!',
      normalizedText: 'hello world',
      wordCount: 2,
      confidence: 0.9,
      degraded: false,
      degradeReason: undefined,
    });
  });

  it('空转写 → 词数 0 + empty 降级', () => {
    const r: TranscriptResult = { text: '', confidence: 0 };
    expect(summarizeTranscript(r)).toEqual({
      rawText: '',
      normalizedText: '',
      wordCount: 0,
      confidence: 0,
      degraded: true,
      degradeReason: 'empty',
    });
  });

  it('低置信度 → low_confidence 降级 + 词数 1', () => {
    const r: TranscriptResult = { text: 'hi', confidence: 0.1 };
    const s = summarizeTranscript(r);
    expect(s.degraded).toBe(true);
    expect(s.degradeReason).toBe('low_confidence');
    expect(s.wordCount).toBe(1);
    expect(s.normalizedText).toBe('hi');
  });

  it('可选字段(words/durationMs)不影响摘要', () => {
    const r: TranscriptResult = {
      text: 'cat',
      confidence: 0.8,
      words: [{ word: 'cat', startMs: 0, endMs: 200 }],
      durationMs: 200,
    };
    const s = summarizeTranscript(r);
    expect(s.degraded).toBe(false);
    expect(s.wordCount).toBe(1);
  });
});
