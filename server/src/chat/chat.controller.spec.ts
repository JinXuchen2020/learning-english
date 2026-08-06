import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatError } from './chat.errors';
import { ChatMessageDto } from './chat-message.dto';
import { HttpException, ValidationPipe, BadRequestException } from '@nestjs/common';

/**
 * ChatController 单测（AI-403）：验证响应透传、ChatError→HttpException 翻译、
 * 未知异常不吞，以及全局 ValidationPipe 在控制器边界对非法 body 的拦截。
 */

describe('ChatController (AI-403)', () => {
  it('service 成功 → 原样返回响应', async () => {
    const chat = {
      sendMessage: jest.fn(async () => ({
        sessionId: 's1',
        messageId: 'm1',
        replyText: 'Fox says hi!',
        ttsUrl: null,
      })),
    };
    const c = new ChatController(chat as unknown as ChatService);
    const res = await c.messages({ text: 'hello' } as ChatMessageDto);
    expect(res.replyText).toBe('Fox says hi!');
    expect(chat.sendMessage).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('ChatError → HttpException（status + body.code）', async () => {
    const chat = {
      sendMessage: jest.fn(async () => {
        throw new ChatError(404, 'CHAT_SESSION_NOT_FOUND', '会话不存在：x');
      }),
    };
    const c = new ChatController(chat as unknown as ChatService);
    await expect(c.messages({ text: 'hi' } as ChatMessageDto)).rejects.toMatchObject({
      status: 404,
      response: { code: 'CHAT_SESSION_NOT_FOUND' },
    });
  });

  it('其它异常 → 透传（不吞）', async () => {
    const chat = {
      sendMessage: jest.fn(async () => {
        throw new Error('boom');
      }),
    };
    const c = new ChatController(chat as unknown as ChatService);
    await expect(c.messages({ text: 'hi' } as ChatMessageDto)).rejects.toThrow('boom');
  });
});

describe('ChatController + ValidationPipe (AI-403)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

  it('合法 body 通过校验', async () => {
    const dto = await pipe.transform(
      { text: 'hi' },
      { type: 'body', metatype: ChatMessageDto },
    );
    expect(dto.text).toBe('hi');
  });

  it('缺 text → BadRequestException（400）', async () => {
    await expect(
      pipe.transform({}, { type: 'body', metatype: ChatMessageDto }),
    ).rejects.toThrow(BadRequestException);
  });

  it('额外字段 → BadRequestException（forbidNonWhitelisted）', async () => {
    await expect(
      pipe.transform({ text: 'hi', evil: 1 }, { type: 'body', metatype: ChatMessageDto }),
    ).rejects.toThrow(BadRequestException);
  });
});
