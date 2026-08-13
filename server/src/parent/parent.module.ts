import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { ParentService } from './parent.service';
import { ParentController } from './parent.controller';
import { ParentGuard } from './parent.guard';

/**
 * 家长域模块（AI-702 之后）。
 *
 * `ParentGuard` 校验登录 JWT 的 `role === 'parent'`，不再依赖单独的 PIN 会话 JWT。
 * `ParentGuard` 导出供 `RewardsModule` 等审批/目录 CRUD 端点复用。
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
  exports: [ParentGuard, JwtModule],
})
export class ParentModule {}
