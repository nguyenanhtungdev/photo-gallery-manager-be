import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { StorageService } from '../storage/storage.service'

@Module({
  imports: [ConfigModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, StorageService],
})
export class ProjectsModule {}
