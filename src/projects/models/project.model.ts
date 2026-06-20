import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export type ProjectStatus = 'waiting_payment' | 'paid'

export interface Photo {
  id: string
  projectId: string
  filename: string
  previewUrl: string
  originalUrl: string
  width: number
  height: number
}

export interface AccessLog {
  id: string
  projectId: string
  ip: string
  userAgent: string
  viewedAt: Date
  viewCount: number
}

export interface Project {
  _id: Types.ObjectId
  ownerId: Types.ObjectId
  name: string
  clientName: string
  clientPhone: string
  shareToken: string
  status: ProjectStatus
  notes?: string
  photos: Photo[]
  accessLogs: AccessLog[]
  createdAt: Date
  updatedAt: Date
}

const photoSchema = new Schema<Photo>(
  {
    id: { type: String, required: true, trim: true },
    projectId: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    previewUrl: { type: String, required: true, trim: true },
    originalUrl: { type: String, required: true, trim: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  {
    _id: false,
  },
)

const accessLogSchema = new Schema<AccessLog>(
  {
    id: { type: String, required: true, trim: true },
    projectId: { type: String, required: true, trim: true },
    ip: { type: String, required: true, trim: true },
    userAgent: { type: String, required: true, trim: true },
    viewedAt: { type: Date, required: true },
    viewCount: { type: Number, required: true, min: 0 },
  },
  {
    _id: false,
  },
)

const projectSchema = new Schema<Project>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    clientPhone: {
      type: String,
      required: true,
      trim: true,
    },
    shareToken: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['waiting_payment', 'paid'],
      default: 'waiting_payment',
    },
    notes: {
      type: String,
      trim: true,
    },
    photos: {
      type: [photoSchema],
      default: [],
    },
    accessLogs: {
      type: [accessLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'Project',
  },
)

projectSchema.index({ ownerId: 1, createdAt: -1 })

export type ProjectDocument = HydratedDocument<Project>

export const ProjectModel =
  (models.Project as Model<Project>) ?? model<Project>('Project', projectSchema)
