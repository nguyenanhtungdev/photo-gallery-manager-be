import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)
  const frontendUrl = configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
  const port = Number(configService.get<string>('PORT') ?? 3001)

  app.setGlobalPrefix('api')
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  await app.listen(port)
  console.log(`Auth API is running on http://localhost:${port}/api`)
}

void bootstrap()
