import { Transform } from 'class-transformer'
import { IsString, Length, MaxLength } from 'class-validator'

export class ConfirmPasswordChangeCodeDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MaxLength(100)
  verificationId!: string

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Length(6, 6)
  code!: string
}
