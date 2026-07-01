import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export type PaidProjectPhotoCleanupTarget = 'all_users' | 'selected_users'

export interface SystemSettings {
  key: 'global'
  paidProjectPhotoRetentionDays: number
  paidProjectPhotoCleanupHour: number
  paidProjectPhotoCleanupMinute: number
  paidProjectPhotoCleanupTarget: PaidProjectPhotoCleanupTarget
  paidProjectPhotoCleanupUserIds: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const systemSettingsSchema = new Schema<SystemSettings>(
  {
    key: {
      type: String,
      enum: ['global'],
      default: 'global',
      unique: true,
      required: true,
    },
    paidProjectPhotoRetentionDays: {
      type: Number,
      min: 1,
      max: 365,
      default: 7,
    },
    paidProjectPhotoCleanupHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 3,
    },
    paidProjectPhotoCleanupMinute: {
      type: Number,
      min: 0,
      max: 59,
      default: 0,
    },
    paidProjectPhotoCleanupTarget: {
      type: String,
      enum: ['all_users', 'selected_users'],
      default: 'all_users',
    },
    paidProjectPhotoCleanupUserIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'SystemSettings',
  },
)

export type SystemSettingsDocument = HydratedDocument<SystemSettings>

export const SystemSettingsModel =
  (models.SystemSettings as Model<SystemSettings>) ??
  model<SystemSettings>('SystemSettings', systemSettingsSchema)
