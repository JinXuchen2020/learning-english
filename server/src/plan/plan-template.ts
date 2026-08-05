import { GeneratePlanDto, PlanLevel } from './dto/generate-plan.dto';
import { GeneratedPlan, PlanDay, PlanLesson, PlanWeek } from './plan.types';
import { StudyPlanSkillType } from './study-plan.entity';

/**
 * 内置模板计划（AI-205）：3 套按 dailyMinutes 档位的静态周计划 + 降级安全网。
 *
 * 三档（见 resolveTier + TIER_* 边界）：
 *  - short（轻量，≤15min）：每日 1 主课 + 1 口语（2 节）。
 *  - standard（标准，16-45min）：每日 1 主课 + 2 复习 + 1 口语（4 节）—— AI-204 默认结构。
 *  - extended（强化，≥46min）：每日 1 主课 + 3 复习 + 1 口语（5 节）。
 *
 * 当 LLM 输出连续 3 次校验失败（AI-204 降级）或用户主动选择模板（AI-205, useTemplate）时，
 * 经本模块产出结构合规、可渲染的计划。不依赖 LLM / 不引用真实 id（存在性校验随目录
 * 注入属 AI-206）。每日结构对齐 AI-203 提示词约定：主课随四技能循环交错，复习+口语补齐。
 */

export const DAYS_PER_WEEK = 7;
const SKILL_CYCLE: StudyPlanSkillType[] = ['vocab', 'listen', 'speak', 'write'];

/** 每日可用时长档位（AI-205）。 */
export type PlanTier = 'short' | 'standard' | 'extended';

/** 档位边界（分钟）。≤ SHORT_MAX → 轻量；≤ STANDARD_MAX → 标准；否则强化。 */
export const TIER_SHORT_MAX = 15;
export const TIER_STANDARD_MAX = 45;

/**
 * 依每日可用时长解析模板档位。
 * @param dailyMinutes 经 class-validator 约束为 [5,120] 的整数
 */
export function resolveTier(dailyMinutes: number): PlanTier {
  if (dailyMinutes <= TIER_SHORT_MAX) return 'short';
  if (dailyMinutes <= TIER_STANDARD_MAX) return 'standard';
  return 'extended';
}

/** 主题词（默认 a1）。融合首选兴趣与等级。 */
function themeWord(level: PlanLevel, interests: string[]): string {
  const base = interests && interests.length > 0 ? interests[0] : '动物';
  const suffix: Record<PlanLevel, string> = {
    'pre-a1': 'Hello',
    a1: 'Fun',
    a2: 'Explore',
  };
  return `${suffix[level] ?? 'Fun'} ${base}`;
}

/** 每日「固定补充课」插槽（复习/口语）；主课单独拼装以支持四技能日循环。 */
interface LessonSlot {
  type: NonNullable<PlanLesson['type']>;
  skillType: StudyPlanSkillType;
  title: (theme: string) => string;
}

const REVIEW_SLOTS: LessonSlot[] = [
  { type: 'review', skillType: 'vocab', title: (t) => `复习：昨天的 ${t}` },
  { type: 'review', skillType: 'listen', title: () => `复习：核心句型` },
  { type: 'review', skillType: 'write', title: () => `复习：书写练习` },
  { type: 'speaking', skillType: 'speak', title: (t) => `口语：跟读 ${t}` },
];

/** 依档位选取每日 lesson 序列：主课（当日主技能）+ 档位对应的补充课。 */
function lessonsForTier(
  tier: PlanTier,
  mainSkill: StudyPlanSkillType,
  theme: string,
  dayIndex: number,
): PlanLesson[] {
  const main: PlanLesson = {
    type: 'main',
    title: `主课：${theme}（第 ${dayIndex + 1} 天）`,
    skillType: mainSkill,
  };
  let tail: LessonSlot[];
  switch (tier) {
    case 'short':
      tail = [REVIEW_SLOTS[3]]; // 仅口语
      break;
    case 'standard':
      tail = [REVIEW_SLOTS[0], REVIEW_SLOTS[1], REVIEW_SLOTS[3]]; // 复习 vocab + 复习 listen + 口语
      break;
    case 'extended':
      tail = REVIEW_SLOTS; // 全部 4 节补充
      break;
  }
  return [
    main,
    ...tail.map((s) => ({ type: s.type, title: s.title(theme), skillType: s.skillType })),
  ];
}

function buildDay(dayIndex: number, tier: PlanTier, level: PlanLevel, theme: string): PlanDay {
  const mainSkill = SKILL_CYCLE[dayIndex % SKILL_CYCLE.length]; // 四技能日循环交错
  return {
    day: dayIndex + 1,
    skillType: mainSkill,
    title: `${theme} · 第 ${dayIndex + 1} 天`,
    lessons: lessonsForTier(tier, mainSkill, theme, dayIndex),
  };
}

function buildWeek(weekIndex: number, dto: GeneratePlanDto, tier: PlanTier): PlanWeek {
  const theme = themeWord(dto.level, dto.interests);
  const days: PlanDay[] = [];
  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    days.push(buildDay(d, tier, dto.level, theme));
  }
  return { week: weekIndex + 1, theme, days };
}

/**
 * 依据 DTO 生成一个结构合规的模板计划（AI-205 tier 选择 + AI-204 降级安全网）。
 * dailyMinutes 决定档位（short/standard/extended），档位决定每日 lesson 数量与技能覆盖。
 * @param dto 经 class-validator 校验后的请求体（useTemplate 路径或 LLM 降级路径均调用）
 */
export function buildFallbackPlan(dto: GeneratePlanDto): GeneratedPlan {
  const tier = resolveTier(dto.dailyMinutes ?? 20);
  const weeksCount = Math.max(1, Math.min(8, dto.weeks || 1));
  const weeks: PlanWeek[] = [];
  for (let w = 0; w < weeksCount; w++) {
    weeks.push(buildWeek(w, dto, tier));
  }
  return { weeks };
}
