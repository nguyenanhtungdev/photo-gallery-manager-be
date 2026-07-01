import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Types } from "mongoose";
import {
  ResolvedSystemSettings,
  SettingsService,
} from "../settings/settings.service";
import { SettingsGateway } from "../settings/settings.gateway";
import {
  CleanupJobLogModel,
  CleanupJobLogStatus,
} from "../settings/models/cleanup-job-log.model";
import { StorageService } from "../storage/storage.service";
import { Photo, ProjectModel } from "./models/project.model";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

@Injectable()
export class ProjectPhotoCleanupService {
  private readonly logger = new Logger(ProjectPhotoCleanupService.name);
  private isCleanupRunning = false;
  private lastScheduleRunKey: string | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly settingsGateway: SettingsGateway,
    private readonly storageService: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePaidProjectPhotoCleanup() {
    const now = new Date();
    const settings = await this.settingsService.getSettings();
    const scheduleMatch = this.getScheduleMatch(now, settings);

    if (!scheduleMatch.shouldRun) {
      return;
    }

    if (this.lastScheduleRunKey === scheduleMatch.runKey) {
      return;
    }

    this.lastScheduleRunKey = scheduleMatch.runKey;
    await this.cleanupPaidProjectPhotos(now, settings);
  }

  async cleanupPaidProjectPhotos(
    now = new Date(),
    settings?: ResolvedSystemSettings,
  ) {
    const startedAt = now;
    const startedMs = Date.now();

    if (this.isCleanupRunning) {
      this.logger.warn("Paid project photo cleanup is already running, skipping");
      const result = {
        scannedProjects: 0,
        cleanedProjects: 0,
        deletedPhotos: 0,
        failedPhotos: 0,
      };
      await this.createCleanupLog({
        startedAt,
        startedMs,
        settings: settings ?? await this.settingsService.getSettings(),
        result,
        status: "skipped",
        errorMessage: "Cleanup job dang chay, bo qua lan nay",
        cutoffAt: null,
      });
      return result;
    }

    this.isCleanupRunning = true;

    try {
      const resolvedSettings = settings ?? await this.settingsService.getSettings();
      const ownerFilter = this.buildCleanupOwnerFilter(resolvedSettings);

      if (ownerFilter === null) {
        const result = {
          scannedProjects: 0,
          cleanedProjects: 0,
          deletedPhotos: 0,
          failedPhotos: 0,
        };
        await this.createCleanupLog({
          startedAt,
          startedMs,
          settings: resolvedSettings,
          result,
          status: "skipped",
          errorMessage: "Da chon account cu the nhung danh sach account rong",
          cutoffAt: null,
        });
        return result;
      }

      const cutoff = new Date(
        now.getTime() - resolvedSettings.paidProjectPhotoRetentionDays * MS_PER_DAY,
      );
      const projects = await ProjectModel.find({
        status: "paid",
        paidAt: { $exists: true, $ne: null, $lte: cutoff },
        "photos.0": { $exists: true },
        ...ownerFilter,
      }).exec();

      let cleanedProjects = 0;
      let deletedPhotos = 0;
      let failedPhotos = 0;

      for (const project of projects) {
        const remainingPhotos: Photo[] = [];
        let projectDeletedPhotos = 0;
        let projectFailedPhotos = 0;

        for (const photo of project.photos) {
          if (!photo.storageKey) {
            projectDeletedPhotos += 1;
            continue;
          }

          try {
            await this.storageService.deleteObject(photo.storageKey);
            projectDeletedPhotos += 1;
          } catch (error) {
            projectFailedPhotos += 1;
            remainingPhotos.push(photo);
            this.logger.error(
              `Failed to delete S3 object for project ${project._id.toString()} photo ${photo.id}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }

        if (projectDeletedPhotos > 0) {
          project.set("photos", remainingPhotos);
          if (remainingPhotos.length === 0) {
            project.photosCleanedAt = now;
            project.photosCleanupReason = "retention_expired";
          }
          await project.save();
          cleanedProjects += 1;
          deletedPhotos += projectDeletedPhotos;
        }

        failedPhotos += projectFailedPhotos;
      }

      const result = {
        scannedProjects: projects.length,
        cleanedProjects,
        deletedPhotos,
        failedPhotos,
      };
      const status: CleanupJobLogStatus =
        failedPhotos > 0 ? "partial_failed" : "success";

      this.logger.log(
        `Paid project photo cleanup retentionDays=${resolvedSettings.paidProjectPhotoRetentionDays} target=${resolvedSettings.paidProjectPhotoCleanupTarget} scheduleTime=${this.formatScheduleTime(resolvedSettings)} timezone=Asia/Ho_Chi_Minh scanned=${projects.length} cleaned=${cleanedProjects} deleted=${deletedPhotos} failed=${failedPhotos}`,
      );

      await this.createCleanupLog({
        startedAt,
        startedMs,
        settings: resolvedSettings,
        result,
        status,
        cutoffAt: cutoff,
      });

      return result;
    } catch (error) {
      const resolvedSettings = settings ?? await this.settingsService.getSettings();
      const result = {
        scannedProjects: 0,
        cleanedProjects: 0,
        deletedPhotos: 0,
        failedPhotos: 0,
      };

      await this.createCleanupLog({
        startedAt,
        startedMs,
        settings: resolvedSettings,
        result,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        cutoffAt: null,
      });

      throw error;
    } finally {
      this.isCleanupRunning = false;
    }
  }

  private getScheduleMatch(now: Date, settings: ResolvedSystemSettings) {
    const vietnamDate = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
    const year = vietnamDate.getUTCFullYear();
    const month = vietnamDate.getUTCMonth() + 1;
    const day = vietnamDate.getUTCDate();
    const hour = vietnamDate.getUTCHours();
    const minute = vietnamDate.getUTCMinutes();
    const runKey = `${year}-${month}-${day}-${hour}-${minute}`;

    return {
      runKey,
      shouldRun:
        hour === settings.paidProjectPhotoCleanupHour &&
        minute === settings.paidProjectPhotoCleanupMinute,
    };
  }

  private formatScheduleTime(settings: ResolvedSystemSettings) {
    return `${String(settings.paidProjectPhotoCleanupHour).padStart(2, "0")}:${String(settings.paidProjectPhotoCleanupMinute).padStart(2, "0")}`;
  }

  private buildCleanupOwnerFilter(settings: ResolvedSystemSettings) {
    if (settings.paidProjectPhotoCleanupTarget !== "selected_users") {
      return {};
    }

    if (settings.paidProjectPhotoCleanupUserIds.length === 0) {
      return null;
    }

    return {
      ownerId: {
        $in: settings.paidProjectPhotoCleanupUserIds.map(
          (userId) => new Types.ObjectId(userId),
        ),
      },
    };
  }

  private async createCleanupLog({
    startedAt,
    startedMs,
    settings,
    result,
    status,
    cutoffAt,
    errorMessage = null,
  }: {
    startedAt: Date;
    startedMs: number;
    settings: ResolvedSystemSettings;
    result: {
      scannedProjects: number;
      cleanedProjects: number;
      deletedPhotos: number;
      failedPhotos: number;
    };
    status: CleanupJobLogStatus;
    cutoffAt: Date | null;
    errorMessage?: string | null;
  }) {
    const finishedAt = new Date();

    const log = await CleanupJobLogModel.create({
      status,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, Date.now() - startedMs),
      retentionDays: settings.paidProjectPhotoRetentionDays,
      cutoffAt,
      scheduleHour: settings.paidProjectPhotoCleanupHour,
      scheduleMinute: settings.paidProjectPhotoCleanupMinute,
      target: settings.paidProjectPhotoCleanupTarget,
      userIds: settings.paidProjectPhotoCleanupUserIds.map(
        (userId) => new Types.ObjectId(userId),
      ),
      scannedProjects: result.scannedProjects,
      cleanedProjects: result.cleanedProjects,
      deletedPhotos: result.deletedPhotos,
      failedPhotos: result.failedPhotos,
      errorMessage,
    });

    this.settingsGateway.emitCleanupLogCreated({
      log: this.settingsService.serializeCleanupJobLog(log),
    });
  }
}
