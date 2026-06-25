import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Logger, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { Server, Socket } from 'socket.io'
import { AuthService } from '../auth/auth.service'

type SocketTokenPayload = {
  sub: string
  username: string
  email: string
  sessionId: string
  deviceId: string
}

type NotificationSocket = Socket & {
  data: {
    userId?: string
  }
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server

  private readonly logger = new Logger(NotificationsGateway.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: NotificationSocket) {
    try {
      const apiKey = this.getHandshakeValue(client, 'apiKey')
      this.assertApiKey(apiKey)

      const token = this.extractBearerToken(client)
      if (!token) {
        throw new UnauthorizedException('Thiếu access token')
      }

      const payload = await this.jwtService.verifyAsync<SocketTokenPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      })
      const user = await this.authService.validateAccessTokenSession(payload)

      client.data.userId = user.sub
      await client.join(this.getUserRoom(user.sub))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Xác thực socket thất bại'
      this.logger.warn(`Socket rejected: ${message}`)
      client.disconnect(true)
    }
  }

  handleDisconnect(client: NotificationSocket) {
    if (!client.data.userId) {
      return
    }

    void client.leave(this.getUserRoom(client.data.userId))
  }

  emitNotificationCreated(
    ownerId: string,
    payload: {
      notification: Record<string, unknown>
      unreadCount: number
    },
  ) {
    this.server.to(this.getUserRoom(ownerId)).emit('notification.created', payload)
  }

  emitNotificationRead(
    ownerId: string,
    payload: {
      notificationId: string
      readAt: string
      unreadCount: number
    },
  ) {
    this.server.to(this.getUserRoom(ownerId)).emit('notification.read', payload)
  }

  emitAllNotificationsRead(
    ownerId: string,
    payload: {
      readAt: string
      unreadCount: number
    },
  ) {
    this.server.to(this.getUserRoom(ownerId)).emit('notification.all-read', payload)
  }

  private getUserRoom(userId: string) {
    return `user:${userId}`
  }

  private extractBearerToken(client: NotificationSocket) {
    const handshakeToken = this.getHandshakeValue(client, 'token')
    if (handshakeToken) {
      return handshakeToken
    }

    const authorizationHeader = client.handshake.headers.authorization
    if (!authorizationHeader) {
      return null
    }

    const [scheme, token] = authorizationHeader.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null
    }

    return token
  }

  private getHandshakeValue(client: NotificationSocket, key: string) {
    const authValue = client.handshake.auth?.[key]
    if (typeof authValue === 'string' && authValue.trim()) {
      return authValue.trim()
    }

    const queryValue = client.handshake.query?.[key]
    if (typeof queryValue === 'string' && queryValue.trim()) {
      return queryValue.trim()
    }

    const headerValue = client.handshake.headers[key.toLowerCase()]
    if (typeof headerValue === 'string' && headerValue.trim()) {
      return headerValue.trim()
    }

    return null
  }

  private assertApiKey(apiKey: string | null) {
    if (!apiKey) {
      throw new UnauthorizedException('Thiếu API key')
    }

    const expectedKey = this.configService.get<string>('API_KEY')
    if (!expectedKey) {
      throw new UnauthorizedException('API key chưa được cấu hình')
    }

    const isValid =
      apiKey.length === expectedKey.length &&
      timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))

    if (!isValid) {
      throw new UnauthorizedException('API key không hợp lệ')
    }
  }
}
