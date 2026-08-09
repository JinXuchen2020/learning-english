import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { ParentService } from './parent.service';
import { ParentController } from './parent.controller';
import { ParentGuard } from './parent.guard';

/**
 * 家长模式模块（AI-702）。
 *
 * 提供 `ParentService`（PIN 哈希 + 家长 JWT 签发）与 `ParentGuard`（校验家长会话 JWT）。
 * `ParentGuard` 导出供 `RewardsModule` 的审批/目录 CRUD 端点复用，从而 AI-701 的
 * 临时 `x-parent-approval` 明文 token 门禁被彻底替换为家长 PIN 会话。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fox-english-kids-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [ParentController],
  providers: [ParentService, ParentGuard],
  // 导出 JwtModule：RewardsModule 等导入 ParentModule 后，其控制器使用的
  // ParentGuard（依赖 JwtService）可在自身模块上下文中解析 JwtService。
  exports: [ParentGuard, JwtModule],
})
export class ParentModule {}
