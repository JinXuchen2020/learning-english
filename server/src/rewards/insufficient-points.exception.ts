import { HttpException, HttpStatus } from '@nestjs/common';

/** 积分余额不足（兑换时）。400 + 机器可读 code，便于前端提示「再去攒积分吧」。 */
export class InsufficientPointsException extends HttpException {
  constructor(balance: number, cost: number) {
    super(
      {
        code: 'INSUFFICIENT_POINTS',
        message: `积分不足：余额 ${balance}，需要 ${cost}`,
        balance,
        cost,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
