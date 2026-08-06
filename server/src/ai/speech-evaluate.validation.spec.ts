import {
  validateSpeechUpload,
  SpeechEvaluateError,
  ALLOWED_AUDIO_MIME,
  MAX_AUDIO_BYTES,
  MAX_DURATION_MS,
} from './speech-evaluate.validation';

describe('speech-evaluate.validation', () => {
  describe('validateSpeechUpload — 大小', () => {
    it('空文件(size=0) → EMPTY_AUDIO(400)', () => {
      expect(() => validateSpeechUpload({ size: 0, mimeType: 'audio/webm' })).toThrow(
        SpeechEvaluateError,
      );
      try {
        validateSpeechUpload({ size: 0, mimeType: 'audio/webm' });
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(400);
        expect((e as SpeechEvaluateError).code).toBe('EMPTY_AUDIO');
      }
    });

    it('size 为负 → EMPTY_AUDIO(400)', () => {
      try {
        validateSpeechUpload({ size: -1, mimeType: 'audio/webm' });
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(400);
        expect((e as SpeechEvaluateError).code).toBe('EMPTY_AUDIO');
      }
    });

    it(`超过上限(${MAX_AUDIO_BYTES}) → AUDIO_TOO_LARGE(413)`, () => {
      try {
        validateSpeechUpload({ size: MAX_AUDIO_BYTES + 1, mimeType: 'audio/webm' });
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(413);
        expect((e as SpeechEvaluateError).code).toBe('AUDIO_TOO_LARGE');
      }
    });

    it('恰好等于上限 → 通过', () => {
      expect(() =>
        validateSpeechUpload({ size: MAX_AUDIO_BYTES, mimeType: 'audio/webm' }),
      ).not.toThrow();
    });
  });

  describe('validateSpeechUpload — 格式', () => {
    it('白名单内 MIME → 通过', () => {
      for (const mime of ALLOWED_AUDIO_MIME) {
        expect(() =>
          validateSpeechUpload({ size: 1000, mimeType: mime }),
        ).not.toThrow();
      }
    });

    it('不支持的 MIME → UNSUPPORTED_AUDIO_TYPE(415)', () => {
      try {
        validateSpeechUpload({ size: 1000, mimeType: 'audio/flac' });
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(415);
        expect((e as SpeechEvaluateError).code).toBe('UNSUPPORTED_AUDIO_TYPE');
      }
    });

    it('空 MIME → UNSUPPORTED_AUDIO_TYPE(415)', () => {
      try {
        validateSpeechUpload({ size: 1000, mimeType: '' });
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(415);
      }
    });
  });

  describe('validateSpeechUpload — 时长', () => {
    it(`超过上限(${MAX_DURATION_MS}ms) → DURATION_EXCEEDED(400)`, () => {
      try {
        validateSpeechUpload({
          size: 1000,
          mimeType: 'audio/webm',
          durationMs: MAX_DURATION_MS + 1,
        });
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(400);
        expect((e as SpeechEvaluateError).code).toBe('DURATION_EXCEEDED');
      }
    });

    it('等于上限 → 通过', () => {
      expect(() =>
        validateSpeechUpload({
          size: 1000,
          mimeType: 'audio/webm',
          durationMs: MAX_DURATION_MS,
        }),
      ).not.toThrow();
    });

    it('未上报时长(durationMs 缺省) → 通过', () => {
      expect(() =>
        validateSpeechUpload({ size: 1000, mimeType: 'audio/webm' }),
      ).not.toThrow();
    });

    it('durationMs=0 → 通过（不为负判断）', () => {
      expect(() =>
        validateSpeechUpload({ size: 1000, mimeType: 'audio/webm', durationMs: 0 }),
      ).not.toThrow();
    });
  });

  describe('validateSpeechUpload — 自定义 opts 覆盖', () => {
    it('用更小上限覆盖 maxBytes', () => {
      try {
        validateSpeechUpload(
          { size: 2000, mimeType: 'audio/webm' },
          { maxBytes: 1000 },
        );
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(413);
        expect((e as SpeechEvaluateError).code).toBe('AUDIO_TOO_LARGE');
      }
    });

    it('用自定义 allowedMime 覆盖白名单', () => {
      try {
        validateSpeechUpload(
          { size: 1000, mimeType: 'audio/webm' },
          { allowedMime: new Set(['audio/mp4']) },
        );
      } catch (e) {
        expect((e as SpeechEvaluateError).status).toBe(415);
      }
    });
  });

  describe('SpeechEvaluateError 结构', () => {
    it('携带 status 与 code，且是 Error 实例', () => {
      const err = new SpeechEvaluateError(400, 'X', 'msg');
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(require('@nestjs/common').HttpException);
      expect(err.status).toBe(400);
      expect(err.code).toBe('X');
    });
  });
});
