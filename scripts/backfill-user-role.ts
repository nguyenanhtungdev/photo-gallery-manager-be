import 'dotenv/config'
import dns from 'node:dns/promises'
import mongoose from 'mongoose'
import { UserModel, UserRole } from '../src/auth/models/user.model'

function hasFlag(flag: string) {
  return process.argv.includes(`--${flag}`)
}

async function main() {
  const mongoUri = process.env.DATABASE_URL

  if (!mongoUri) {
    throw new Error('Missing DATABASE_URL in environment variables')
  }

  const dryRun = hasFlag('dry-run')
  const validRoles: UserRole[] = ['admin', 'user']
  const filter = {
    role: {
      $nin: validRoles,
    },
  }

  dns.setServers(['1.1.1.1', '8.8.8.8'])
  await mongoose.connect(mongoUri)

  try {
    const matchedCount = await UserModel.countDocuments(filter).exec()

    if (matchedCount === 0) {
      console.log('No user accounts need role backfill.')
      return
    }

    if (dryRun) {
      console.log(`[dry-run] ${matchedCount} user account(s) would be updated to role=user.`)
      return
    }

    const result = await UserModel.updateMany(
      filter,
      {
        $set: {
          role: 'user',
        },
      },
    ).exec()

    console.log(`Updated ${result.modifiedCount} user account(s) to role=user.`)
  } finally {
    await mongoose.disconnect()
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Backfill user role failed: ${message}`)
  process.exit(1)
})
