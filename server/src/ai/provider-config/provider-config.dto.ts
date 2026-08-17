import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  IsObject,
  IsUrl,
  MaxLength,
} from 'class-validator';

export type ProviderTypeDto = 'openai-compatible';
export type ProviderCapabilityDto = 'chat' | 'vision' | 'stt' | 'tts' | 'pronunciation';

/** 新增 provider 配置。 */
export class CreateProviderConfigDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsIn(['openai-compatible'])
  type: ProviderTypeDto;

  /** 模型名称（必填）。能力验证基于此模型真发请求，如 gpt-4o / tts-1 / whisper-1。 */
  @IsString()
  @MaxLength(120)
  model: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  /** 明文 key（后端加密落库）；创建/修改均可选，前端 UI 要求填写。 */
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsObject()
  extraBody?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsIn(['chat', 'vision', 'stt', 'tts', 'pronunciation'], { each: true })
  capabilities?: ProviderCapabilityDto[];
}

/** 修改 provider 配置；apiKey 可空表示不修改。 */
export class UpdateProviderConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  /** 更换模型（可选）；传则重新验证能力。 */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  /** 传则更新（重新加密）；省略则不改动原 key。 */
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsObject()
  extraBody?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsIn(['chat', 'vision', 'stt', 'tts', 'pronunciation'], { each: true })
  capabilities?: ProviderCapabilityDto[];
}
