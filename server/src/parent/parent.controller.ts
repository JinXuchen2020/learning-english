import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ParentService } from './parent.service';
import { ParentGuard } from './parent.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { SetupPinDto } from './dto/setup-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';

/**
 * 家长模式控制器（AI-702）。
 *
 * 路由（全局前缀 `api`）：
 * - `GET  /parent/status`     —— child JWT，返回 `{ hasPin }`（前端决定显示「设置」还是「输入」）
 * - `POST /parent/verify-pin` —— child JWT，校验 PIN，成功返回 `{ parentToken }`，失败 401
 * - `POST /parent/setup-pin`  —— child JWT，首次设置 PIN，成功返回 `{ parentToken }`，已设置则 409
 * - `POST /parent/change-pin` —— **ParentGuard**，旧 PIN 校验后改 PIN，返回 `{ success }`
 */
@Controller('parent')
export class ParentController {
  constructor(private readonly parentService: ParentService) {}

  /** 当前孩子是否已设置家长 PIN。 */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@Request() req: any) {
    const hasPin = await this.parentService.hasPin(req.user.userId);
    return { hasPin };
  }

  /** 验证 PIN → 签发家长会话令牌。 */
  @UseGuards(JwtAuthGuard)
  @Post('verify-pin')
  async verify(@Request() req: any, @Body() dto: VerifyPinDto) {
    const ok = await this.parentService.verifyPin(req.user.userId, dto.pin);
    if (!ok) {
      throw new UnauthorizedException('家长 PIN 不正确');
    }
    return { parentToken: this.parentService.signParentToken(req.user.userId) };
  }

  /** 首次设置 PIN → 签发家长会话令牌。 */
  @UseGuards(JwtAuthGuard)
  @Post('setup-pin')
  async setup(@Request() req: any, @Body() dto: SetupPinDto) {
    await this.parentService.setupPin(req.user.userId, dto.pin);
    return { parentToken: this.parentService.signParentToken(req.user.userId) };
  }

  /** 修改 PIN（需先进入家长模式）。 */
  @UseGuards(ParentGuard)
  @Post('change-pin')
  async change(@Request() req: any, @Body() dto: ChangePinDto) {
    await this.parentService.changePin(req.user.userId, dto.oldPin, dto.newPin);
    // 改 PIN 后刷新家长会话令牌，避免旧令牌继续可用。
    return {
      success: true,
      parentToken: this.parentService.signParentToken(req.user.userId),
    };
  }
}
