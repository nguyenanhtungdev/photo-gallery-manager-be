import { Transform } from 'class-transformer'
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class LoginDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsEmail()
  @MaxLength(100)
  username!: string

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string
}
