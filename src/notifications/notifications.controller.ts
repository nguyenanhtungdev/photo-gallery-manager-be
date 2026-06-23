import { Controller, Get, Param, Patch, Query, Request, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto'
import { NotificationsService } from './notifications.service'

type AuthenticatedRequest = {
  user: {
    sub: string
  }
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Request() req: AuthenticatedRequest, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.list(req.user.sub, query)
  }

  @Patch('read-all')
  markAllAsRead(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user.sub)
  }

  @Patch(':id/read')
  markAsRead(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.sub, id)
  }
}
