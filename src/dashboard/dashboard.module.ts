import { Module } from '@nestjs/common'
import { AdminGuard } from '../auth/guards/admin.guard'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, AdminGuard],
})
export class DashboardModule {}
