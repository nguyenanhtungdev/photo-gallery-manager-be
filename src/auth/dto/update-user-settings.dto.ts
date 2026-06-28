import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateUserSettingsDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === null || value === '' ? null : Number(value)))
  @IsIn([120, 360, 480, 720, null])
  imageResizeWidth?: 120 | 360 | 480 | 720 | null

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === null || value === '' ? null : String(value).trim()))
  @IsString()
  @MaxLength(500)
  avatarKey?: string | null
}
