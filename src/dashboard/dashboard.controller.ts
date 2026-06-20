import { Controller, Get, Request, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { DashboardService } from './dashboard.service'

type AuthenticatedRequest = {
  user: {
    sub: string
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  getOverview(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getOverview(req.user.sub)
  }
}
