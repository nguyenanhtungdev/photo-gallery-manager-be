import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class RememberedLoginDto {
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  rememberToken!: string

  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  deviceId!: string
}
