import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export type EmailVerificationPurpose = 'register' | 'change_password' | 'forgot_password'

export interface EmailVerification {
  _id: Types.ObjectId
  purpose: EmailVerificationPurpose
  email: string
  userId?: Types.ObjectId | null
  codeHash: string
  attempts: number
  payload: {
    username?: string
    passwordHash?: string
    newPasswordHash?: string
  }
  expiresAt: Date
  consumedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const emailVerificationSchema = new Schema<EmailVerification>(
  {
    purpose: {
      type: String,
      enum: ['register', 'change_password', 'forgot_password'],
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    payload: {
      type: new Schema(
        {
          username: { type: String, default: null },
          passwordHash: { type: String, default: null },
          newPasswordHash: { type: String, default: null },
        },
        { _id: false },
      ),
      default: {},
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'EmailVerification',
  },
)

export type EmailVerificationDocument = HydratedDocument<EmailVerification>

export const EmailVerificationModel =
  (models.EmailVerification as Model<EmailVerification>) ??
  model<EmailVerification>('EmailVerification', emailVerificationSchema)
