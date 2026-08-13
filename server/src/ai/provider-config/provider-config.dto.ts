import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  IsObject,
  IsUrl,
  MaxLength,
} from 'class-validator';

export type ProviderTypeDto = 'openai-compatible' | 'mock';
export type ProviderCapabilityDto = 'chat' | 'vision' | 'stt' | 'tts' | 'pronunciation';

/** 前端传参用模型映射（均可选）。 */
export class ProviderModelsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  chat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vision?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tts?: string;
}

/** 新增 provider 配置。 */
export class CreateProviderConfigDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsIn(['openai-compatible', 'mock'])
  type: ProviderTypeDto;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  /** 明文 key（后端加密落库）；mock 可空。 */
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsObject()
  models?: ProviderModelsDto;

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

  /** 传则更新（重新加密）；省略则不改动原 key。 */
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsObject()
  models?: ProviderModelsDto;

  @IsOptional()
  @IsArray()
  @IsIn(['chat', 'vision', 'stt', 'tts', 'pronunciation'], { each: true })
  capabilities?: ProviderCapabilityDto[];
}
