import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { StorageService } from '../storage/storage.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { ProjectShareGateway } from './project-share.gateway'

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, StorageService, ProjectShareGateway],
})
export class ProjectsModule {}
