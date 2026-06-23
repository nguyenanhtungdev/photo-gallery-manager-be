import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export type ProjectStatus = 'waiting_payment' | 'paid'

export interface Photo {
  id: string
  projectId: string
  filename: string
  storageKey?: string
  isDisabled?: boolean
  disabledAt?: Date | null
  previewUrl?: string
  originalUrl?: string
  contentType?: string
  fileSize?: number
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
  clientPhone: string | null
  keyword: string
  shareToken: string
  status: ProjectStatus
  paidAmount?: number
  imageResizeWidth?: number | null
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
    storageKey: { type: String, trim: true },
    isDisabled: { type: Boolean, default: false },
    disabledAt: { type: Date, default: null },
    previewUrl: { type: String, trim: true },
    originalUrl: { type: String, trim: true },
    contentType: { type: String, trim: true },
    fileSize: { type: Number, min: 0 },
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
      default: null,
      trim: true,
    },
    keyword: {
      type: String,
      required: true,
      trim: true,
      default: '',
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
    paidAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    imageResizeWidth: {
      type: Number,
      enum: [120, 360, 480, 720, null],
      default: null,
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
projectSchema.index({ ownerId: 1, keyword: 1 })

export type ProjectDocument = HydratedDocument<Project>

export const ProjectModel =
  (models.Project as Model<Project>) ?? model<Project>('Project', projectSchema)
