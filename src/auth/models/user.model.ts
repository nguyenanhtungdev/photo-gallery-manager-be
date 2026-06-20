import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose'

export interface User {
  _id: Types.ObjectId
  name?: string | null
  email: string
  username: string
  passwordHash: string
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
    passwordHash: {
      type: String,
      required: true,
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
