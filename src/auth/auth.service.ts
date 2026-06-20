import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { Error as MongooseError } from 'mongoose'
import type { StringValue } from 'ms'
import { LoginDto } from './dto/login.dto'
import { UserDocument, UserModel } from './models/user.model'
import { RememberedLoginDto } from './dto/remembered-login.dto'
import { RegisterDto } from './dto/register.dto'

type SafeUser = {
  id: string
  name?: string | null
  email: string
  username: string
  createdAt: Date
  updatedAt: Date
}

type AccessTokenPayload = {
  sub: string
  username: string
  email: string
  sessionId: string
  deviceId: string
}

type RememberTokenPayload = {
  type: 'remember_login'
  sub: string
  username: string
  email: string
  sessionId: string
  deviceId: string
}

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async register(registerDto: RegisterDto) {
    const username = registerDto.username.trim().toLowerCase()
    const email = username

    const existingUser = await UserModel.findOne({
      $or: [{ email }, { username }],
    }).exec()

    if (existingUser) {
      if (existingUser.email === email) {
        throw new BadRequestException('Email da ton tai')
      }
      throw new BadRequestException('Ten dang nhap da ton tai')
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10)
    try {
      const user = await UserModel.create({
        name: null,
        email,
        username,
        passwordHash,
      })

      return this.buildAuthResponse(user, {
        deviceId: `register-${randomUUID()}`,
        deviceName: 'register',
        rememberAccount: false,
      })
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const field = Object.keys(error.keyPattern)[0]
        if (field === 'email') {
          throw new BadRequestException('Email da ton tai')
        }
        if (field === 'username') {
          throw new BadRequestException('Ten dang nhap da ton tai')
        }
      }

      throw error
    }
  }

  async login(loginDto: LoginDto) {
    const username = loginDto.username.trim().toLowerCase()
    const user = await UserModel.findOne({ username }).exec()

    if (!user) {
      throw new UnauthorizedException('Sai ten dang nhap hoac mat khau')
    }

    const passwordMatches = await bcrypt.compare(loginDto.password, user.passwordHash)
    if (!passwordMatches) {
      throw new UnauthorizedException('Sai ten dang nhap hoac mat khau')
    }

    return this.buildAuthResponse(user, {
      deviceId: loginDto.deviceId,
      deviceName: loginDto.deviceName,
      rememberAccount: loginDto.rememberAccount !== false,
    })
  }

  async loginWithRememberToken(rememberedLoginDto: RememberedLoginDto) {
    const payload = await this.verifyRememberToken(rememberedLoginDto.rememberToken)

    if (payload.type !== 'remember_login') {
      throw new UnauthorizedException('Remember token khong hop le')
    }

    if (payload.deviceId !== rememberedLoginDto.deviceId) {
      throw new UnauthorizedException('Thiet bi khong khop voi phien da luu')
    }

    const user = await UserModel.findById(payload.sub).exec()
    if (!user) {
      throw new UnauthorizedException('Nguoi dung khong hop le')
    }

    const rememberedSession = (user.rememberedLogins ?? []).find(
      (item) => item.sessionId === payload.sessionId && item.deviceId === rememberedLoginDto.deviceId,
    )

    if (!rememberedSession) {
      throw new UnauthorizedException('Phien dang nhap da luu khong con hop le')
    }

    rememberedSession.lastUsedAt = new Date()
    await user.save()

    return this.buildAuthResponse(user, {
      deviceId: rememberedLoginDto.deviceId,
      deviceName: rememberedSession.deviceName,
      rememberAccount: true,
    })
  }

  async getProfile(userId: string) {
    const user = await UserModel.findById(userId).exec()

    if (!user) {
      throw new UnauthorizedException('Nguoi dung khong hop le')
    }

    return {
      user: this.toSafeUser(user),
    }
  }

  async validateAccessTokenSession(payload: AccessTokenPayload) {
    const user = await UserModel.findById(payload.sub).exec()
    if (!user) {
      throw new UnauthorizedException('Nguoi dung khong hop le')
    }

    const currentSession = user.currentSession
    const isSessionMismatch =
      !currentSession?.sessionId ||
      currentSession.sessionId !== payload.sessionId ||
      currentSession.deviceId !== payload.deviceId

    if (isSessionMismatch) {
      throw new UnauthorizedException('Phien dang nhap da het hieu luc')
    }

    return payload
  }

  private async buildAuthResponse(
    user: UserDocument,
    options: {
      deviceId: string
      deviceName?: string
      rememberAccount: boolean
    },
  ) {
    const sessionId = randomUUID()
    const deviceName = options.deviceName?.trim() || 'Unknown Device'

    user.currentSession = {
      sessionId,
      deviceId: options.deviceId,
      deviceName,
      loggedInAt: new Date(),
    }

    if (options.rememberAccount) {
      user.rememberedLogins = [
        ...(user.rememberedLogins ?? []).filter((item) => item.deviceId !== options.deviceId),
        {
          sessionId,
          deviceId: options.deviceId,
          deviceName,
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
      ]
    } else {
      user.rememberedLogins = (user.rememberedLogins ?? []).filter(
        (item) => item.deviceId !== options.deviceId,
      )
    }

    await user.save()

    const safeUser = this.toSafeUser(user)
    const accessTokenPayload: AccessTokenPayload = {
      sub: user._id.toString(),
      username: user.username,
      email: user.email,
      sessionId,
      deviceId: options.deviceId,
    }
    const accessToken = await this.jwtService.signAsync(accessTokenPayload)

    const response: {
      accessToken: string
      rememberToken?: string
      user: SafeUser
    } = {
      accessToken,
      user: safeUser,
    }

    if (options.rememberAccount) {
      const rememberTokenPayload: RememberTokenPayload = {
        ...accessTokenPayload,
        type: 'remember_login',
      }
      response.rememberToken = await this.jwtService.signAsync(rememberTokenPayload, {
        secret: process.env.JWT_REMEMBER_SECRET ?? process.env.JWT_SECRET ?? 'dev-secret-change-me',
        expiresIn:
          (process.env.JWT_REMEMBER_EXPIRES_IN as StringValue | undefined) ?? '180d',
      })
    }

    return response
  }

  private toSafeUser(user: UserDocument): SafeUser {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }

  private isDuplicateKeyError(
    error: unknown,
  ): error is MongooseError & { code: 11000; keyPattern: Record<string, number> } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000 &&
      'keyPattern' in error
    )
  }

  private async verifyRememberToken(rememberToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<RememberTokenPayload>(rememberToken, {
        secret: process.env.JWT_REMEMBER_SECRET ?? process.env.JWT_SECRET ?? 'dev-secret-change-me',
      })
      return payload
    } catch {
      throw new UnauthorizedException('Remember token khong hop le hoac da het han')
    }
  }
}
