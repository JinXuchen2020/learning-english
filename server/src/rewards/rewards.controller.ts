import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { ParentGuard } from '../parent/parent.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RedemptionStatus } from './reward-redemption.entity';

/**
 * 奖励商城 + 家长审批控制器（AI-701）。
 *
 * 路由（全局前缀 `api`）：
 * - 孩子侧（JwtAuthGuard，userId 取 `req.user.userId`）：`GET /rewards`（商城）、
 *   `GET /rewards/summary`、`GET /rewards/my-redemptions`、`POST /rewards/redeem/:rewardId`。
 * - 家长侧（ParentGuard）：`GET /rewards/redemptions?status=`、`POST .../approve|reject`、
 *   奖励目录 CRUD（`POST /rewards`、`PATCH /rewards/:id`、`DELETE /rewards/:id`）。
 */
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  /** 商城展示：上架奖励列表。 */
  @Get()
  list() {
    return this.rewardsService.listRewards(true);
  }

  /** 余额 + 等级概览（驱动前端）。 */
  @UseGuards(JwtAuthGuard)
  @Get('summary')
  summary(@Request() req: any) {
    return this.rewardsService.getSummary(req.user.userId);
  }

  /** 孩子的兑换记录（仅本人）。 */
  @UseGuards(JwtAuthGuard)
  @Get('my-redemptions')
  myRedemptions(@Request() req: any) {
    return this.rewardsService.listRedemptions({ userId: req.user.userId });
  }

  /** 孩子申请兑换（扣余额，建 pending）。 */
  @UseGuards(JwtAuthGuard)
  @Post('redeem/:rewardId')
  redeem(@Request() req: any, @Param('rewardId') rewardId: string) {
    return this.rewardsService.redeem(req.user.userId, rewardId);
  }

  /** 家长待审批列表（全部用户，可按 status 过滤）。 */
  @UseGuards(ParentGuard)
  @Get('redemptions')
  pending(@Query('status') status?: RedemptionStatus) {
    return this.rewardsService.listRedemptions({ status });
  }

  /** 家长批准。 */
  @UseGuards(ParentGuard)
  @Post('redemptions/:id/approve')
  approve(@Param('id') id: string) {
    return this.rewardsService.approveRedemption(id);
  }

  /** 家长驳回（可选原因）。 */
  @UseGuards(ParentGuard)
  @Post('redemptions/:id/reject')
  reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.rewardsService.rejectRedemption(id, body?.reason);
  }

  /** 家长新增奖励。 */
  @UseGuards(ParentGuard)
  @Post()
  create(@Body() dto: CreateRewardDto) {
    return this.rewardsService.createReward(dto);
  }

  /** 家长修改奖励。 */
  @UseGuards(ParentGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRewardDto) {
    return this.rewardsService.updateReward(id, dto);
  }

  /** 家长删除奖励。 */
  @UseGuards(ParentGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rewardsService.deleteReward(id);
  }
}
