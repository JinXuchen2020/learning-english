import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ParentService } from './parent.service';
import { ParentGuard } from './parent.guard';
import { CreateChildDto } from './dto/create-child.dto';
import { ClaimChildDto } from './dto/claim-child.dto';

/**
 * 家长域控制器（AI-710 家庭绑定）。
 *
 * 全部端点挂 `ParentGuard`——仅 `role==='parent'` 的登录 JWT 可访问。
 * `req.user.userId` 由 ParentGuard 从 JWT payload 注入，作为 parentId。
 */
@Controller('parent')
@UseGuards(ParentGuard)
export class ParentController {
  constructor(private readonly parentService: ParentService) {}

  /** 家长创建孩子账号。 */
  @Post('children')
  createChild(@Request() req: any, @Body() dto: CreateChildDto) {
    return this.parentService.createChild(req.user.userId, dto);
  }

  /** 家长认领已有孩子（密码校验）。 */
  @Post('children/claim')
  claimChild(@Request() req: any, @Body() dto: ClaimChildDto) {
    return this.parentService.claimChild(req.user.userId, dto);
  }

  /** 列出本人名下孩子。 */
  @Get('children')
  listChildren(@Request() req: any) {
    return this.parentService.listChildren(req.user.userId);
  }

  /** 解除归属（仅清 parentId，不删账号）。 */
  @Delete('children/:childId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkChild(@Request() req: any, @Param('childId') childId: string) {
    return this.parentService.unlinkChild(req.user.userId, childId);
  }
}
