import { ParentService } from './parent.service';

/**
 * ParentService 单元测试占位（AI-702 之后）。
 *
 * 历史 PIN 相关方法（hasPin / verifyPin / setupPin / changePin / signParentToken）已移除。
 * 后续 AI-710「家庭绑定」会在此补充 createChild / claimChild / listChildren 等测试。
 */
describe('ParentService (post AI-702)', () => {
  it('服务可实例化', () => {
    const service = new ParentService({} as any, {} as any);
    expect(service).toBeDefined();
  });
});
