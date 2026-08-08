import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScannedWord } from '../entities/scanned-word.entity';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';

/**
 * 拍照学单词模块（AI-606）。
 * `AiProvider` 由 `AiModule` 的 `@Global()` 注入，本模块无需重复 import。
 *
 * @module scan/scan.module
 */
@Module({
  imports: [TypeOrmModule.forFeature([ScannedWord])],
  controllers: [ScanController],
  providers: [ScanService],
  exports: [ScanService],
})
export class ScanModule {}
