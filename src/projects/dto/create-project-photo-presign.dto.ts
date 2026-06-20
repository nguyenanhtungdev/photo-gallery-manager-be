import { Transform } from 'class-transformer'
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator'

export class CreateProjectPhotoPresignDto {
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(255)
  fileName!: string

  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsString()
  @MaxLength(100)
  contentType!: string

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(30 * 1024 * 1024)
  fileSize!: number
}
