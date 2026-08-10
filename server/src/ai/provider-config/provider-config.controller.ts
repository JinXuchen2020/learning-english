import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import { ParentGuard } from '../../parent/parent.guard';
import { CreateProviderConfigDto, UpdateProviderConfigDto } from './provider-config.dto';
import { ProviderConfigService, ProviderConfigView } from './provider-config.service';

interface ParentRequest {
  user?: { userId: string; role: string };
}

/**
 * Provider 配置控制器（AI-705）。
 *
 * 全部路由挂 `ParentGuard`：仅家长 PIN 会话（role==='parent'）可访问；
 * `ownerUserId` 强制取自身 JWT 的 userId，禁止客户端传入 → 天然防越权/儿童访问。
 */
@Controller('provider-config')
@UseGuards(ParentGuard)
export class ProviderConfigController {
  constructor(private readonly service: ProviderConfigService) {}

  @Get()
  list(@Req() req: ParentRequest): Promise<ProviderConfigView[]> {
    return this.service.list(req.user!.userId);
  }

  @Post()
  create(
    @Req() req: ParentRequest,
    @Body() dto: CreateProviderConfigDto,
  ): Promise<ProviderConfigView> {
    return this.service.create(req.user!.userId, dto);
  }

  @Put(':id')
  update(
    @Req() req: ParentRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProviderConfigDto,
  ): Promise<ProviderConfigView> {
    return this.service.update(id, req.user!.userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: ParentRequest, @Param('id') id: string): Promise<void> {
    return this.service.remove(id, req.user!.userId);
  }

  @Post(':id/default')
  setDefault(
    @Req() req: ParentRequest,
    @Param('id') id: string,
  ): Promise<ProviderConfigView> {
    return this.service.setDefault(id, req.user!.userId);
  }

  @Post(':id/test')
  test(
    @Req() req: ParentRequest,
    @Param('id') id: string,
  ): Promise<{ ok: boolean; message: string }> {
    return this.service.testConnectionById(id, req.user!.userId);
  }
}
