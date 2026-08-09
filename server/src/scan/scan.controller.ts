import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ScanService } from './scan.service';
import { ConfirmScanDto } from './dto/confirm-scan.dto';
import {
  validateScanUpload,
  ScanUploadError,
  HARD_UPLOAD_LIMIT_BYTES,
} from './scan-upload.validation';

/**
 * 上传图片文件的最小结构（避免依赖 `@types/multer`，仓内未安装）。
 */
export interface UploadedImageFile {
  /** 文件二进制。 */
  buffer: Buffer;
  /** MIME 类型。 */
  mimetype: string;
  /** 字节数。 */
  size: number;
  /** 原始文件名。 */
  originalname?: string;
}

/**
 * 拍照学单词控制器（AI-606）。
 * 路由前缀 `scan`（全局前缀 `/api` → `/api/scan`）。
 * 鉴权：加 `JwtAuthGuard`，userId 取自 `req.user.userId`（与 progress/tasks 口径一致）。
 *
 * @module scan/scan.controller
 */
@Controller('scan')
@UseGuards(JwtAuthGuard)
export class ScanController {
  constructor(private readonly service: ScanService) {}

  /**
   * 识别图片：`POST /api/scan/recognize`
   * `image` 文件经 multer `FileInterceptor('image')`（硬上限 10MB 防内存爆，
   * 精确 5MB + MIME 白名单在 service 校验层 → 413/415）。
   */
  @Post('recognize')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: HARD_UPLOAD_LIMIT_BYTES } }),
  )
  async recognize(
    @UploadedFile() file: UploadedImageFile,
    @Body() body: Record<string, string>,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'NO_IMAGE', message: '请上传图片' });
    }
    try {
      validateScanUpload({ size: file.size, mimeType: file.mimetype });
    } catch (err) {
      if (err instanceof ScanUploadError) {
        throw new HttpException(
          { code: err.code, message: err.message },
          err.status as HttpStatus,
        );
      }
      throw err;
    }
    const base64 = file.buffer.toString('base64');
    return this.service.recognize(base64, file.mimetype, req.user.userId, body?.prompt);
  }

  /** 加入生词本：`POST /api/scan/confirm`，body 经 `ConfirmScanDto` 校验。 */
  @Post('confirm')
  async confirm(@Body() dto: ConfirmScanDto, @Request() req: any) {
    return this.service.confirm(dto.ids, req.user.userId);
  }

  /** 生词本列表：`GET /api/scan`（仅当前用户 saved）。 */
  @Get()
  async list(@Request() req: any) {
    return this.service.listSaved(req.user.userId);
  }
}
