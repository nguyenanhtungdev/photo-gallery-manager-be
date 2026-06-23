import { Transform } from 'class-transformer'
import { IsEmail } from 'class-validator'

export class RequestForgotPasswordCodeDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsEmail()
  email!: string
}
