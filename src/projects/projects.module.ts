import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { StorageService } from '../storage/storage.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { SettingsModule } from '../settings/settings.module'
import { ProjectShareGateway } from './project-share.gateway'
import { ProjectPhotoCleanupService } from './project-photo-cleanup.service'

@Module({
  imports: [ConfigModule, NotificationsModule, SettingsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, StorageService, ProjectShareGateway, ProjectPhotoCleanupService],
})
export class ProjectsModule {}
