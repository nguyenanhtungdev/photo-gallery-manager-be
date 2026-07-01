import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export type UserRole = 'admin' | 'user'
export type WatermarkPosition = 'bottom-corners' | 'top-corners' | 'all-corners' | 'center' | 'diagonal' | 'custom'
export type WatermarkStyle = 'light' | 'dark' | 'outline' | 'badge'

export interface WatermarkSettings {
  text: string
  opacity: number
  textScale: number
  rotationDegrees: number
  textsPerLine: number
  lineCount: number
  customX: number
  customY: number
  position: WatermarkPosition
  style: WatermarkStyle
}

export interface User {
  _id: Types.ObjectId
  name?: string | null
  phone?: string | null
  email: string
  username: string
  role: UserRole
  avatarKey?: string | null
  imageResizeWidth?: number | null
  watermarkSettings?: WatermarkSettings | null
  passwordHash: string
  rememberedLogins: Array<{
    sessionId: string
    deviceId: string
    deviceName?: string
    createdAt: Date
    lastUsedAt: Date
  }>
  currentSession?: {
    sessionId?: string | null
    deviceId?: string | null
    deviceName?: string
    loggedInAt?: Date | null
  }
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<User>(
  {
    name: {
      type: String,
      trim: true,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
      index: true,
    },
    avatarKey: {
      type: String,
      trim: true,
      default: null,
    },
    imageResizeWidth: {
      type: Number,
      enum: [120, 360, 480, 720],
      default: 720,
    },
    watermarkSettings: {
      type: new Schema<WatermarkSettings>(
        {
          text: {
            type: String,
            trim: true,
            maxlength: 80,
            default: 'kim cảnh · 0867177174',
          },
          opacity: {
            type: Number,
            min: 0.1,
            max: 1,
            default: 0.4,
          },
          textScale: {
            type: Number,
            min: 0.5,
            max: 3,
            default: 1,
          },
          rotationDegrees: {
            type: Number,
            min: -180,
            max: 180,
            default: 0,
          },
          textsPerLine: {
            type: Number,
            min: 1,
            max: 6,
            default: 1,
          },
          lineCount: {
            type: Number,
            min: 1,
            max: 5,
            default: 1,
          },
          customX: {
            type: Number,
            min: 0.05,
            max: 0.95,
            default: 0.5,
          },
          customY: {
            type: Number,
            min: 0.05,
            max: 0.95,
            default: 0.5,
          },
          position: {
            type: String,
            enum: ['bottom-corners', 'top-corners', 'all-corners', 'center', 'diagonal', 'custom'],
            default: 'all-corners',
          },
          style: {
            type: String,
            enum: ['light', 'dark', 'outline', 'badge'],
            default: 'light',
          },
        },
        { _id: false },
      ),
      default: () => ({
        text: 'kim cảnh · 0867177174',
        opacity: 0.4,
        textScale: 1,
        rotationDegrees: 0,
        textsPerLine: 1,
        lineCount: 1,
        customX: 0.5,
        customY: 0.5,
        position: 'all-corners',
        style: 'light',
      }),
    },
    passwordHash: {
      type: String,
      required: true,
    },
    rememberedLogins: {
      type: [
        new Schema(
          {
            sessionId: { type: String, required: true },
            deviceId: { type: String, required: true },
            deviceName: { type: String, default: '' },
            createdAt: { type: Date, default: Date.now },
            lastUsedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    currentSession: {
      type: new Schema(
        {
          sessionId: { type: String, default: null },
          deviceId: { type: String, default: null },
          deviceName: { type: String, default: '' },
          loggedInAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'User',
  },
)

export type UserDocument = HydratedDocument<User>

export const UserModel =
  (models.User as Model<User>) ?? model<User>('User', userSchema)
