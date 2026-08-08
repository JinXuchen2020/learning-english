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

/**
 * MockAiProvider —— 确定性假数据 provider（AI-103 建立基线，AI-104 扩展夹具）。
 *
 * 用途：
 * - 当 `AI_PROVIDER` 缺失 / 为 `mock` / 或未实现的 `nvidia`·`azure` 时，
 *   `AiModule` 用它注册，保证「无 key 时应用可启动」且前端可跑通全流程演示。
 * - 返回**确定性**、**可信演示内容**（固定 plan/报告文本、真实感假评分、示例转写句），
 *   不依赖任何外部 API，便于开发与单测。
 *
 * 与真实 schema 的边界：AI-203/AI-204 才定义真实 plan JSON Schema；本 provider 的
 * `chat` 只返回**可读演示文本**（非最终 JSON 结构），避免伪造未定稿 schema 误导消费方。
 */

/** chat 意图分类，决定返回哪类演示夹具。 */
type ChatIntent = 'plan' | 'report' | 'generic';

/** 计划意图关键词（小写匹配，命中其一即归为 plan）。 */
const PLAN_KEYWORDS = ['计划', 'plan', '学习计划', 'schedule', '每日', '周计划', '学习方案', '课程'];

/** 报告意图关键词（小写匹配，命中其一即归为 report）。 */
const REPORT_KEYWORDS = ['报告', 'report', '小结', '日报', '总结', 'summary', '今日', '今日小结'];

/** 固定示例学习计划（演示用，非最终 JSON schema）。 */
const MOCK_PLAN_TEXT = [
  '[Mock 计划] 一周趣味学习计划：',
  '周一：主课《颜色王国》+ 复习颜色单词 + 口语“What color is it?”',
  '周二：主课《动物朋友》+ 复习动物单词 + 口语“I see a ...”',
  '周三：复习日（颜色 + 动物）',
  '周四：主课《数字乐园》+ 口语“How many?”',
  '周五：主课《水果市场》+ 复习 + 口语“I like ...”',
  '周末：自由复习 + 看一集动画片',
].join('\n');

/** 固定示例每日小结（演示用，非最终 JSON schema）。 */
const MOCK_REPORT_TEXT = [
  '[Mock 今日小结] 今天你真棒！',
  '完成：3 个任务，跟读 5 次',
  '弱项：th / v 两个音',
  '建议：明天多练 “three” “very”',
].join('\n');

/** 通用演示回复（非计划/报告意图时的兜底）。 */
const MOCK_GENERIC_TEXT = '[Mock] 收到！这是模拟回复（演示模式，未连接真实 AI）。';

/** 吉祥物成长剧情意图关键词（小写匹配）。 */
const STORY_KEYWORDS = ['剧情', 'story', '吉祥物', '成长', '小狐狸', 'mascot', 'growth'];

/** 固定示例成长剧情（合法 JSON，供 MascotStoryAgent.parseMascotStoryOutput 演示解析）。 */
const MOCK_STORY_TEXT = JSON.stringify({
  title: '[Mock] 小狐狸的勇气披风',
  storyText:
    '[Mock] 当你收集到更多星星，小狐狸披上了闪亮的披风！它说：宝贝，你的坚持让我变得更强啦，我们一起继续冒险吧～',
});

/** 绘本生成意图关键词（小写匹配，命中其一即归为 picture-book）。 */
const PICTURE_BOOK_KEYWORDS = ['绘本', 'picture', 'picture-book', 'storybook', 'book', '画本', '故事书'];

/** 固定示例绘本（合法 JSON，供 PictureBookAgent.parsePictureBookOutput 演示解析）。 */
const MOCK_PICTURE_BOOK_TEXT = JSON.stringify({
  title: '[Mock] 小狐狸的彩虹单词王国',
  coverImagePrompt: '[Mock] 小狐狸站在彩虹门前，门后漂浮着发光的英文单词',
  pages: [
    {
      pageNumber: 1,
      text: '[Mock] 宝贝，小狐狸推开了彩虹门，里面住着会发光的单词朋友 apple 和 cat！',
      illustrationPrompt: '[Mock] 小狐狸在彩虹门里遇见发光的 apple 和 cat',
    },
    {
      pageNumber: 2,
      text: '[Mock] 它用 dog 和 sun 搭了一座小桥，开开心心地过了河。',
      illustrationPrompt: '[Mock] 小狐狸用发光的 dog 和 sun 搭桥过河',
    },
    {
      pageNumber: 3,
      text: '[Mock] 天黑了，小狐狸数着今天的星星，说明天还要来认识更多单词！',
      illustrationPrompt: '[Mock] 小狐狸在星空下数星星',
    },
  ],
});

/** 示例转写句（演示用，含可读英文）。 */
const MOCK_TRANSCRIPT = '[Mock] I see a red apple on the table.';

/** 拍照识词 (OCR) 意图关键词（小写匹配，命中其一即归为 OCR 夹具）。 */
const OCR_KEYWORDS = ['识别', '拍照', '物体', 'ocr', '单词', 'scan', '看图', '认一'];

/** 固定示例 OCR 单词卡（合法 JSON 数组，供 AI-606 演示解析）。 */
const MOCK_OCR_CARDS_JSON = JSON.stringify([
  {
    word: 'apple',
    meaning: '苹果',
    example: 'I eat a red apple.',
    imagePrompt: 'a red apple on a white table',
  },
  {
    word: 'cat',
    meaning: '猫',
    example: 'The cute cat is sleeping.',
    imagePrompt: 'a cute sleeping cat',
  },
]);

export class MockAiProvider implements AiProvider {
  readonly name: ProviderName = 'mock';

  async chat(messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const text = lastUser ? lastUser.content : '';
    return {
      text: this.pickChatFixture(text),
      model: 'mock-model',
    };
  }

  async chatWithImage(
    prompt: string,
    image: ImageInput,
    _options?: ChatOptions,
  ): Promise<ChatResult> {
    const lowered = prompt.toLowerCase();
    // OCR 意图（识别/拍照/物体…）→ 返回确定性 JSON 卡片，供 AI-606 演示/单测/E2E。
    if (OCR_KEYWORDS.some((k) => lowered.includes(k.toLowerCase()))) {
      return {
        text: MOCK_OCR_CARDS_JSON,
        model: 'mock-vision',
      };
    }
    return {
      text: `[Mock] 已识别图片(${image.mimeType}, ${image.data.length} bytes)，这是模拟理解结果。指令：${prompt}`,
      model: 'mock-vision-model',
    };
  }

  async transcribe(_audio: AudioInput, _options?: TranscribeOptions): Promise<TranscriptResult> {
    return {
      text: MOCK_TRANSCRIPT,
      confidence: 1,
      durationMs: 0,
    };
  }

  async assessPronunciation(
    _audio: AudioInput,
    referenceText: string,
    _options?: AssessOptions,
  ): Promise<ScoreResult> {
    // 确定性假评分：非满分（演示弱音素高亮与 encourage 表情），不随机。
    return {
      score: 88,
      readableText: referenceText,
      weakPhonemes: ['θ', 'v'],
      feedback: '[Mock] 很接近啦！注意 th 和 v 的发音～',
      mascotExpr: 'encourage',
    };
  }

  async synthesize(
    text: string,
    _voice?: string,
    _options?: SynthesizeOptions,
  ): Promise<AudioResult> {
    return {
      audioBase64: '',
      mimeType: 'audio/mp3',
      durationMs: 0,
    };
  }

  /** 按最后用户输入识别意图，返回对应固定演示夹具。 */
  private pickChatFixture(userText: string): string {
    const lowered = userText.toLowerCase();
    if (PLAN_KEYWORDS.some((k) => lowered.includes(k.toLowerCase()))) {
      return MOCK_PLAN_TEXT;
    }
    if (REPORT_KEYWORDS.some((k) => lowered.includes(k.toLowerCase()))) {
      return MOCK_REPORT_TEXT;
    }
    // 绘本意图优先于 mascot story：绘本 prompt 含「绘本 / picture」且也会带
    // mascotName「小狐狸」（命中 STORY_KEYWORDS），故必须先于 STORY 判定。
    if (PICTURE_BOOK_KEYWORDS.some((k) => lowered.includes(k.toLowerCase()))) {
      return MOCK_PICTURE_BOOK_TEXT;
    }
    if (STORY_KEYWORDS.some((k) => lowered.includes(k.toLowerCase()))) {
      return MOCK_STORY_TEXT;
    }
    return MOCK_GENERIC_TEXT;
  }
}
