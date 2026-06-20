import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsString()
  @MaxLength(100)
  username!: string

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  deviceId!: string

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MaxLength(200)
  deviceName?: string

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  rememberAccount?: boolean
}
