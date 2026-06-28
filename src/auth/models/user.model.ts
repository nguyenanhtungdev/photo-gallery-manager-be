import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export type UserRole = 'admin' | 'user'

export interface User {
  _id: Types.ObjectId
  name?: string | null
  email: string
  username: string
  role: UserRole
  avatarKey?: string | null
  imageResizeWidth?: number | null
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
