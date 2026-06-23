import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { ApiKeyMiddleware } from './common/middleware/api-key.middleware'
import { DatabaseModule } from './database/database.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ProjectsModule } from './projects/projects.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    DashboardModule,
    NotificationsModule,
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
