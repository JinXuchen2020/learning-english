import { GeneratePlanDto, PlanLevel } from './dto/generate-plan.dto';
import { GeneratedPlan, PlanDay, PlanLesson, PlanWeek } from './plan.types';
import { StudyPlanSkillType } from './study-plan.entity';

/**
 * 内置兜底模板计划（AI-204 降级安全网）。
 *
 * 当 LLM 输出连续 3 次校验失败时使用，保证前端永远拿到「可渲染的有效结构」而非半成品。
 * 仅产出**最小合规结构**（不依赖 LLM / 不引用真实 id，courseId/lessonId 留空，存在性
 * 校验随目录注入属 AI-206）。「3 套按 dailyMinutes 档位的静态周计划 + 用户可选模板生成」
 * 属 AI-205，本函数是其紧急降级子集，二者不冲突。
 *
 * 每日结构对齐 AI-203 提示词约定：1 main + 2 review + 1 speaking。
 */

const DAYS_PER_WEEK = 7;
const SKILL_CYCLE: StudyPlanSkillType[] = ['vocab', 'listen', 'speak', 'write'];

/** 按等级映射一个适龄英文主题词（默认 a1）。 */
function themeWord(level: PlanLevel, interests: string[]): string {
  const base = interests && interests.length > 0 ? interests[0] : '动物';
  const suffix: Record<PlanLevel, string> = {
    'pre-a1': 'Hello',
    a1: 'Fun',
    a2: 'Explore',
  };
  return `${suffix[level] ?? 'Fun'} ${base}`;
}

function buildDay(dayIndex: number, level: PlanLevel, theme: string): PlanDay {
  const mainSkill = SKILL_CYCLE[dayIndex % SKILL_CYCLE.length];
  const lessons: PlanLesson[] = [
    { type: 'main', title: `主课：${theme}（第 ${dayIndex + 1} 天）`, skillType: mainSkill },
    { type: 'review', title: `复习：昨天的 ${theme}`, skillType: 'vocab' },
    { type: 'review', title: `复习：核心句型`, skillType: 'listen' },
    { type: 'speaking', title: `口语：跟读 ${theme}`, skillType: 'speak' },
  ];
  return {
    day: dayIndex + 1,
    skillType: mainSkill,
    title: `${theme} · 第 ${dayIndex + 1} 天`,
    lessons,
  };
}

function buildWeek(weekIndex: number, dto: GeneratePlanDto): PlanWeek {
  const theme = themeWord(dto.level, dto.interests);
  const days: PlanDay[] = [];
  for (let d = 0; d < DAYS_PER_WEEK; d++) {
    days.push(buildDay(d, dto.level, theme));
  }
  return { week: weekIndex + 1, theme, days };
}

/**
 * 依据 DTO 生成一个结构合规的兜底周计划。
 * @param dto 经 class-validator 校验后的请求体
 */
export function buildFallbackPlan(dto: GeneratePlanDto): GeneratedPlan {
  const weeksCount = Math.max(1, Math.min(8, dto.weeks || 1));
  const weeks: PlanWeek[] = [];
  for (let w = 0; w < weeksCount; w++) {
    weeks.push(buildWeek(w, dto));
  }
  return { weeks };
}
