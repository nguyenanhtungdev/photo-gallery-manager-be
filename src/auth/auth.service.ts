import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { Error as MongooseError } from 'mongoose'
import { LoginDto } from './dto/login.dto'
import { UserDocument, UserModel } from './models/user.model'
import { RegisterDto } from './dto/register.dto'

type SafeUser = {
  id: string
  name?: string | null
  email: string
  username: string
  createdAt: Date
  updatedAt: Date
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

      return this.buildAuthResponse(user)
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

    return this.buildAuthResponse(user)
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

  private async buildAuthResponse(user: UserDocument) {
    const safeUser = this.toSafeUser(user)
    const accessToken = await this.jwtService.signAsync({
      sub: user._id.toString(),
      username: user.username,
      email: user.email,
    })

    return {
      accessToken,
      user: safeUser,
    }
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
}
