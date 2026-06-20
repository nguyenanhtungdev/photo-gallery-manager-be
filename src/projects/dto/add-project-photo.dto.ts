import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class AddProjectPhotoDto {
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(255)
  key!: string

  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(255)
  filename!: string

  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsString()
  @MaxLength(100)
  contentType!: string

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(30 * 1024 * 1024)
  fileSize!: number

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(20000)
  width?: number

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(20000)
  height?: number
}
