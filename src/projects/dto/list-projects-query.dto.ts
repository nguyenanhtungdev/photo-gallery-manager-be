import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

function toOptionalTrimmedString(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : undefined
}

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  return Number(value)
}

export class ListProjectsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(200)
  q?: string

  @IsOptional()
  @IsIn(['waiting_payment', 'paid', 'cancelled'])
  status?: 'waiting_payment' | 'paid' | 'cancelled'

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(0)
  offset?: number

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number

  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  dateFrom?: string

  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  dateTo?: string
}
