import { Transform } from 'class-transformer'
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator'

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  return Number(value)
}

export class UpdateProjectStatusDto {
  @IsIn(['waiting_payment', 'paid', 'cancelled'])
  status!: 'waiting_payment' | 'paid' | 'cancelled'

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(0)
  paidAmount?: number
}
