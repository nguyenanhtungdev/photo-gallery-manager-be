import { Transform } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator'

export class UpdateSystemSettingsDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(365)
  paidProjectPhotoRetentionDays?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(23)
  paidProjectPhotoCleanupHour?: number

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(59)
  paidProjectPhotoCleanupMinute?: number

  @IsOptional()
  @IsIn(['all_users', 'selected_users'])
  paidProjectPhotoCleanupTarget?: 'all_users' | 'selected_users'

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  paidProjectPhotoCleanupUserIds?: string[]
}
