import { Transform } from 'class-transformer'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

function trimText(value: unknown) {
  return String(value).trim()
}

function trimOptionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}

export class UpdateProjectDto {
  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(0)
  @MaxLength(150)
  name?: string

  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientName!: string

  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  clientPhone!: string

  @IsOptional()
  @Transform(({ value }) => trimOptionalText(value))
  @IsString()
  @MaxLength(500)
  notes?: string
}
