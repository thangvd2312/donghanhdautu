import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import type {
  GroupTargets,
  PortfolioAlertKind,
  PortfolioAlertPreviewRequest,
  PortfolioAlertRuleRequest,
} from '@dautu/contracts';
import { ALERT_KINDS } from '../rule-config';

export class RuleDto implements PortfolioAlertRuleRequest {
  @IsBoolean() enabled!: boolean;
  @IsNumber() thresholdPct!: number;
  @IsOptional() @IsInt() windowDays?: number | null;
  @IsOptional() @IsObject() targets?: GroupTargets | null;
  @IsInt() cooldownDays!: number;
}

export class PreviewRuleDto extends RuleDto {
  @IsIn(ALERT_KINDS) kind!: PortfolioAlertKind;
}

export class PreviewDto implements PortfolioAlertPreviewRequest {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ALERT_KINDS.length)
  @ValidateNested({ each: true })
  @Type(() => PreviewRuleDto)
  rules?: PreviewRuleDto[];
}
