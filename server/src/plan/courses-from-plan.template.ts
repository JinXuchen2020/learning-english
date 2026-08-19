import { CoursePlanSpec } from './courses-from-plan.schema';

/**
 * 课程生成模板降级（AI-801 安全网）。
 *
 * 当 AI 输出连续校验失败 / AI 不可达时，经本模块产出结构合规、可渲染的通用主题课程。
 * 不依赖 LLM：标题/描述来自计划推导的 `CourseSpecSeed`（week theme / day 标题），
 * 每节单词取自内置常见词池（循环、节内不重复），`options` 为「正确项 + 3 干扰项」、
 * `correctIndex` 随机落位。落库后可在 `/courses` 正常学习——保证「生成配套课程」永不 500。
 */

/** 由计划推导的课程种子（标题/描述/等级/每日标题/天数），详见 `PlanService.deriveCourseSpec`。 */
export interface CourseSpecSeed {
  title: string;
  description: string;
  level: string;
  dayTitles: string[];
  daysCount: number;
}

/** 调色板（与种子课程 icon/color 同风格）。 */
const PALETTE = [
  '#6C5CE7', '#00B894', '#0984E3', '#E17055', '#FD79A8', '#FDCB6E', '#00CEC9',
];

/** 内置常见儿童词汇池（text/phonics/meaning）。 */
const WORD_POOL: ReadonlyArray<{ text: string; phonics: string; meaning: string }> = [
  { text: 'apple', phonics: '/ˈæpl/', meaning: '苹果' },
  { text: 'banana', phonics: '/bəˈnɑːnə/', meaning: '香蕉' },
  { text: 'cat', phonics: '/kæt/', meaning: '小猫' },
  { text: 'dog', phonics: '/dɒɡ/', meaning: '小狗' },
  { text: 'sun', phonics: '/sʌn/', meaning: '太阳' },
  { text: 'star', phonics: '/stɑːr/', meaning: '星星' },
  { text: 'book', phonics: '/bʊk/', meaning: '书' },
  { text: 'tree', phonics: '/triː/', meaning: '树' },
  { text: 'fish', phonics: '/fɪʃ/', meaning: '鱼' },
  { text: 'bird', phonics: '/bɜːrd/', meaning: '小鸟' },
  { text: 'ball', phonics: '/bɔːl/', meaning: '球' },
  { text: 'milk', phonics: '/mɪlk/', meaning: '牛奶' },
];

/** 由标题派生一个稳定的调色板下标（相同标题总得同一颜色）。 */
function colorFor(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** 为某节构造 `wordsPerLesson` 个节内不重复单词，并随机布置 `correctIndex`。 */
function buildGenericWords(wordsPerLesson: number, salt: number) {
  const words: ReturnType<typeof pickWords> = pickWords(wordsPerLesson, salt);
  return words.map((w) => {
    const distractors = WORD_POOL.filter((p) => p.text !== w.text)
      .map((p) => p.text)
      .sort(() => 0.5 - Math.random()) // 干扰项打乱
      .slice(0, 3);
    const options = [w.text, ...distractors];
    // Fisher–Yates 轻量洗牌，确保正确项位置随机但确定可达
    for (let i = options.length - 1; i > 0; i--) {
      const j = (salt + i + 1) % (i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    return {
      text: w.text,
      phonics: w.phonics,
      meaning: w.meaning,
      options,
      correctIndex: options.indexOf(w.text),
    };
  });
}

/** 从词池取前 `n` 个（循环复用，节内不重复）。 */
function pickWords(n: number, salt: number) {
  const out: { text: string; phonics: string; meaning: string }[] = [];
  for (let i = 0; i < n; i++) {
    out.push(WORD_POOL[(i + salt) % WORD_POOL.length]);
  }
  return out;
}

/**
 * 依据计划推导种子生成一个结构合规的模板课程（AI-801 降级安全网）。
 * @param seed 由 `PlanService.deriveCourseSpec` 产出（week theme / day 标题 / 天数）
 * @param wordsPerLesson 每节单词数（已在 controller 约束 3–8，缺省 5）
 */
export function buildFallbackCoursePlan(
  seed: CourseSpecSeed,
  wordsPerLesson: number,
): CoursePlanSpec {
  const lessons = (seed.dayTitles.length > 0 ? seed.dayTitles : [`${seed.title} Lesson`]).map(
    (title, i) => ({
      title,
      estimatedMinutes: 8,
      words: buildGenericWords(wordsPerLesson, i),
    }),
  );

  return {
    course: {
      title: seed.title,
      description: seed.description,
      icon: 'book',
      color: colorFor(seed.title),
    },
    lessons,
  };
}
