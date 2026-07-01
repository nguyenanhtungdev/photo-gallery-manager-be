import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { isValidObjectId, Types } from "mongoose";
import { StorageService } from "../storage/storage.service";
import {
  UserModel,
  WatermarkPosition,
  WatermarkSettings,
  WatermarkStyle,
} from "../auth/models/user.model";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import { ProjectShareGateway } from "./project-share.gateway";
import { AddProjectPhotoDto } from "./dto/add-project-photo.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { CreateProjectPhotoPresignDto } from "./dto/create-project-photo-presign.dto";
import { ListProjectsQueryDto } from "./dto/list-projects-query.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { UpdateProjectStatusDto } from "./dto/update-project-status.dto";
import {
  Photo,
  Project,
  ProjectDocument,
  ProjectModel,
} from "./models/project.model";

type ShareAccessMetadata = {
  forwardedFor?: string;
  realIp?: string;
  userAgent?: string;
};

type ShareAccessRecord = {
  ip: string;
  userAgent: string;
  viewedAt: Date;
};

const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  text: "kim cảnh · 0867177174",
  opacity: 0.4,
  textScale: 1,
  rotationDegrees: 0,
  textsPerLine: 1,
  lineCount: 1,
  customX: 0.5,
  customY: 0.5,
  position: "all-corners",
  style: "light",
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
    private readonly projectShareGateway: ProjectShareGateway,
    private readonly settingsService: SettingsService,
  ) {}

  async list(ownerId: string, query: ListProjectsQueryDto) {
    const baseFilter = this.buildListBaseFilter(ownerId, query);
    const listFilter = {
      ...baseFilter,
      ...(query.status ? { status: query.status } : {}),
    };
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 12;

    const [projects, total, paidCount, waitingPaymentCount, cancelledCount] = await Promise.all(
      [
        ProjectModel.find(listFilter)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .exec(),
        ProjectModel.countDocuments(listFilter).exec(),
        ProjectModel.countDocuments({ ...baseFilter, status: "paid" }).exec(),
        ProjectModel.countDocuments({
          ...baseFilter,
          status: "waiting_payment",
        }).exec(),
        ProjectModel.countDocuments({
          ...baseFilter,
          status: "cancelled",
        }).exec(),
      ],
    );

    const resolvedProjects = await Promise.all(
      projects.map((project) => this.toProjectResponse(project)),
    );
    const nextOffset = offset + resolvedProjects.length;

    return {
      projects: resolvedProjects,
      pagination: {
        offset,
        limit,
        total,
        hasMore: nextOffset < total,
        nextOffset,
      },
      stats: {
        all: paidCount + waitingPaymentCount + cancelledCount,
        paid: paidCount,
        waiting_payment: waitingPaymentCount,
        cancelled: cancelledCount,
      },
    };
  }

  async listForAdmin(query: ListProjectsQueryDto) {
    const baseFilter = this.buildListBaseFilter(undefined, query);
    const listFilter = {
      ...baseFilter,
      ...(query.status ? { status: query.status } : {}),
    };
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 12;

    const [projects, total, paidCount, waitingPaymentCount, cancelledCount] = await Promise.all(
      [
        ProjectModel.find(listFilter)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .exec(),
        ProjectModel.countDocuments(listFilter).exec(),
        ProjectModel.countDocuments({ ...baseFilter, status: "paid" }).exec(),
        ProjectModel.countDocuments({
          ...baseFilter,
          status: "waiting_payment",
        }).exec(),
        ProjectModel.countDocuments({
          ...baseFilter,
          status: "cancelled",
        }).exec(),
      ],
    );

    const resolvedProjects = await Promise.all(
      projects.map((project) => this.toProjectResponse(project)),
    );
    const nextOffset = offset + resolvedProjects.length;

    return {
      projects: resolvedProjects,
      pagination: {
        offset,
        limit,
        total,
        hasMore: nextOffset < total,
        nextOffset,
      },
      stats: {
        all: paidCount + waitingPaymentCount + cancelledCount,
        paid: paidCount,
        waiting_payment: waitingPaymentCount,
        cancelled: cancelledCount,
      },
    };
  }

  async create(ownerId: string, createProjectDto: CreateProjectDto) {
    const resolvedProjectName =
      createProjectDto.name?.trim() || createProjectDto.clientName;
    const resolvedClientPhone = createProjectDto.clientPhone?.trim() || null;
    const projectCode = await this.generateProjectCode();
    const keyword = this.buildProjectKeyword({
      projectCode,
      name: resolvedProjectName,
      clientName: createProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      notes: createProjectDto.notes,
    });

    const project = await ProjectModel.create({
      ownerId: this.toObjectId(ownerId),
      projectCode,
      name: resolvedProjectName,
      clientName: createProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      keyword,
      notes: createProjectDto.notes,
      shareToken: this.generateShareToken(),
      status: "waiting_payment",
      paidAmount: undefined,
      paidAt: null,
      photosCleanedAt: null,
      photosCleanupReason: null,
      photos: [],
      accessLogs: [],
    });

    await this.notificationsService.create({
      ownerId,
      projectId: project._id,
      type: "project_created",
      title: "Project mới đã được tạo",
      message: `Bạn vừa tạo project ${project.name}.`,
      projectName: project.name,
      metadata: {
        clientName: project.clientName,
        clientPhone: project.clientPhone,
      },
    });

    this.projectShareGateway.emitSharedProjectUpdated(project.shareToken, {
      project: await this.toProjectResponse(project),
    });

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async getById(ownerId: string, projectId: string) {
    const project = await ProjectModel.findOne({
      _id: this.toProjectObjectId(projectId),
      ownerId: this.toObjectId(ownerId),
    }).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async getByIdForAdmin(projectId: string) {
    const project = await this.getProjectForAdmin(projectId);

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async update(
    ownerId: string,
    projectId: string,
    updateProjectDto: UpdateProjectDto,
  ) {
    const project = await ProjectModel.findOne({
      _id: this.toProjectObjectId(projectId),
      ownerId: this.toObjectId(ownerId),
    }).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

    const resolvedProjectName =
      updateProjectDto.name?.trim() || updateProjectDto.clientName;
    const resolvedClientPhone = updateProjectDto.clientPhone?.trim() || null;

    project.name = resolvedProjectName;
    project.clientName = updateProjectDto.clientName;
    project.clientPhone = resolvedClientPhone;
    project.notes = updateProjectDto.notes;
    project.keyword = this.buildProjectKeyword({
      projectCode: project.projectCode,
      name: resolvedProjectName,
      clientName: updateProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      notes: updateProjectDto.notes,
    });

    await project.save();

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async updateForAdmin(projectId: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.getProjectForAdmin(projectId);
    const resolvedProjectName =
      updateProjectDto.name?.trim() || updateProjectDto.clientName;
    const resolvedClientPhone = updateProjectDto.clientPhone?.trim() || null;

    project.name = resolvedProjectName;
    project.clientName = updateProjectDto.clientName;
    project.clientPhone = resolvedClientPhone;
    project.notes = updateProjectDto.notes;
    project.keyword = this.buildProjectKeyword({
      projectCode: project.projectCode,
      name: resolvedProjectName,
      clientName: updateProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      notes: updateProjectDto.notes,
    });

    await project.save();

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async getByShareToken(
    shareToken: string,
    accessMetadata?: ShareAccessMetadata,
  ) {
    const project = await ProjectModel.findOne({
      shareToken: shareToken.trim(),
    }).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

    if (accessMetadata) {
      const accessRecord = this.recordShareAccess(project, accessMetadata);
      await project.save();
      await this.notificationsService.create({
        ownerId: project.ownerId,
        projectId: project._id,
        type: "share_accessed",
        title: "Khách vừa truy cập link share",
        message: `Có khách ẩn danh vừa xem gallery ${project.name}.`,
        projectName: project.name,
        metadata: {
          ip: accessRecord.ip,
          userAgent: accessRecord.userAgent,
          viewedAt: accessRecord.viewedAt,
        },
      });
    }

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async createPhotoUploadUrl(
    ownerId: string,
    projectId: string,
    createProjectPhotoPresignDto: CreateProjectPhotoPresignDto,
  ) {
    const project = await this.getOwnedProject(ownerId, projectId);
    await this.ensurePhotoStorageExpiration(project);
    this.assertPhotoStorageAvailable(project);
    this.validateImageUpload(
      createProjectPhotoPresignDto.contentType,
      createProjectPhotoPresignDto.fileSize,
    );

    const key = this.buildPhotoStorageKey(
      ownerId,
      projectId,
      createProjectPhotoPresignDto.fileName,
    );
    const uploadUrl = await this.storageService.getSignedUploadUrl(
      key,
      createProjectPhotoPresignDto.contentType,
    );

    return {
      key,
      uploadUrl,
      method: "PUT",
      contentType: createProjectPhotoPresignDto.contentType,
      expiresIn: 600,
    };
  }

  async createPhotoUploadUrlForAdmin(
    projectId: string,
    createProjectPhotoPresignDto: CreateProjectPhotoPresignDto,
  ) {
    const project = await this.getProjectForAdmin(projectId);
    await this.ensurePhotoStorageExpiration(project);
    this.assertPhotoStorageAvailable(project);
    this.validateImageUpload(
      createProjectPhotoPresignDto.contentType,
      createProjectPhotoPresignDto.fileSize,
    );

    const key = this.buildPhotoStorageKey(
      project.ownerId.toString(),
      projectId,
      createProjectPhotoPresignDto.fileName,
    );
    const uploadUrl = await this.storageService.getSignedUploadUrl(
      key,
      createProjectPhotoPresignDto.contentType,
    );

    return {
      key,
      uploadUrl,
      method: "PUT",
      contentType: createProjectPhotoPresignDto.contentType,
      expiresIn: 600,
    };
  }

  async addPhoto(
    ownerId: string,
    projectId: string,
    addProjectPhotoDto: AddProjectPhotoDto,
  ) {
    const project = await this.getOwnedProject(ownerId, projectId);
    await this.ensurePhotoStorageExpiration(project);
    this.assertPhotoStorageAvailable(project);
    this.validateImageUpload(
      addProjectPhotoDto.contentType,
      addProjectPhotoDto.fileSize,
    );

    const photo: Photo = {
      id: randomUUID(),
      projectId,
      filename: this.buildRandomPhotoFilename(addProjectPhotoDto.filename),
      storageKey: addProjectPhotoDto.key,
      isDisabled: false,
      disabledAt: null,
      contentType: addProjectPhotoDto.contentType,
      fileSize: addProjectPhotoDto.fileSize,
      width: addProjectPhotoDto.width ?? 0,
      height: addProjectPhotoDto.height ?? 0,
    };

    this.ensureProjectKeyword(project);
    project.photosCleanedAt = null;
    project.photosCleanupReason = null;
    project.photos.unshift(photo);
    await project.save();

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async addPhotoForAdmin(projectId: string, addProjectPhotoDto: AddProjectPhotoDto) {
    const project = await this.getProjectForAdmin(projectId);
    await this.ensurePhotoStorageExpiration(project);
    this.assertPhotoStorageAvailable(project);
    this.validateImageUpload(
      addProjectPhotoDto.contentType,
      addProjectPhotoDto.fileSize,
    );

    const photo: Photo = {
      id: randomUUID(),
      projectId,
      filename: this.buildRandomPhotoFilename(addProjectPhotoDto.filename),
      storageKey: addProjectPhotoDto.key,
      isDisabled: false,
      disabledAt: null,
      contentType: addProjectPhotoDto.contentType,
      fileSize: addProjectPhotoDto.fileSize,
      width: addProjectPhotoDto.width ?? 0,
      height: addProjectPhotoDto.height ?? 0,
    };

    this.ensureProjectKeyword(project);
    project.photosCleanedAt = null;
    project.photosCleanupReason = null;
    project.photos.unshift(photo);
    await project.save();

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async updateStatus(
    ownerId: string,
    projectId: string,
    updateProjectStatusDto: UpdateProjectStatusDto,
  ) {
    const project = await this.getOwnedProject(ownerId, projectId);
    this.assertValidStatusTransition(project.status, updateProjectStatusDto.status);
    this.assertPaymentAmountEditable(project, updateProjectStatusDto.status);

    project.status = updateProjectStatusDto.status;
    project.paidAmount =
      updateProjectStatusDto.status === "paid"
        ? updateProjectStatusDto.paidAmount
        : undefined;
    project.paidAt =
      updateProjectStatusDto.status === "paid"
        ? project.paidAt ?? new Date()
        : null;

    this.ensureProjectKeyword(project);
    await project.save();

    const notification = this.buildStatusNotification(project);
    await this.notificationsService.create({
      ownerId,
      projectId: project._id,
      type: "payment_updated",
      title: notification.title,
      message: notification.message,
      projectName: project.name,
      metadata: {
        status: project.status,
        paidAmount: project.paidAmount ?? null,
      },
    });

    this.projectShareGateway.emitSharedProjectUpdated(project.shareToken, {
      project: await this.toProjectResponse(project),
    });

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async updateStatusForAdmin(
    projectId: string,
    updateProjectStatusDto: UpdateProjectStatusDto,
  ) {
    const project = await this.getProjectForAdmin(projectId);
    this.assertValidStatusTransition(project.status, updateProjectStatusDto.status);
    this.assertPaymentAmountEditable(project, updateProjectStatusDto.status);

    project.status = updateProjectStatusDto.status;
    project.paidAmount =
      updateProjectStatusDto.status === "paid"
        ? updateProjectStatusDto.paidAmount
        : undefined;
    project.paidAt =
      updateProjectStatusDto.status === "paid"
        ? project.paidAt ?? new Date()
        : null;

    this.ensureProjectKeyword(project);
    await project.save();

    const notification = this.buildStatusNotification(project);
    await this.notificationsService.create({
      ownerId: project.ownerId.toString(),
      projectId: project._id,
      type: "payment_updated",
      title: notification.title,
      message: notification.message,
      projectName: project.name,
      metadata: {
        status: project.status,
        paidAmount: project.paidAmount ?? null,
      },
    });

    this.projectShareGateway.emitSharedProjectUpdated(project.shareToken, {
      project: await this.toProjectResponse(project),
    });

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async remove(ownerId: string, projectId: string) {
    const project = await ProjectModel.findOneAndDelete({
      _id: this.toProjectObjectId(projectId),
      ownerId: this.toObjectId(ownerId),
    }).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

    return {
      deleted: true,
      id: project._id.toString(),
    };
  }

  async removeForAdmin(projectId: string) {
    const project = await ProjectModel.findByIdAndDelete(
      this.toProjectObjectId(projectId),
    ).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

    return {
      deleted: true,
      id: project._id.toString(),
    };
  }

  async removePhoto(ownerId: string, projectId: string, photoId: string) {
    const project = await this.getOwnedProject(ownerId, projectId);
    const photo = project.photos.find((item) => item.id === photoId);

    if (!photo) {
      throw new NotFoundException("Anh khong ton tai");
    }

    this.ensureProjectKeyword(project);
    photo.isDisabled = true;
    photo.disabledAt = new Date();
    await project.save();

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async removePhotoForAdmin(projectId: string, photoId: string) {
    const project = await this.getProjectForAdmin(projectId);
    const photo = project.photos.find((item) => item.id === photoId);

    if (!photo) {
      throw new NotFoundException("Anh khong ton tai");
    }

    this.ensureProjectKeyword(project);
    photo.isDisabled = true;
    photo.disabledAt = new Date();
    await project.save();

    return {
      project: await this.toProjectResponse(project),
    };
  }

  private async toProjectResponse(project: ProjectDocument) {
    await this.ensureProjectCode(project);
    await this.ensurePaidAt(project);
    await this.ensurePhotoStorageExpiration(project);

    const visiblePhotos = project.photos.filter((photo) => !photo.isDisabled);
    const isPhotoStorageExpired =
      project.status === "paid" &&
      visiblePhotos.length === 0 &&
      project.photosCleanupReason === "retention_expired";
    const [effectiveImageResizeWidth, effectiveWatermarkSettings] =
      await Promise.all([
        this.resolveEffectiveImageResizeWidth(project),
        this.resolveEffectiveWatermarkSettings(project),
      ]);

    return {
      id: project._id.toString(),
      projectCode: project.projectCode ?? null,
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      shareToken: project.shareToken,
      status: project.status,
      notes: project.notes,
      paidAmount: project.paidAmount ?? null,
      paidAt: project.paidAt ?? null,
      photosCleanedAt: project.photosCleanedAt ?? null,
      photosCleanupReason: project.photosCleanupReason ?? null,
      isPhotoStorageExpired,
      imageResizeWidth: null,
      effectiveImageResizeWidth,
      effectiveWatermarkSettings,
      createdAt: project.createdAt,
      photos: await Promise.all(
        visiblePhotos.map((photo) => this.toPhotoResponse(photo)),
      ),
      accessLogs: [...project.accessLogs].sort(
        (first, second) =>
          new Date(second.viewedAt).getTime() -
          new Date(first.viewedAt).getTime(),
      ),
    };
  }

  private recordShareAccess(
    project: ProjectDocument,
    accessMetadata: ShareAccessMetadata,
  ): ShareAccessRecord {
    const now = new Date();
    const ip = this.resolveAccessIp(accessMetadata);
    const userAgent = accessMetadata.userAgent?.trim() || "Anonymous visitor";

    project.accessLogs.unshift({
      id: randomUUID(),
      projectId: project._id.toString(),
      ip,
      userAgent,
      viewedAt: now,
      viewCount: 1,
    });

    project.accessLogs = project.accessLogs.slice(0, 200);

    return {
      ip,
      userAgent,
      viewedAt: now,
    };
  }

  private resolveAccessIp(accessMetadata: ShareAccessMetadata) {
    const forwardedIp = accessMetadata.forwardedFor
      ?.split(",")
      .map((value) => value.trim())
      .find(Boolean);

    return forwardedIp || accessMetadata.realIp?.trim() || "Ẩn danh";
  }

  private async resolveEffectiveImageResizeWidth(
    project: ProjectDocument,
  ): Promise<120 | 360 | 480 | 720 | null> {
    const owner = await UserModel.findById(project.ownerId, {
      imageResizeWidth: 1,
    })
      .lean()
      .exec();
    const ownerValue = owner?.imageResizeWidth;

    if (ownerValue === null) {
      return null;
    }

    return ownerValue === 120 ||
      ownerValue === 360 ||
      ownerValue === 480 ||
      ownerValue === 720
      ? ownerValue
      : 720;
  }

  private async resolveEffectiveWatermarkSettings(
    project: ProjectDocument,
  ): Promise<WatermarkSettings> {
    const owner = await UserModel.findById(project.ownerId, {
      watermarkSettings: 1,
    })
      .lean()
      .exec();

    return this.resolveWatermarkSettings(owner?.watermarkSettings);
  }

  private resolveWatermarkSettings(value?: Partial<WatermarkSettings> | null): WatermarkSettings {
    const text = value?.text?.trim() || DEFAULT_WATERMARK_SETTINGS.text;
    const opacity =
      typeof value?.opacity === "number" && Number.isFinite(value.opacity)
        ? Math.min(1, Math.max(0.1, value.opacity))
        : DEFAULT_WATERMARK_SETTINGS.opacity;
    const position = this.isWatermarkPosition(value?.position)
      ? value.position
      : DEFAULT_WATERMARK_SETTINGS.position;
    const style = this.isWatermarkStyle(value?.style)
      ? value.style
      : DEFAULT_WATERMARK_SETTINGS.style;
    const textScale = this.resolveWatermarkNumber(
      value?.textScale,
      DEFAULT_WATERMARK_SETTINGS.textScale,
      0.5,
      3,
    );
    const rotationDegrees = this.resolveWatermarkNumber(
      value?.rotationDegrees,
      DEFAULT_WATERMARK_SETTINGS.rotationDegrees,
      -180,
      180,
    );
    const textsPerLine = this.resolveWatermarkCount(
      value?.textsPerLine,
      DEFAULT_WATERMARK_SETTINGS.textsPerLine,
      1,
      6,
    );
    const lineCount = this.resolveWatermarkCount(
      value?.lineCount,
      DEFAULT_WATERMARK_SETTINGS.lineCount,
      1,
      5,
    );
    const customX = this.resolveWatermarkCoordinate(
      value?.customX,
      DEFAULT_WATERMARK_SETTINGS.customX,
    );
    const customY = this.resolveWatermarkCoordinate(
      value?.customY,
      DEFAULT_WATERMARK_SETTINGS.customY,
    );

    return {
      text: text.slice(0, 80),
      opacity,
      textScale,
      rotationDegrees,
      textsPerLine,
      lineCount,
      customX,
      customY,
      position,
      style,
    };
  }

  private resolveWatermarkCount(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    const numericValue =
      typeof value === "number" && Number.isFinite(value)
        ? Math.round(value)
        : fallback;
    return Math.min(max, Math.max(min, numericValue));
  }

  private resolveWatermarkNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) {
    const numericValue =
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, numericValue));
  }

  private resolveWatermarkCoordinate(value: unknown, fallback: number) {
    const numericValue =
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(0.95, Math.max(0.05, numericValue));
  }

  private isWatermarkPosition(value: unknown): value is WatermarkPosition {
    return (
      value === "bottom-corners" ||
      value === "top-corners" ||
      value === "all-corners" ||
      value === "center" ||
      value === "diagonal" ||
      value === "custom"
    );
  }

  private isWatermarkStyle(value: unknown): value is WatermarkStyle {
    return (
      value === "light" ||
      value === "dark" ||
      value === "outline" ||
      value === "badge"
    );
  }

  private async toPhotoResponse(photo: Photo) {
    if (photo.storageKey) {
      const signedUrl = await this.storageService.getSignedViewUrl(
        photo.storageKey,
      );
      return {
        id: photo.id,
        projectId: photo.projectId,
        storageKey: photo.storageKey,
        filename: photo.filename,
        contentType: photo.contentType,
        fileSize: photo.fileSize,
        previewUrl: signedUrl,
        originalUrl: signedUrl,
        width: photo.width,
        height: photo.height,
      };
    }

    return {
      id: photo.id,
      projectId: photo.projectId,
      storageKey: photo.storageKey,
      filename: photo.filename,
      contentType: photo.contentType,
      fileSize: photo.fileSize,
      previewUrl: photo.previewUrl ?? photo.originalUrl ?? "",
      originalUrl: photo.originalUrl ?? photo.previewUrl ?? "",
      width: photo.width,
      height: photo.height,
    };
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value);
  }

  private toProjectObjectId(projectId: string) {
    if (!isValidObjectId(projectId)) {
      throw new NotFoundException("Project khong ton tai");
    }

    return new Types.ObjectId(projectId);
  }

  private generateShareToken() {
    return `share-${randomBytes(12).toString("hex")}`;
  }

  private async getOwnedProject(ownerId: string, projectId: string) {
    const project = await ProjectModel.findOne({
      _id: this.toProjectObjectId(projectId),
      ownerId: this.toObjectId(ownerId),
    }).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

    return project;
  }

  private async getProjectForAdmin(projectId: string) {
    const project = await ProjectModel.findById(
      this.toProjectObjectId(projectId),
    ).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

    return project;
  }

  private buildPhotoStorageKey(
    ownerId: string,
    projectId: string,
    fileName: string,
  ) {
    const safeFileName =
      fileName
        .trim()
        .split("/")
        .pop()
        ?.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo.jpg";
    const randomPart = randomBytes(4).toString("hex");

    return `projects/${ownerId}/${projectId}/${Date.now()}-${randomPart}-${safeFileName}`;
  }

  private buildRandomPhotoFilename(originalFileName: string) {
    const trimmedFileName = originalFileName.trim().split("/").pop() || "photo";
    const extensionMatch = trimmedFileName.match(/(\.[a-zA-Z0-9]+)$/);
    const extension = extensionMatch?.[1]?.toLowerCase() || "";
    const randomPart = randomBytes(6).toString("hex");

    return `${Date.now()}-${randomPart}${extension}`;
  }

  private validateImageUpload(contentType: string, fileSize: number) {
    if (!contentType.startsWith("image/")) {
      throw new BadRequestException("Chi ho tro upload file anh");
    }

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowedMimeTypes.includes(contentType)) {
      throw new BadRequestException("Loai anh chua duoc ho tro");
    }

    if (
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > 30 * 1024 * 1024
    ) {
      throw new BadRequestException("Dung luong anh toi da 30MB");
    }
  }

  private assertValidStatusTransition(
    currentStatus: Project["status"],
    nextStatus: Project["status"],
  ) {
    if (currentStatus === nextStatus) {
      return;
    }

    if (currentStatus === "paid" && nextStatus !== "paid") {
      throw new BadRequestException(
        "Project đã thanh toán thì không thể chuyển sang trạng thái khác",
      );
    }

    if (currentStatus === "cancelled" && nextStatus === "waiting_payment") {
      throw new BadRequestException(
        "Project đã hủy thì không thể chuyển lại về chờ thanh toán",
      );
    }
  }

  private assertPaymentAmountEditable(
    project: ProjectDocument,
    nextStatus: Project["status"],
  ) {
    if (
      nextStatus === "paid" &&
      project.status === "paid" &&
      project.paidAmount != null
    ) {
      throw new BadRequestException(
        "Project da thanh toan va da co so tien, khong the cap nhat thanh toan",
      );
    }
  }

  private buildStatusNotification(project: ProjectDocument) {
    if (project.status === "paid") {
      return {
        title: "Project đã được đánh dấu thanh toán",
        message: `${project.name} đã thanh toán${project.paidAmount != null ? ` ${project.paidAmount.toLocaleString("vi-VN")} VNĐ` : ""}.`,
      };
    }

    if (project.status === "cancelled") {
      return {
        title: "Project đã được hủy",
        message: `${project.name} đã được đánh dấu hủy do khách không tiếp tục thanh toán.`,
      };
    }

    return {
      title: "Project đã chuyển về chờ thanh toán",
      message: `${project.name} đang chờ thanh toán.`,
    };
  }

  private buildListBaseFilter(ownerId: string | undefined, query: ListProjectsQueryDto) {
    const baseFilter: Record<string, unknown> = {};

    if (ownerId) {
      baseFilter.ownerId = this.toObjectId(ownerId);
    }

    if (query.q) {
      const normalizedQuery = this.normalizeForKeyword(query.q);
      const escapedKeywordQuery = this.escapeRegex(normalizedQuery);
      const escapedRawQuery = this.escapeRegex(query.q.trim());

      baseFilter.$or = [
        { keyword: new RegExp(escapedKeywordQuery, "i") },
        { projectCode: new RegExp(escapedRawQuery, "i") },
        { name: new RegExp(escapedRawQuery, "i") },
        { clientName: new RegExp(escapedRawQuery, "i") },
        { clientPhone: new RegExp(escapedRawQuery, "i") },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};

      if (query.dateFrom) {
        const dateFrom = new Date(query.dateFrom);
        if (!Number.isNaN(dateFrom.getTime())) {
          createdAt.$gte = dateFrom;
        }
      }

      if (query.dateTo) {
        const dateTo = new Date(query.dateTo);
        if (!Number.isNaN(dateTo.getTime())) {
          createdAt.$lte = dateTo;
        }
      }

      if (createdAt.$gte || createdAt.$lte) {
        baseFilter.createdAt = createdAt;
      }
    }

    return baseFilter;
  }

  private buildProjectKeyword(input: {
    projectCode?: string | null;
    name: string;
    clientName: string;
    clientPhone?: string | null;
    notes?: string;
  }) {
    const keyword = this.normalizeForKeyword(
      [
        input.projectCode ?? "",
        input.name,
        input.clientName,
        input.clientPhone ?? "",
        input.notes ?? "",
      ].join(" "),
    );

    return (
      keyword ||
      this.normalizeForKeyword(
        [input.clientName, input.clientPhone ?? ""].join(" "),
      )
    );
  }

  private ensureProjectKeyword(project: ProjectDocument) {
    const keyword = project.keyword?.trim();
    if (keyword) {
      return;
    }

    project.keyword = this.buildProjectKeyword({
      projectCode: project.projectCode,
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      notes: project.notes ?? undefined,
    });
  }

  private async ensureProjectCode(project: ProjectDocument) {
    if (project.projectCode?.trim()) {
      return;
    }

    project.projectCode = await this.generateProjectCode();
    project.keyword = this.buildProjectKeyword({
      projectCode: project.projectCode,
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      notes: project.notes ?? undefined,
    });

    await project.save();
  }

  private async ensurePaidAt(project: ProjectDocument) {
    if (project.status !== "paid" || project.paidAt) {
      return;
    }

    project.paidAt = project.updatedAt ?? project.createdAt ?? new Date();
    await project.save();
  }

  private async ensurePhotoStorageExpiration(project: ProjectDocument) {
    if (
      project.status !== "paid" ||
      project.photos.length > 0 ||
      project.photosCleanupReason === "retention_expired"
    ) {
      return;
    }

    const paidAt = project.paidAt ?? project.updatedAt ?? project.createdAt;
    if (!paidAt) {
      return;
    }

    const settings = await this.settingsService.getSettings();
    const cutoff = new Date(
      Date.now() - settings.paidProjectPhotoRetentionDays * 24 * 60 * 60 * 1000,
    );

    if (new Date(paidAt).getTime() > cutoff.getTime()) {
      return;
    }

    project.photosCleanedAt = project.photosCleanedAt ?? new Date();
    project.photosCleanupReason = "retention_expired";
    await project.save();
  }

  private assertPhotoStorageAvailable(project: ProjectDocument) {
    if (
      project.status === "paid" &&
      project.photos.length === 0 &&
      project.photosCleanupReason === "retention_expired"
    ) {
      throw new BadRequestException(
        "Anh cua project da qua han luu tru va khong con tren he thong",
      );
    }
  }

  private async generateProjectCode() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = `PG-${randomBytes(3).toString("hex").toUpperCase()}`;
      const exists = await ProjectModel.exists({ projectCode: candidate }).exec();

      if (!exists) {
        return candidate;
      }
    }

    return `PG-${Date.now().toString(36).toUpperCase()}-${randomBytes(2)
      .toString("hex")
      .toUpperCase()}`;
  }

  private normalizeForKeyword(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
