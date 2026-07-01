import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { Error as MongooseError } from "mongoose";
import type { StringValue } from "ms";
import { StorageService } from "../storage/storage.service";
import { CreateAvatarUploadDto } from "./dto/create-avatar-upload.dto";
import { LoginDto } from "./dto/login.dto";
import { ConfirmForgotPasswordCodeDto } from "./dto/confirm-forgot-password-code.dto";
import {
  EmailVerificationModel,
  EmailVerificationPurpose,
} from "./models/email-verification.model";
import {
  UserDocument,
  UserModel,
  UserRole,
  WatermarkPosition,
  WatermarkSettings,
  WatermarkStyle,
} from "./models/user.model";
import { RememberedLoginDto } from "./dto/remembered-login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RequestForgotPasswordCodeDto } from "./dto/request-forgot-password-code.dto";
import { RequestRegisterCodeDto } from "./dto/request-register-code.dto";
import { ConfirmRegisterCodeDto } from "./dto/confirm-register-code.dto";
import { RequestPasswordChangeCodeDto } from "./dto/request-password-change-code.dto";
import { ConfirmPasswordChangeCodeDto } from "./dto/confirm-password-change-code.dto";
import { MailService } from "./mail.service";
import { UpdateUserSettingsDto } from "./dto/update-user-settings.dto";

type SafeUser = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email: string;
  username: string;
  role: UserRole;
  avatarUrl: string | null;
  imageResizeWidth: 120 | 360 | 480 | 720 | null;
  watermarkSettings: WatermarkSettings;
  createdAt: Date;
  updatedAt: Date;
};

const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  text: "kim cảnh · 0867177174",
  opacity: 0.4,
  textScale: 1,
  rotationDegrees: 0,
  textsPerLine: 1,
  lineCount: 1,
  customX: 0.5,
  customY: 0.5,
  position: "all-corners",
  style: "light",
};

type AccessTokenPayload = {
  sub: string;
  username: string;
  email: string;
  sessionId: string;
  deviceId: string;
};

type AuthenticatedUser = AccessTokenPayload & {
  role: UserRole;
};

type RememberTokenPayload = {
  type: "remember_login";
  sub: string;
  username: string;
  email: string;
  sessionId: string;
  deviceId: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly storageService: StorageService,
  ) {}

  async register(registerDto: RegisterDto) {
    return this.requestRegisterVerification({
      username: registerDto.username,
      password: registerDto.password,
    });
  }

  async requestRegisterVerification(registerDto: RequestRegisterCodeDto) {
    const username = registerDto.username.trim().toLowerCase();
    const email = username;

    const existingUser = await UserModel.findOne({
      $or: [{ email }, { username }],
    }).exec();

    if (existingUser) {
      if (existingUser.email === email) {
        throw new BadRequestException("Email đã tồn tại");
      }
      throw new BadRequestException("Tên đăng nhập đã tồn tại");
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);
    return this.createEmailVerification({
      purpose: "register",
      email,
      payload: {
        username,
        passwordHash,
      },
      subject: "Xác minh đăng ký tài khoản",
      purposeLabel: "đăng ký tài khoản",
    });
  }

  async confirmRegisterVerification(confirmDto: ConfirmRegisterCodeDto) {
    const verification = await this.verifyEmailCode({
      verificationId: confirmDto.verificationId,
      code: confirmDto.code,
      purpose: "register",
    });

    const username = verification.payload.username?.trim().toLowerCase();
    const passwordHash = verification.payload.passwordHash;

    if (!username || !passwordHash) {
      throw new BadRequestException("Mã xác minh không hợp lệ");
    }

    const email = verification.email;
    const existingUser = await UserModel.findOne({
      $or: [{ email }, { username }],
    }).exec();
    if (existingUser) {
      throw new BadRequestException("Tài khoản đã tồn tại");
    }

    try {
      const user = await UserModel.create({
        name: null,
        email,
        username,
        role: "user",
        passwordHash,
      });

      verification.consumedAt = new Date();
      await verification.save();

      return this.buildAuthResponse(user, {
        deviceId: `register-${randomUUID()}`,
        deviceName: "register",
        rememberAccount: false,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const field = Object.keys(error.keyPattern)[0];
        if (field === "email") {
          throw new BadRequestException("Email đã tồn tại");
        }
        if (field === "username") {
          throw new BadRequestException("Tên đăng nhập đã tồn tại");
        }
      }

      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const username = loginDto.username.trim().toLowerCase();
    const user = await UserModel.findOne({ username }).exec();

    if (!user) {
      throw new UnauthorizedException("Sai tên đăng nhập hoặc mật khẩu");
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException("Sai tên đăng nhập hoặc mật khẩu");
    }

    return this.buildAuthResponse(user, {
      deviceId: loginDto.deviceId,
      deviceName: loginDto.deviceName,
      rememberAccount: loginDto.rememberAccount !== false,
    });
  }

  async loginWithRememberToken(rememberedLoginDto: RememberedLoginDto) {
    const payload = await this.verifyRememberToken(
      rememberedLoginDto.rememberToken,
    );

    if (payload.type !== "remember_login") {
      throw new UnauthorizedException("Remember token không hợp lệ");
    }

    if (payload.deviceId !== rememberedLoginDto.deviceId) {
      throw new UnauthorizedException("Thiết bị không khớp với phiên đã lưu");
    }

    const user = await UserModel.findById(payload.sub).exec();
    if (!user) {
      throw new UnauthorizedException("Người dùng không hợp lệ");
    }

    const rememberedSession = (user.rememberedLogins ?? []).find(
      (item) =>
        item.sessionId === payload.sessionId &&
        item.deviceId === rememberedLoginDto.deviceId,
    );

    if (!rememberedSession) {
      throw new UnauthorizedException(
        "Phiên đăng nhập đã lưu không còn hợp lệ",
      );
    }

    rememberedSession.lastUsedAt = new Date();
    await user.save();

    return this.buildAuthResponse(user, {
      deviceId: rememberedLoginDto.deviceId,
      deviceName: rememberedSession.deviceName,
      rememberAccount: true,
    });
  }

  async requestForgotPasswordVerification(dto: RequestForgotPasswordCodeDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await UserModel.findOne({ email }).exec();

    if (!user) {
      throw new BadRequestException("Email không tồn tại");
    }

    return this.createEmailVerification({
      purpose: "forgot_password",
      email: user.email,
      userId: user._id.toString(),
      payload: {},
      subject: "Xác minh đặt lại mật khẩu",
      purposeLabel: "đặt lại mật khẩu",
    });
  }

  async confirmForgotPasswordVerification(dto: ConfirmForgotPasswordCodeDto) {
    const verification = await this.verifyEmailCode({
      verificationId: dto.verificationId,
      code: dto.code,
      purpose: "forgot_password",
    });

    const userId = verification.userId?.toString();
    if (!userId) {
      throw new BadRequestException("Mã xác minh không hợp lệ");
    }

    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new BadRequestException("Tài khoản không còn tồn tại");
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.rememberedLogins = [];
    user.currentSession = undefined;
    await user.save();

    verification.consumedAt = new Date();
    await verification.save();

    return {
      message: "Đặt lại mật khẩu thành công",
    };
  }

  async requestPasswordChangeVerification(
    userId: string,
    dto: RequestPasswordChangeCodeDto,
  ) {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException("Người dùng không hợp lệ");
    }

    const passwordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException("Mật khẩu hiện tại không đúng");
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    return this.createEmailVerification({
      purpose: "change_password",
      email: user.email,
      userId: user._id.toString(),
      payload: {
        newPasswordHash,
      },
      subject: "Xác minh đổi mật khẩu",
      purposeLabel: "đổi mật khẩu",
    });
  }

  async confirmPasswordChangeVerification(
    userId: string,
    dto: ConfirmPasswordChangeCodeDto,
  ) {
    const verification = await this.verifyEmailCode({
      verificationId: dto.verificationId,
      code: dto.code,
      purpose: "change_password",
      userId,
    });

    const newPasswordHash = verification.payload.newPasswordHash;
    if (!newPasswordHash) {
      throw new BadRequestException("Mã xác minh không hợp lệ");
    }

    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException("Người dùng không hợp lệ");
    }

    user.passwordHash = newPasswordHash;
    user.rememberedLogins = [];
    await user.save();

    verification.consumedAt = new Date();
    await verification.save();

    return {
      message: "Đổi mật khẩu thành công",
    };
  }

  async getProfile(userId: string) {
    const user = await UserModel.findById(userId).exec();

    if (!user) {
      throw new UnauthorizedException("Người dùng không hợp lệ");
    }

    return {
      user: await this.toSafeUser(user),
    };
  }

  async createAvatarUploadUrl(userId: string, createAvatarUploadDto: CreateAvatarUploadDto) {
    await this.ensureUserExists(userId);
    this.validateImageUpload(
      createAvatarUploadDto.contentType,
      createAvatarUploadDto.fileSize,
    );

    const key = this.buildAvatarStorageKey(userId, createAvatarUploadDto.fileName);
    const uploadUrl = await this.storageService.getSignedUploadUrl(
      key,
      createAvatarUploadDto.contentType,
    );

    return {
      key,
      uploadUrl,
      method: "PUT",
      contentType: createAvatarUploadDto.contentType,
      expiresIn: 600,
    };
  }

  async updateSettings(userId: string, updateUserSettingsDto: UpdateUserSettingsDto) {
    const user = await UserModel.findById(userId).exec();

    if (!user) {
      throw new UnauthorizedException("Người dùng không hợp lệ");
    }

    const previousAvatarKey = user.avatarKey ?? null;

    if (updateUserSettingsDto.name !== undefined) {
      user.name = updateUserSettingsDto.name || null;
    }

    if (updateUserSettingsDto.phone !== undefined) {
      user.phone = updateUserSettingsDto.phone || null;
    }

    if (updateUserSettingsDto.imageResizeWidth !== undefined) {
      user.imageResizeWidth = updateUserSettingsDto.imageResizeWidth;
    }

    if (updateUserSettingsDto.watermarkSettings !== undefined) {
      user.watermarkSettings = this.resolveWatermarkSettings({
        ...user.watermarkSettings,
        ...updateUserSettingsDto.watermarkSettings,
      });
    }

    if (updateUserSettingsDto.avatarKey !== undefined) {
      if (
        updateUserSettingsDto.avatarKey &&
        !this.isOwnedAvatarKey(userId, updateUserSettingsDto.avatarKey)
      ) {
        throw new BadRequestException("Avatar không hợp lệ");
      }

      user.avatarKey = updateUserSettingsDto.avatarKey ?? null;
    }

    await user.save();

    if (
      previousAvatarKey &&
      previousAvatarKey !== user.avatarKey
    ) {
      try {
        await this.storageService.deleteObject(previousAvatarKey);
      } catch {
        // Ignore cleanup failures so profile updates still succeed.
      }
    }

    return {
      user: await this.toSafeUser(user),
    };
  }

  async validateAccessTokenSession(
    payload: AccessTokenPayload,
  ): Promise<AuthenticatedUser> {
    const user = await UserModel.findById(payload.sub).exec();
    if (!user) {
      throw new UnauthorizedException("Người dùng không hợp lệ");
    }

    const currentSession = user.currentSession;
    const isSessionMismatch =
      !currentSession?.sessionId ||
      currentSession.sessionId !== payload.sessionId ||
      currentSession.deviceId !== payload.deviceId;

    if (isSessionMismatch) {
      throw new UnauthorizedException("Phiên đăng nhập đã hết hiệu lực");
    }

    return {
      ...payload,
      role: this.resolveUserRole(user.role),
    };
  }

  private async buildAuthResponse(
    user: UserDocument,
    options: {
      deviceId: string;
      deviceName?: string;
      rememberAccount: boolean;
    },
  ) {
    const sessionId = randomUUID();
    const deviceName = options.deviceName?.trim() || "Thiết bị không xác định";

    user.currentSession = {
      sessionId,
      deviceId: options.deviceId,
      deviceName,
      loggedInAt: new Date(),
    };

    if (options.rememberAccount) {
      user.rememberedLogins = [
        ...(user.rememberedLogins ?? []).filter(
          (item) => item.deviceId !== options.deviceId,
        ),
        {
          sessionId,
          deviceId: options.deviceId,
          deviceName,
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
      ];
    } else {
      user.rememberedLogins = (user.rememberedLogins ?? []).filter(
        (item) => item.deviceId !== options.deviceId,
      );
    }

    await user.save();

    const safeUser = await this.toSafeUser(user);
    const accessTokenPayload: AccessTokenPayload = {
      sub: user._id.toString(),
      username: user.username,
      email: user.email,
      sessionId,
      deviceId: options.deviceId,
    };
    const accessToken = await this.jwtService.signAsync(accessTokenPayload);

    const response: {
      accessToken: string;
      rememberToken?: string;
      user: SafeUser;
    } = {
      accessToken,
      user: safeUser,
    };

    if (options.rememberAccount) {
      const rememberTokenPayload: RememberTokenPayload = {
        ...accessTokenPayload,
        type: "remember_login",
      };
      response.rememberToken = await this.jwtService.signAsync(
        rememberTokenPayload,
        {
          secret:
            process.env.JWT_REMEMBER_SECRET ??
            process.env.JWT_SECRET ??
            "dev-secret-change-me",
          expiresIn:
            (process.env.JWT_REMEMBER_EXPIRES_IN as StringValue | undefined) ??
            "180d",
        },
      );
    }

    return response;
  }

  private async toSafeUser(user: UserDocument): Promise<SafeUser> {
    let avatarUrl: string | null = null;

    if (user.avatarKey) {
      try {
        avatarUrl = await this.storageService.getSignedViewUrl(user.avatarKey);
      } catch {
        avatarUrl = null;
      }
    }

    return {
      id: user._id.toString(),
      name: user.name,
      phone: user.phone ?? null,
      email: user.email,
      username: user.username,
      role: this.resolveUserRole(user.role),
      avatarUrl,
      imageResizeWidth: this.resolveImageResizeWidth(user.imageResizeWidth),
      watermarkSettings: this.resolveWatermarkSettings(user.watermarkSettings),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async ensureUserExists(userId: string) {
    const user = await UserModel.findById(userId).select({ _id: 1 }).lean().exec();
    if (!user) {
      throw new UnauthorizedException("Người dùng không hợp lệ");
    }
  }

  private buildAvatarStorageKey(userId: string, fileName: string) {
    const safeFileName =
      fileName
        .trim()
        .split("/")
        .pop()
        ?.replace(/[^a-zA-Z0-9._-]/g, "_") || "avatar.jpg";
    const randomPart = randomBytes(4).toString("hex");

    return `avatars/${userId}/${Date.now()}-${randomPart}-${safeFileName}`;
  }

  private isOwnedAvatarKey(userId: string, key: string) {
    return key.startsWith(`avatars/${userId}/`);
  }

  private resolveImageResizeWidth(value?: number | null): 120 | 360 | 480 | 720 | null {
    if (value === null) {
      return null;
    }

    return value === 120 || value === 360 || value === 480 || value === 720 ? value : 720;
  }

  private resolveWatermarkSettings(value?: Partial<WatermarkSettings> | null): WatermarkSettings {
    const text = value?.text?.trim() || DEFAULT_WATERMARK_SETTINGS.text;
    const opacity =
      typeof value?.opacity === "number" && Number.isFinite(value.opacity)
        ? Math.min(1, Math.max(0.1, value.opacity))
        : DEFAULT_WATERMARK_SETTINGS.opacity;
    const position = this.isWatermarkPosition(value?.position)
      ? value.position
      : DEFAULT_WATERMARK_SETTINGS.position;
    const style = this.isWatermarkStyle(value?.style)
      ? value.style
      : DEFAULT_WATERMARK_SETTINGS.style;
    const textScale = this.resolveWatermarkNumber(
      value?.textScale,
      DEFAULT_WATERMARK_SETTINGS.textScale,
      0.5,
      3,
    );
    const rotationDegrees = this.resolveWatermarkNumber(
      value?.rotationDegrees,
      DEFAULT_WATERMARK_SETTINGS.rotationDegrees,
      -180,
      180,
    );
    const textsPerLine = this.resolveWatermarkCount(
      value?.textsPerLine,
      DEFAULT_WATERMARK_SETTINGS.textsPerLine,
      1,
      6,
    );
    const lineCount = this.resolveWatermarkCount(
      value?.lineCount,
      DEFAULT_WATERMARK_SETTINGS.lineCount,
      1,
      5,
    );
    const customX = this.resolveWatermarkCoordinate(
      value?.customX,
      DEFAULT_WATERMARK_SETTINGS.customX,
    );
    const customY = this.resolveWatermarkCoordinate(
      value?.customY,
      DEFAULT_WATERMARK_SETTINGS.customY,
    );

    return {
      text: text.slice(0, 80),
      opacity,
      textScale,
      rotationDegrees,
      textsPerLine,
      lineCount,
      customX,
      customY,
      position,
      style,
    };
  }

  private resolveWatermarkCount(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    const numericValue =
      typeof value === "number" && Number.isFinite(value)
        ? Math.round(value)
        : fallback;
    return Math.min(max, Math.max(min, numericValue));
  }

  private resolveWatermarkNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    const numericValue =
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, numericValue));
  }

  private resolveWatermarkCoordinate(value: unknown, fallback: number) {
    const numericValue =
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(0.95, Math.max(0.05, numericValue));
  }

  private isWatermarkPosition(value: unknown): value is WatermarkPosition {
    return (
      value === "bottom-corners" ||
      value === "top-corners" ||
      value === "all-corners" ||
      value === "center" ||
      value === "diagonal" ||
      value === "custom"
    );
  }

  private isWatermarkStyle(value: unknown): value is WatermarkStyle {
    return (
      value === "light" ||
      value === "dark" ||
      value === "outline" ||
      value === "badge"
    );
  }

  private resolveUserRole(role?: UserRole | null): UserRole {
    return role === "admin" ? "admin" : "user";
  }

  private isDuplicateKeyError(error: unknown): error is MongooseError & {
    code: 11000;
    keyPattern: Record<string, number>;
  } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000 &&
      "keyPattern" in error
    );
  }

  private async verifyRememberToken(rememberToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<RememberTokenPayload>(
        rememberToken,
        {
          secret:
            process.env.JWT_REMEMBER_SECRET ??
            process.env.JWT_SECRET ??
            "dev-secret-change-me",
        },
      );
      return payload;
    } catch {
      throw new UnauthorizedException(
        "Remember token không hợp lệ hoặc đã hết hạn",
      );
    }
  }

  private async createEmailVerification(options: {
    purpose: EmailVerificationPurpose;
    email: string;
    userId?: string | null;
    payload: {
      username?: string;
      passwordHash?: string;
      newPasswordHash?: string;
    };
    subject: string;
    purposeLabel: string;
  }) {
    await EmailVerificationModel.deleteMany({
      purpose: options.purpose,
      email: options.email,
      consumedAt: null,
    }).exec();

    const code = this.generateVerificationCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const verification = await EmailVerificationModel.create({
      purpose: options.purpose,
      email: options.email,
      userId: options.userId ?? null,
      codeHash,
      attempts: 0,
      payload: options.payload,
      expiresAt,
      consumedAt: null,
    });

    try {
      const mailResult = await this.mailService.sendVerificationCode({
        to: options.email,
        subject: options.subject,
        code,
        purposeLabel: options.purposeLabel,
      });

      return {
        verificationId: verification._id.toString(),
        expiresAt,
        email: options.email,
        ...(process.env.NODE_ENV !== "production" &&
        "debugCode" in mailResult &&
        mailResult.debugCode
          ? { debugCode: mailResult.debugCode }
          : {}),
      };
    } catch (error) {
      await verification.deleteOne();
      throw error;
    }
  }

  private async verifyEmailCode(options: {
    verificationId: string;
    code: string;
    purpose: EmailVerificationPurpose;
    userId?: string;
  }) {
    const verification = await EmailVerificationModel.findById(
      options.verificationId,
    ).exec();

    if (!verification || verification.purpose !== options.purpose) {
      throw new BadRequestException("Mã xác minh không hợp lệ");
    }

    if (verification.consumedAt) {
      throw new BadRequestException("Mã xác minh đã được sử dụng");
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      await verification.deleteOne();
      throw new BadRequestException("Mã xác minh đã hết hạn");
    }

    if (options.userId && verification.userId?.toString() !== options.userId) {
      throw new UnauthorizedException("Mã xác minh không khớp với tài khoản");
    }

    const codeMatches = await bcrypt.compare(
      options.code,
      verification.codeHash,
    );
    if (!codeMatches) {
      verification.attempts += 1;
      if (verification.attempts >= 5) {
        await verification.deleteOne();
        throw new BadRequestException(
          "Mã xác minh không đúng quá số lần cho phép",
        );
      }

      await verification.save();
      throw new BadRequestException("Mã xác minh không đúng");
    }

    return verification;
  }

  private generateVerificationCode() {
    return randomInt(100000, 1000000).toString();
  }

  private validateImageUpload(contentType: string, fileSize: number) {
    if (!contentType.startsWith("image/")) {
      throw new BadRequestException("Chi ho tro upload file anh");
    }

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowedMimeTypes.includes(contentType)) {
      throw new BadRequestException("Loai anh chua duoc ho tro");
    }

    if (
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > 30 * 1024 * 1024
    ) {
      throw new BadRequestException("Dung luong anh toi da 30MB");
    }
  }
}
