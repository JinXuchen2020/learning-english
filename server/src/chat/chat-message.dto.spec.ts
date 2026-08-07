import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatMessageDto } from './chat-message.dto';
import { ValidationPipe, BadRequestException } from '@nestjs/common';

/**
 * DTO 校验单测（AI-403）：逐字段验证合法/非法，确保全局 `ValidationPipe`
 * （whitelist+transform+forbidNonWhitelisted）对「非法入参」返回 400。
 * 覆盖正常路径 + 边界 + 异常分支。
 */

function build(overrides: Record<string, unknown> = {}): ChatMessageDto {
  const plain = { text: 'Hello fox!', ...overrides };
  return plainToInstance(ChatMessageDto, plain);
}

async function errorsOf(plain: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(ChatMessageDto, plain);
  const errs = await validate(dto);
  return errs.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('ChatMessageDto (AI-403)', () => {
  it('合法入参（仅 text）零错误', async () => {
    const errs = await validate(build());
    expect(errs).toHaveLength(0);
  });

  it('含可选字段（sessionId/sceneId/userId）仍零错误', async () => {
    const errs = await validate(
      build({ sessionId: 's1', sceneId: 'zoo', userId: 'u1' }),
    );
    expect(errs).toHaveLength(0);
  });

  it('未知 sceneId 仍合法（自由对话兼容，AI-405 不限制枚举外取值）', async () => {
    const errs = await validate(
      build({ sceneId: 'some-future-scene' }),
    );
    expect(errs).toHaveLength(0);
  });

  it('缺 text 被拒', async () => {
    const msgs = await errorsOf({});
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('text 为空字符串被拒', async () => {
    const msgs = await errorsOf({ text: '' });
    expect(msgs.join(' ')).toMatch(/empty|isEmpty/i);
  });

  it('text 超长（>2000）被拒', async () => {
    const msgs = await errorsOf({ text: 'a'.repeat(2001) });
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('sceneId 超长（>64）被拒', async () => {
    const msgs = await errorsOf({ text: 'hi', sceneId: 'x'.repeat(65) });
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('sessionId 空字符串被拒（IsNotEmpty）', async () => {
    const msgs = await errorsOf({ text: 'hi', sessionId: '' });
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('额外未知字段被拒（forbidNonWhitelisted，经全局 ValidationPipe）', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    await expect(
      pipe.transform({ text: 'hi', evil: 'x' }, { type: 'body', metatype: ChatMessageDto }),
    ).rejects.toThrow(BadRequestException);
  });
});
