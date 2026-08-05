import {
  IsUUID,
  IsString,
  IsIn,
  IsInt,
  IsArray,
  IsNotEmpty,
  ArrayNotEmpty,
  ArrayMaxSize,
  MaxLength,
  Min,
  Max,
  Matches,
  IsOptional,
  IsBoolean,
} from 'class-validator';

/**
 * 学习计划等级（与 `docs/ai-integration.md` 表单「当前等级(Pre-A1→A2)」对齐）。
 * 用作 `GeneratePlanDto.level` 的枚举校验与提示词注入。
 */
export const PLAN_LEVELS = ['pre-a1', 'a1', 'a2'] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

/** 年龄段格式：两位以内数字用连字符连接，如 `6-8`、`11-13`。 */
const AGE_RANGE_PATTERN = /^\d{1,2}-\d{1,2}$/;

/**
 * `POST /api/ai/plan/generate` 请求体（AI-202）。
 *
 * 字段与 `docs/ai-integration.md` 后端契约一致：`childId, ageRange, level,
 * dailyMinutes, interests, weeks`。全部经 class-validator 校验，配合全局
 * `ValidationPipe`(whitelist+transform+forbidNonWhitelisted) 实现「非法入参 400」。
 */
export class GeneratePlanDto {
  /** 孩子用户 ID（users 表 uuid）。 */
  @IsUUID('4')
  childId: string;

  /** 年龄段，格式 `lo-hi`，如 `6-8`。 */
  @IsString()
  @IsNotEmpty()
  @Matches(AGE_RANGE_PATTERN, { message: 'ageRange 须为 "lo-hi" 格式，如 "6-8"' })
  ageRange: string;

  /** 当前英语等级（Pre-A1→A2）。 */
  @IsIn(PLAN_LEVELS as readonly string[])
  level: PlanLevel;

  /** 每日可用学习时长（分钟）。 */
  @IsInt()
  @Min(5)
  @Max(120)
  dailyMinutes: number;

  /** 兴趣标签（动物/太空/水果…），至少 1 个。 */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  interests: string[];

  /** 计划周期（周），表单 1-4 周。 */
  @IsInt()
  @Min(1)
  @Max(4)
  weeks: number;

  /** 可选：前端透传的额外上下文（如设备/场景），不参与生成逻辑。 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * 可选：跳过 LLM，直接生成内置模板计划（AI-205）。
   * 为 `true` 时 `PlanService` 不调用 `AiProvider.chat`，返回 `model:'template'`、
   * `degraded:false` 的静态周计划——用于无 LLM key / 离线环境，或用户主动选模板。
   * 缺省（undefined）则照常走 LLM + 重试 + 降级流程（AI-202/AI-204）。
   */
  @IsOptional()
  @IsBoolean()
  useTemplate?: boolean;
}
