import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LogEmailSender } from './log-email-sender.service';

describe('LogEmailSender (AI-506)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai506-email-'));
    process.env.EMAIL_LOG_DIR = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EMAIL_LOG_DIR;
  });

  it('send 写 HTML 文件并返回 accepted + htmlPath', async () => {
    const sender = new LogEmailSender();
    const res = await sender.send({
      to: 'parent@example.com',
      subject: '周报',
      html: '<h1>hello</h1>',
    });

    expect(res.accepted).toBe(true);
    expect(res.messageId).toMatch(/^log-/);
    expect(res.htmlPath).toBeDefined();
    const content = fs.readFileSync(res.htmlPath as string, 'utf8');
    expect(content).toContain('<h1>hello</h1>');
    expect(res.htmlPath).toContain(dir);
  });

  it('收件人含特殊字符时文件名被 sanitize（不抛错）', async () => {
    const sender = new LogEmailSender();
    const res = await sender.send({
      to: 'a/b:c*d@e.com',
      subject: 's',
      html: '<p>x</p>',
    });
    expect(res.accepted).toBe(true);
    expect(() => fs.accessSync(res.htmlPath as string)).not.toThrow();
  });
});
