import { Transform } from 'class-transformer'
import { IsIn, IsOptional } from 'class-validator'

export class UpdateUserSettingsDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === null || value === '' ? null : Number(value)))
  @IsIn([120, 360, 480, 720, null])
  imageResizeWidth?: 120 | 360 | 480 | 720 | null
}
