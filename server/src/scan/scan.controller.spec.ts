import { BadRequestException, HttpException } from '@nestjs/common';
import { ScanController, UploadedImageFile } from './scan.controller';
import { ScanService } from './scan.service';
import { ConfirmScanDto } from './dto/confirm-scan.dto';

function makeService() {
  return {
    recognize: jest.fn(),
    confirm: jest.fn(),
    listSaved: jest.fn(),
  } as unknown as ScanService;
}

describe('ScanController', () => {
  let service: ScanService;
  let controller: ScanController;

  beforeEach(() => {
    service = makeService();
    controller = new ScanController(service);
  });

  const req = { user: { userId: 'u1' } };

  it('recognize 无图片 → 400 NO_IMAGE', async () => {
    await expect(
      controller.recognize(undefined as unknown as UploadedImageFile, {}, req),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recognize 不支持的 MIME → 415', async () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/gif', size: 10 } as UploadedImageFile;
    await expect(controller.recognize(file, {}, req)).rejects.toMatchObject({
      status: 415,
    });
  });

  it('recognize 超大图片 → 413', async () => {
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      size: 6 * 1024 * 1024,
    } as UploadedImageFile;
    await expect(controller.recognize(file, {}, req)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('recognize 合法 → 调 service.recognize(base64, mime, userId)', async () => {
    const file = {
      buffer: Buffer.from('hello'),
      mimetype: 'image/png',
      size: 5,
    } as UploadedImageFile;
    (service.recognize as jest.Mock).mockResolvedValue({ cards: [], recognized: true });
    await controller.recognize(file, { prompt: '水果' }, req);
    expect(service.recognize).toHaveBeenCalledWith(
      Buffer.from('hello').toString('base64'),
      'image/png',
      'u1',
      '水果',
    );
  });

  it('confirm → 调 service.confirm(ids, userId)', async () => {
    const dto: ConfirmScanDto = { ids: ['a', 'b'] } as ConfirmScanDto;
    await controller.confirm(dto, req);
    expect(service.confirm).toHaveBeenCalledWith(['a', 'b'], 'u1');
  });

  it('list → 调 service.listSaved(userId)', async () => {
    await controller.list(req);
    expect(service.listSaved).toHaveBeenCalledWith('u1');
  });
});
