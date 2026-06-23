import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export type NotificationType = 'share_accessed' | 'project_created' | 'payment_updated'

export interface Notification {
  _id: Types.ObjectId
  ownerId: Types.ObjectId
  projectId?: Types.ObjectId | null
  type: NotificationType
  title: string
  message: string
  projectName?: string | null
  metadata?: Record<string, unknown>
  readAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const notificationSchema = new Schema<Notification>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ['share_accessed', 'project_created', 'payment_updated'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    projectName: {
      type: String,
      default: null,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'Notification',
  },
)

notificationSchema.index({ ownerId: 1, createdAt: -1 })
notificationSchema.index({ ownerId: 1, readAt: 1, createdAt: -1 })

export type NotificationDocument = HydratedDocument<Notification>

export const NotificationModel =
  (models.Notification as Model<Notification>) ?? model<Notification>('Notification', notificationSchema)
