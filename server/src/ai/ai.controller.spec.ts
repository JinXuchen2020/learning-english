import { HttpException, HttpStatus } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiSpeechEvaluatorService, UploadedAudioFile } from './ai-speech-evaluator.service';
import { SpeechEvaluateError } from './speech-evaluate.validation';
import { EvaluateSpeechDto } from './speech-evaluate.dto';
import { ScoreResult } from './ai-provider.interface';

function makeFile(): UploadedAudioFile {
  return {
    buffer: Buffer.from('x'),
    mimetype: 'audio/webm',
    size: 10,
    originalname: 'r.webm',
  };
}

describe('AiController (POST /api/ai/speech/evaluate)', () => {
  it('正常：调用 evaluator 并返回其 ScoreResult', async () => {
    const score: ScoreResult = {
      score: 88,
      readableText: 'three',
      weakPhonemes: ['θ'],
      feedback: 'good',
      mascotExpr: 'cheer',
    };
    const evaluator = {
      evaluate: jest.fn(async () => score),
    } as unknown as AiSpeechEvaluatorService;
    const ctrl = new AiController(evaluator);

    const dto: EvaluateSpeechDto = { wordId: 'w1' };
    const res = await ctrl.evaluate(makeFile(), dto);

    expect(evaluator.evaluate).toHaveBeenCalledWith({ file: makeFile(), dto });
    expect(res).toBe(score);
  });

  it('SpeechEvaluateError(413) → 翻译为 HttpException(413, {code,message})', async () => {
    const evaluator = {
      evaluate: jest.fn(async () => {
        throw new SpeechEvaluateError(413, 'AUDIO_TOO_LARGE', '太大');
      }),
    } as unknown as AiSpeechEvaluatorService;
    const ctrl = new AiController(evaluator);

    let thrown: HttpException | null = null;
    try {
      await ctrl.evaluate(makeFile(), { wordId: 'w1' });
    } catch (e) {
      thrown = e as HttpException;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown!.getStatus()).toBe(413);
    expect(thrown!.getResponse()).toEqual({ code: 'AUDIO_TOO_LARGE', message: '太大' });
  });

  it('SpeechEvaluateError(404) → HttpException(404)', async () => {
    const evaluator = {
      evaluate: jest.fn(async () => {
        throw new SpeechEvaluateError(404, 'WORD_NOT_FOUND', '单词不存在');
      }),
    } as unknown as AiSpeechEvaluatorService;
    const ctrl = new AiController(evaluator);

    let status = 0;
    try {
      await ctrl.evaluate(makeFile(), { wordId: 'x' });
    } catch (e) {
      status = (e as HttpException).getStatus();
    }
    expect(status).toBe(404);
  });

  it('非 SpeechEvaluateError 异常 → 原样 rethrow（由 Nest 转 500）', async () => {
    const evaluator = {
      evaluate: jest.fn(async () => {
        throw new Error('provider boom');
      }),
    } as unknown as AiSpeechEvaluatorService;
    const ctrl = new AiController(evaluator);

    await expect(ctrl.evaluate(makeFile(), { wordId: 'w1' })).rejects.toThrow('provider boom');
  });

  it('HttpStatus 类型可用作状态码', () => {
    // 确保 HttpStatus 导入有效（避免未使用告警）
    expect(HttpStatus.BAD_REQUEST).toBe(400);
  });
});
