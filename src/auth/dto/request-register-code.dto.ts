import { Transform } from 'class-transformer'
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class RequestRegisterCodeDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsEmail()
  username!: string

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string
}
