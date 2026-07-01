import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from '../auth/auth.module'
import { AdminGuard } from '../auth/guards/admin.guard'
import { SettingsController } from './settings.controller'
import { SettingsGateway } from './settings.gateway'
import { SettingsService } from './settings.service'

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsGateway, AdminGuard],
  exports: [SettingsService, SettingsGateway],
})
export class SettingsModule {}
