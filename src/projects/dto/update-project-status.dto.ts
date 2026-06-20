import { IsIn } from 'class-validator'

export class UpdateProjectStatusDto {
  @IsIn(['waiting_payment', 'paid'])
  status!: 'waiting_payment' | 'paid'
}
