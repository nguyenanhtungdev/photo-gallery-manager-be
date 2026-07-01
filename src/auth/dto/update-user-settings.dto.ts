import { Transform, Type } from 'class-transformer'
import { IsIn, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'

export class WatermarkSettingsDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : String(value).trim()))
  @IsString()
  @MaxLength(80)
  text?: string

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0.1)
  @Max(1)
  opacity?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0.5)
  @Max(3)
  textScale?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(-180)
  @Max(180)
  rotationDegrees?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(1)
  @Max(6)
  textsPerLine?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(1)
  @Max(5)
  lineCount?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0.05)
  @Max(0.95)
  customX?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0.05)
  @Max(0.95)
  customY?: number

  @IsOptional()
  @IsIn(['bottom-corners', 'top-corners', 'all-corners', 'center', 'diagonal', 'custom'])
  position?: 'bottom-corners' | 'top-corners' | 'all-corners' | 'center' | 'diagonal' | 'custom'

  @IsOptional()
  @IsIn(['light', 'dark', 'outline', 'badge'])
  style?: 'light' | 'dark' | 'outline' | 'badge'
}

export class UpdateUserSettingsDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === null || value === '' ? null : String(value).trim()))
  @IsString()
  @MaxLength(120)
  name?: string | null

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === null || value === '' ? null : String(value).trim()))
  @IsString()
  @MaxLength(30)
  phone?: string | null

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === null || value === '' ? null : Number(value)))
  @IsIn([120, 360, 480, 720, null])
  imageResizeWidth?: 120 | 360 | 480 | 720 | null

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === null || value === '' ? null : String(value).trim()))
  @IsString()
  @MaxLength(500)
  avatarKey?: string | null

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WatermarkSettingsDto)
  watermarkSettings?: WatermarkSettingsDto
}
