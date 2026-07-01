import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Types } from 'mongoose'
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto'
import { ListCleanupJobLogsQueryDto } from './dto/list-cleanup-job-logs-query.dto'
import {
  CleanupJobLog,
  CleanupJobLogModel,
} from './models/cleanup-job-log.model'
import {
  PaidProjectPhotoCleanupTarget,
  SystemSettingsModel,
} from './models/system-settings.model'

const DEFAULT_PAID_PROJECT_PHOTO_RETENTION_DAYS = 7
const DEFAULT_PAID_PROJECT_PHOTO_CLEANUP_HOUR = 3
const DEFAULT_PAID_PROJECT_PHOTO_CLEANUP_MINUTE = 0
const MIN_PAID_PROJECT_PHOTO_RETENTION_DAYS = 1
const MAX_PAID_PROJECT_PHOTO_RETENTION_DAYS = 365
const MIN_PAID_PROJECT_PHOTO_CLEANUP_HOUR = 0
const MAX_PAID_PROJECT_PHOTO_CLEANUP_HOUR = 23
const MIN_PAID_PROJECT_PHOTO_CLEANUP_MINUTE = 0
const MAX_PAID_PROJECT_PHOTO_CLEANUP_MINUTE = 59

export type ResolvedSystemSettings = {
  paidProjectPhotoRetentionDays: number
  paidProjectPhotoCleanupHour: number
  paidProjectPhotoCleanupMinute: number
  paidProjectPhotoCleanupTarget: PaidProjectPhotoCleanupTarget
  paidProjectPhotoCleanupUserIds: string[]
}

export type SerializedCleanupJobLog = {
  id: string
  status: CleanupJobLog['status']
  startedAt: Date
  finishedAt: Date
  durationMs: number
  retentionDays: number
  cutoffAt: Date | null
  scheduleHour: number
  scheduleMinute: number
  target: CleanupJobLog['target']
  userIds: string[]
  scannedProjects: number
  cleanedProjects: number
  deletedPhotos: number
  failedPhotos: number
  errorMessage: string | null
}

@Injectable()
export class SettingsService {
  constructor(private readonly configService: ConfigService) {}

  async getSettings() {
    const settings = await SystemSettingsModel.findOne({ key: 'global' }).lean().exec()
    const fallbackSettings = this.resolveDefaultSettings()

    return {
      paidProjectPhotoRetentionDays:
        settings?.paidProjectPhotoRetentionDays ??
        fallbackSettings.paidProjectPhotoRetentionDays,
      paidProjectPhotoCleanupHour:
        settings?.paidProjectPhotoCleanupHour ??
        fallbackSettings.paidProjectPhotoCleanupHour,
      paidProjectPhotoCleanupMinute:
        settings?.paidProjectPhotoCleanupMinute ??
        fallbackSettings.paidProjectPhotoCleanupMinute,
      paidProjectPhotoCleanupTarget:
        settings?.paidProjectPhotoCleanupTarget ??
        fallbackSettings.paidProjectPhotoCleanupTarget,
      paidProjectPhotoCleanupUserIds: this.toUserIdStrings(
        settings?.paidProjectPhotoCleanupUserIds,
      ),
    }
  }

  async updateSettings(updateSystemSettingsDto: UpdateSystemSettingsDto) {
    const current = await this.getSettings()
    const nextRetentionDays =
      updateSystemSettingsDto.paidProjectPhotoRetentionDays ??
      current.paidProjectPhotoRetentionDays
    const nextCleanupHour =
      updateSystemSettingsDto.paidProjectPhotoCleanupHour ??
      current.paidProjectPhotoCleanupHour
    const nextCleanupMinute =
      updateSystemSettingsDto.paidProjectPhotoCleanupMinute ??
      current.paidProjectPhotoCleanupMinute
    const nextCleanupTarget =
      updateSystemSettingsDto.paidProjectPhotoCleanupTarget ??
      current.paidProjectPhotoCleanupTarget
    const nextCleanupUserIds =
      updateSystemSettingsDto.paidProjectPhotoCleanupUserIds ??
      current.paidProjectPhotoCleanupUserIds

    const settings = await SystemSettingsModel.findOneAndUpdate(
      { key: 'global' },
      {
        key: 'global',
        paidProjectPhotoRetentionDays: nextRetentionDays,
        paidProjectPhotoCleanupHour: nextCleanupHour,
        paidProjectPhotoCleanupMinute: nextCleanupMinute,
        paidProjectPhotoCleanupTarget: nextCleanupTarget,
        paidProjectPhotoCleanupUserIds: nextCleanupUserIds.map(
          (userId) => new Types.ObjectId(userId),
        ),
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).lean().exec()

    return {
      paidProjectPhotoRetentionDays:
        settings?.paidProjectPhotoRetentionDays ?? nextRetentionDays,
      paidProjectPhotoCleanupHour:
        settings?.paidProjectPhotoCleanupHour ?? nextCleanupHour,
      paidProjectPhotoCleanupMinute:
        settings?.paidProjectPhotoCleanupMinute ?? nextCleanupMinute,
      paidProjectPhotoCleanupTarget:
        settings?.paidProjectPhotoCleanupTarget ?? nextCleanupTarget,
      paidProjectPhotoCleanupUserIds: this.toUserIdStrings(
        settings?.paidProjectPhotoCleanupUserIds,
      ),
    }
  }

  async listCleanupJobLogs(query: ListCleanupJobLogsQueryDto) {
    const limit = query.limit ?? 20
    const logs = await CleanupJobLogModel.find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean()
      .exec()

    return {
      logs: logs.map((log) => this.serializeCleanupJobLog(log)),
    }
  }

  serializeCleanupJobLog(log: CleanupJobLog): SerializedCleanupJobLog {
    return {
      id: log._id.toString(),
      status: log.status,
      startedAt: log.startedAt,
      finishedAt: log.finishedAt,
      durationMs: log.durationMs,
      retentionDays: log.retentionDays,
      cutoffAt: log.cutoffAt,
      scheduleHour: log.scheduleHour,
      scheduleMinute: log.scheduleMinute,
      target: log.target,
      userIds: this.toUserIdStrings(log.userIds),
      scannedProjects: log.scannedProjects,
      cleanedProjects: log.cleanedProjects,
      deletedPhotos: log.deletedPhotos,
      failedPhotos: log.failedPhotos,
      errorMessage: log.errorMessage ?? null,
    }
  }

  private resolveDefaultSettings(): ResolvedSystemSettings {
    return {
      paidProjectPhotoRetentionDays: this.resolveConfiguredInteger(
        'PAID_PROJECT_PHOTO_RETENTION_DAYS',
        DEFAULT_PAID_PROJECT_PHOTO_RETENTION_DAYS,
        MIN_PAID_PROJECT_PHOTO_RETENTION_DAYS,
        MAX_PAID_PROJECT_PHOTO_RETENTION_DAYS,
      ),
      paidProjectPhotoCleanupHour: this.resolveConfiguredInteger(
        'PAID_PROJECT_PHOTO_CLEANUP_HOUR',
        DEFAULT_PAID_PROJECT_PHOTO_CLEANUP_HOUR,
        MIN_PAID_PROJECT_PHOTO_CLEANUP_HOUR,
        MAX_PAID_PROJECT_PHOTO_CLEANUP_HOUR,
      ),
      paidProjectPhotoCleanupMinute: this.resolveConfiguredInteger(
        'PAID_PROJECT_PHOTO_CLEANUP_MINUTE',
        DEFAULT_PAID_PROJECT_PHOTO_CLEANUP_MINUTE,
        MIN_PAID_PROJECT_PHOTO_CLEANUP_MINUTE,
        MAX_PAID_PROJECT_PHOTO_CLEANUP_MINUTE,
      ),
      paidProjectPhotoCleanupTarget: 'all_users',
      paidProjectPhotoCleanupUserIds: [],
    }
  }

  private toUserIdStrings(userIds?: unknown[] | null) {
    if (!Array.isArray(userIds)) {
      return []
    }

    return userIds.map((userId) => String(userId))
  }

  private resolveConfiguredInteger(
    envKey: string,
    defaultValue: number,
    min: number,
    max: number,
  ) {
    const configuredValue = Number(this.configService.get<string>(envKey))

    if (
      Number.isInteger(configuredValue) &&
      configuredValue >= min &&
      configuredValue <= max
    ) {
      return configuredValue
    }

    return defaultValue
  }
}
