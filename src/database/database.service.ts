import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import dns from 'node:dns/promises'
import mongoose from 'mongoose'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    if (mongoose.connection.readyState === 1) {
      return
    }

    const mongoUri =
      this.configService.get<string>('MONGO_URI') ??
      this.configService.get<string>('DATABASE_URL')

    if (!mongoUri) {
      throw new Error('Missing MONGO_URI or DATABASE_URL in environment variables')
    }

    dns.setServers(['1.1.1.1', '8.8.8.8'])

    const connection = await mongoose.connect(mongoUri)
    this.logger.log(`MongoDB connected: ${connection.connection.host}`)
  }

  async onModuleDestroy() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
  }
}
