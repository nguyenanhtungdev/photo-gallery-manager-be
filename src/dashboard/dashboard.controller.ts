import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/guards/admin.guard'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UserRole } from '../auth/models/user.model'
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto'
import { DashboardService } from './dashboard.service'

type AuthenticatedRequest = {
  user: {
    sub: string
    role: UserRole
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

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/overview')
  getAdminOverview() {
    return this.dashboardService.getAdminOverview()
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/users')
  listAdminUsers(@Query() query: ListAdminUsersQueryDto) {
    return this.dashboardService.listAdminUsers(query)
  }
}
