import { Injectable, NestMiddleware } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NextFunction, Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'OPTIONS') {
      next()
      return
    }

    const apiKey = req.header('x-api-key')
    if (!apiKey) {
      res.status(401).json({ message: 'Thiếu API key' })
      return
    }

    const expectedKey = this.configService.get<string>('API_KEY')
    if (!expectedKey) {
      res.status(500).json({ message: 'API key chưa được cấu hình' })
      return
    }

    const isValid =
      apiKey.length === expectedKey.length &&
      timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))

    if (!isValid) {
      res.status(403).json({ message: 'API key không hợp lệ' })
      return
    }

    next()
  }
}
