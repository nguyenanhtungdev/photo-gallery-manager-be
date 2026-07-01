import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'
import { PaidProjectPhotoCleanupTarget } from './system-settings.model'

export type CleanupJobLogStatus = 'success' | 'partial_failed' | 'failed' | 'skipped'

export interface CleanupJobLog {
  _id: Types.ObjectId
  status: CleanupJobLogStatus
  startedAt: Date
  finishedAt: Date
  durationMs: number
  retentionDays: number
  cutoffAt: Date | null
  scheduleHour: number
  scheduleMinute: number
  target: PaidProjectPhotoCleanupTarget
  userIds: Types.ObjectId[]
  scannedProjects: number
  cleanedProjects: number
  deletedPhotos: number
  failedPhotos: number
  errorMessage?: string | null
  createdAt: Date
  updatedAt: Date
}

const cleanupJobLogSchema = new Schema<CleanupJobLog>(
  {
    status: {
      type: String,
      enum: ['success', 'partial_failed', 'failed', 'skipped'],
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      index: true,
    },
    finishedAt: {
      type: Date,
      required: true,
    },
    durationMs: {
      type: Number,
      required: true,
      min: 0,
    },
    retentionDays: {
      type: Number,
      required: true,
      min: 1,
    },
    cutoffAt: {
      type: Date,
      default: null,
    },
    scheduleHour: {
      type: Number,
      required: true,
      min: 0,
      max: 23,
    },
    scheduleMinute: {
      type: Number,
      required: true,
      min: 0,
      max: 59,
    },
    target: {
      type: String,
      enum: ['all_users', 'selected_users'],
      required: true,
    },
    userIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    scannedProjects: {
      type: Number,
      required: true,
      min: 0,
    },
    cleanedProjects: {
      type: Number,
      required: true,
      min: 0,
    },
    deletedPhotos: {
      type: Number,
      required: true,
      min: 0,
    },
    failedPhotos: {
      type: Number,
      required: true,
      min: 0,
    },
    errorMessage: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'CleanupJobLog',
  },
)

cleanupJobLogSchema.index({ startedAt: -1 })

export type CleanupJobLogDocument = HydratedDocument<CleanupJobLog>

export const CleanupJobLogModel =
  (models.CleanupJobLog as Model<CleanupJobLog>) ??
  model<CleanupJobLog>('CleanupJobLog', cleanupJobLogSchema)
