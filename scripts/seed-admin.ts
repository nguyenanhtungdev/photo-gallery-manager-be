import 'dotenv/config'
import * as bcrypt from 'bcryptjs'
import dns from 'node:dns/promises'
import mongoose from 'mongoose'
import { UserModel } from '../src/auth/models/user.model'

type AdminSeedInput = {
  email: string
  name: string
  password: string
  username: string
}

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg?.slice(prefix.length)
}

function getAdminInput(): AdminSeedInput {
  const name = readArg('name') ?? process.env.ADMIN_NAME ?? 'Admin'
  const email = (readArg('email') ?? process.env.ADMIN_EMAIL ?? 'admin@photo-gallery.local')
    .trim()
    .toLowerCase()
  const username = (readArg('username') ?? process.env.ADMIN_USERNAME ?? 'admin')
    .trim()
    .toLowerCase()
  const password = readArg('password') ?? process.env.ADMIN_PASSWORD ?? 'Admin@123456'

  return {
    email,
    name: name.trim(),
    password,
    username,
  }
}

async function main() {
  const mongoUri = process.env.MONGO_URI ?? process.env.DATABASE_URL

  if (!mongoUri) {
    throw new Error('Missing MONGO_URI or DATABASE_URL in environment variables')
  }

  const admin = getAdminInput()

  dns.setServers(['1.1.1.1', '8.8.8.8'])
  await mongoose.connect(mongoUri)

  try {
    const passwordHash = await bcrypt.hash(admin.password, 10)
    const existingUser = await UserModel.findOne({
      $or: [{ email: admin.email }, { username: admin.username }],
    }).exec()

    if (existingUser) {
      existingUser.name = admin.name || existingUser.name
      existingUser.email = admin.email
      existingUser.username = admin.username
      existingUser.passwordHash = passwordHash
      await existingUser.save()

      console.log(`Updated admin account: ${existingUser.username} (${existingUser.email})`)
      return
    }

    const createdUser = await UserModel.create({
      name: admin.name,
      email: admin.email,
      username: admin.username,
      passwordHash,
    })

    console.log(`Created admin account: ${createdUser.username} (${createdUser.email})`)
  } finally {
    await mongoose.disconnect()
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Seed admin failed: ${message}`)
  process.exit(1)
})
