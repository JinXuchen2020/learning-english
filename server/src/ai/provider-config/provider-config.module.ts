import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderConfig } from './provider-config.entity';
import { ProviderConfigService } from './provider-config.service';
import { ProviderConfigController } from './provider-config.controller';
import { ParentModule } from '../../parent/parent.module';
import { User } from '../../entities/user.entity';

/**
 * Provider 配置模块（AI-705）。
 *
 * - 导入 `ParentModule` → 复用 `ParentGuard` 与 `JwtService`（供控制器鉴权 + 拦截器解析 JWT）；
 * - 自身 `TypeOrmModule.forFeature([ProviderConfig, User])` 注册两个仓库，
 *   避免依赖 ParentModule 的 `forFeature([User])` 在被多重导入时无法沿链传递；
 * - 导出 `ProviderConfigService` 供 `AiModule` 的运行时解析器（`AiProviderRouter`）注入。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProviderConfig, User]), ParentModule],
  controllers: [ProviderConfigController],
  providers: [ProviderConfigService],
  exports: [ProviderConfigService],
})
export class ProviderConfigModule {}
