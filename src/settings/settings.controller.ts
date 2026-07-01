import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/guards/admin.guard'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ListCleanupJobLogsQueryDto } from './dto/list-cleanup-job-logs-query.dto'
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto'
import { SettingsService } from './settings.service'

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings()
  }

  @Patch()
  updateSettings(@Body() updateSystemSettingsDto: UpdateSystemSettingsDto) {
    return this.settingsService.updateSettings(updateSystemSettingsDto)
  }

  @Get('cleanup-logs')
  listCleanupJobLogs(@Query() query: ListCleanupJobLogsQueryDto) {
    return this.settingsService.listCleanupJobLogs(query)
  }
}
