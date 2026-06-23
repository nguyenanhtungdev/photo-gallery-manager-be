import { Transform } from 'class-transformer'
import { IsString, Length, MaxLength, MinLength } from 'class-validator'

export class ConfirmForgotPasswordCodeDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MaxLength(100)
  verificationId!: string

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Length(6, 6)
  code!: string

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword!: string
}
