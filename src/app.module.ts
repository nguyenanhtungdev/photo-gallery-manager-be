import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { AuthModule } from './auth/auth.module'
import { ApiKeyMiddleware } from './common/middleware/api-key.middleware'
import { DatabaseModule } from './database/database.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ProjectsModule } from './projects/projects.module'
import { SettingsModule } from './settings/settings.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    DashboardModule,
    NotificationsModule,
    SettingsModule,
    ProjectsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiKeyMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
