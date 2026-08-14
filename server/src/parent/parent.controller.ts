import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ParentService } from './parent.service';
import { ParentGuard } from './parent.guard';
import { ProgressAggregationService, ChildProgressDetail } from './progress-aggregation.service';
import { CreateChildDto } from './dto/create-child.dto';
import { ClaimChildDto } from './dto/claim-child.dto';
import { SetChildProviderDto } from './dto/set-child-provider.dto';

/**
 * 家长域控制器（AI-710 家庭绑定 + AI-712 多孩子进度总览）。
 *
 * 全部端点挂 `ParentGuard`——仅 `role==='parent'` 的登录 JWT 可访问。
 * `req.user.userId` 由 ParentGuard 从 JWT payload 注入，作为 parentId。
 */
@Controller('parent')
@UseGuards(ParentGuard)
export class ParentController {
  constructor(
    private readonly parentService: ParentService,
    private readonly progressAggregation: ProgressAggregationService,
  ) {}

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

  /** AI-711：设置 / 清除孩子的 provider 覆盖。 */
  @Put('children/:childId/provider')
  setChildProvider(
    @Request() req: any,
    @Param('childId') childId: string,
    @Body() dto: SetChildProviderDto,
  ) {
    return this.parentService.setChildProvider(req.user.userId, childId, dto);
  }

  /** AI-711：列出家长名下可选 provider（供孩子下拉）。 */
  @Get('children/:childId/provider-options')
  getChildProviderOptions(@Request() req: any, @Param('childId') childId: string) {
    return this.parentService.getChildProviderOptions(req.user.userId, childId);
  }

  /**
   * AI-712：家庭总览——列出本人名下每个孩子的进度摘要。
   * `parentId` 取 JWT 的 userId（ParentGuard 保证为家长）。
   */
  @Get('dashboard')
  getDashboard(@Request() req: any) {
    return this.progressAggregation.getDashboard(req.user.userId);
  }

  /**
   * AI-712：单孩进度详情（薄弱词 / 技能掌握度 / 周趋势）。
   * `childId` 必须 `parentId === JWT.userId`，否则 404（不泄露他孩存在）。
   */
  @Get('children/:childId/progress')
  async getChildProgress(
    @Request() req: any,
    @Param('childId') childId: string,
  ): Promise<ChildProgressDetail> {
    const parentId = req.user.userId;
    const child = await this.parentService.findOwnedChild(parentId, childId);
    if (!child) {
      throw new NotFoundException('Child not found');
    }
    return this.progressAggregation.getChildDetail(child);
  }
}
