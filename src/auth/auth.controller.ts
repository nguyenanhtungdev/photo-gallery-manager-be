import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { ConfirmForgotPasswordCodeDto } from './dto/confirm-forgot-password-code.dto'
import { ConfirmPasswordChangeCodeDto } from './dto/confirm-password-change-code.dto'
import { ConfirmRegisterCodeDto } from './dto/confirm-register-code.dto'
import { LoginDto } from './dto/login.dto'
import { RememberedLoginDto } from './dto/remembered-login.dto'
import { RegisterDto } from './dto/register.dto'
import { RequestForgotPasswordCodeDto } from './dto/request-forgot-password-code.dto'
import { RequestPasswordChangeCodeDto } from './dto/request-password-change-code.dto'
import { RequestRegisterCodeDto } from './dto/request-register-code.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RequestRegisterCodeDto) {
    return this.authService.register(registerDto)
  }

  @Post('register/confirm')
  confirmRegister(@Body() confirmDto: ConfirmRegisterCodeDto) {
    return this.authService.confirmRegisterVerification(confirmDto)
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto)
  }

  @Post('remembered-login')
  rememberedLogin(@Body() rememberedLoginDto: RememberedLoginDto) {
    return this.authService.loginWithRememberToken(rememberedLoginDto)
  }

  @Post('forgot-password')
  requestForgotPassword(@Body() dto: RequestForgotPasswordCodeDto) {
    return this.authService.requestForgotPasswordVerification(dto)
  }

  @Post('forgot-password/confirm')
  confirmForgotPassword(@Body() dto: ConfirmForgotPasswordCodeDto) {
    return this.authService.confirmForgotPasswordVerification(dto)
  }

  @UseGuards(JwtAuthGuard)
  @Post('password-change')
  requestPasswordChange(
    @Request() req: { user: { sub: string } },
    @Body() dto: RequestPasswordChangeCodeDto,
  ) {
    return this.authService.requestPasswordChangeVerification(req.user.sub, dto)
  }

  @UseGuards(JwtAuthGuard)
  @Post('password-change/confirm')
  confirmPasswordChange(
    @Request() req: { user: { sub: string } },
    @Body() dto: ConfirmPasswordChangeCodeDto,
  ) {
    return this.authService.confirmPasswordChangeVerification(req.user.sub, dto)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: { user: { sub: string } }) {
    return this.authService.getProfile(req.user.sub)
  }
}
