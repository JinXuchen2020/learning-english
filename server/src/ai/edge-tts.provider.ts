/**
 * EdgeTtsProvider — 基于本地 Python `edge-tts` 的免费 TTS 后端（AI-407 修复）。
 *
 * 背景：付费 AI provider（Agnes / 智谱）当前均无可用 TTS 通道
 * （Agnes 无 `tts-1` 模型 → 503；智谱 glm-tts 无 TTS 配额 → 429，且代码误传
 * 不支持的 `response_format:'mp3'` → 400）。本项目接入微软 edge-tts（免费、无需
 * API key）作为 `synthesize` 链的最终兜底，让对话陪练的狐狸朗读稳定可用。
 *
 * 实现：调用本地 `python -m edge_tts` 把文本合成 mp3 写入临时文件，读回 Buffer
 * → base64，由上层 `ChatService.synthesizeTtsUrl` 包成 `data:audio/mp3;base64,...`
 * 返回前端（前端 `playTts` / `<audio>` 已原生支持 data URI，无需静态资源服务、无跨域）。
 *
 * 非 TTS 能力（chat / transcribe 等）不支持，调用即抛错——但本 provider 仅被置于
 * `FallbackAiProvider` 链末尾，chat 链前序 Agnes/智谱 已成功，不会触发这些方法。
 *
 * @module ai/edge-tts.provider
 */

import { execFile, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  AiProvider,
  ProviderName,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ImageInput,
  TranscriptResult,
  TranscribeOptions,
  ScoreResult,
  AssessOptions,
  AudioResult,
  SynthesizeOptions,
  AudioInput,
} from './ai-provider.interface';
import { logger } from '../common/logger/logger';

/**
 * 候选 Python 解释器（按优先级）。绝对路径在本机已装 edge-tts，放最前快速命中；
 * 其余为跨平台 fallback。可通过 `EDGE_TTS_PYTHON` 环境变量覆盖。
 */
const PYTHON_CANDIDATES: string[] = [
  'C:\\Users\\HP\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
  process.env.EDGE_TTS_PYTHON,
  'python3',
  'python',
  'py',
].filter((p): p is string => typeof p === 'string');

/** 同步探测可用的 python（已装 edge_tts 模块）。返回路径或 null。 */
function detectPythonSync(): string | null {
  for (const py of PYTHON_CANDIDATES) {
    try {
      execFileSync(py, ['-c', 'import edge_tts'], {
        timeout: 5000,
        windowsHide: true,
        stdio: 'ignore',
      });
      return py;
    } catch {
      // 尝试下一个候选
    }
  }
  return null;
}

/** 单次 TTS 最大文本长度（儿童短句足够；超长截断避免 edge-tts 报错）。 */
const MAX_TEXT_LEN = 500;

/** 默认英语儿童友好女声。 */
const DEFAULT_VOICE = 'en-US-AriaNeural';

export class EdgeTtsProvider implements AiProvider {
  readonly name: ProviderName = 'edge-tts';

  private readonly cacheDir: string;
  private python: string | null = null;
  private pythonResolved = false;

  constructor() {
    this.cacheDir = path.join(process.cwd(), '.tts_cache');
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {
      // 缓存目录创建失败不致命；synthesize 仍会尝试写临时文件
    }
    // 启动时同步探测一次，避免拖慢首个 TTS 请求。
    // 注意：探测失败（如 CI / 未安装 python）不在此打 WARN——这是可选兜底能力，
    // 启动期告警会污染 CI 日志且不影响对话；仅在真实 TTS 请求失败时才告警（见 synthesize）。
    this.python = detectPythonSync();
    this.pythonResolved = true;
  }

  private resolvePython(): string | null {
    if (!this.pythonResolved) {
      this.python = detectPythonSync();
      this.pythonResolved = true;
    }
    return this.python;
  }

  async synthesize(
    text: string,
    voice: string = DEFAULT_VOICE,
    options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    const py = this.resolvePython();
    if (!py) {
      logger.warn(
        '[EdgeTts] 未探测到可用的 python/edge-tts，TTS 请求降级为纯文本（不影响对话）',
      );
      throw new Error('[EdgeTts] python/edge-tts 不可用，无法合成语音');
    }
    const safe = (text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LEN);
    if (!safe) {
      throw new Error('[EdgeTts] 合成文本为空');
    }
    const outFile = path.join(
      this.cacheDir,
      `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`,
    );
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          py,
          ['-m', 'edge_tts', '--text', safe, '--voice', voice, '--write-media', outFile],
          {
            timeout: options?.timeoutMs ?? 30000,
            windowsHide: true,
            maxBuffer: 2 * 1024 * 1024,
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });
      const buf = await fs.promises.readFile(outFile);
      if (buf.length === 0) {
        throw new Error('[EdgeTts] 生成音频为空');
      }
      return { audioBase64: buf.toString('base64'), mimeType: 'audio/mp3' };
    } finally {
      await fs.promises.unlink(outFile).catch(() => {});
    }
  }

  /** 非 TTS 能力占位：本 provider 不实现，调用即抛错（仅作 synthesize 兜底接入）。 */
  private unsupported(method: string): never {
    throw new Error(`[EdgeTts] ${method} 不受支持（EdgeTts 仅提供 TTS）`);
  }

  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    this.unsupported('chat');
  }

  async chatWithImage(
    _prompt: string,
    _image: ImageInput,
    _options?: ChatOptions,
  ): Promise<ChatResult> {
    this.unsupported('chatWithImage');
  }

  async transcribe(_audio: AudioInput, _options?: TranscribeOptions): Promise<TranscriptResult> {
    this.unsupported('transcribe');
  }

  async assessPronunciation(
    _audio: AudioInput,
    _referenceText: string,
    _options?: AssessOptions,
  ): Promise<ScoreResult> {
    this.unsupported('assessPronunciation');
  }
}
