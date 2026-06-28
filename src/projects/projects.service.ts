import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { isValidObjectId, Types } from "mongoose";
import { StorageService } from "../storage/storage.service";
import { UserModel } from "../auth/models/user.model";
import { NotificationsService } from "../notifications/notifications.service";
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

@Injectable()
export class ProjectsService {
  constructor(
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
    private readonly projectShareGateway: ProjectShareGateway,
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
    const keyword = this.buildProjectKeyword({
      name: resolvedProjectName,
      clientName: createProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      notes: createProjectDto.notes,
    });

    const project = await ProjectModel.create({
      ownerId: this.toObjectId(ownerId),
      name: resolvedProjectName,
      clientName: createProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      keyword,
      notes: createProjectDto.notes,
      shareToken: this.generateShareToken(),
      status: "waiting_payment",
      paidAmount: undefined,
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
    const resolvedProjectName =
      updateProjectDto.name?.trim() || updateProjectDto.clientName;
    const resolvedClientPhone = updateProjectDto.clientPhone?.trim() || null;
    const keyword = this.buildProjectKeyword({
      name: resolvedProjectName,
      clientName: updateProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      notes: updateProjectDto.notes,
    });

    const project = await ProjectModel.findOneAndUpdate(
      {
        _id: this.toProjectObjectId(projectId),
        ownerId: this.toObjectId(ownerId),
      },
      {
        name: resolvedProjectName,
        clientName: updateProjectDto.clientName,
        clientPhone: resolvedClientPhone,
        notes: updateProjectDto.notes,
        keyword,
      },
      {
        new: true,
      },
    ).exec();

    if (!project) {
      throw new NotFoundException("Project khong ton tai");
    }

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
    await this.getOwnedProject(ownerId, projectId);
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
    project.photos.unshift(photo);
    await project.save();

    return {
      project: await this.toProjectResponse(project),
    };
  }

  async addPhotoForAdmin(projectId: string, addProjectPhotoDto: AddProjectPhotoDto) {
    const project = await this.getProjectForAdmin(projectId);
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

    project.status = updateProjectStatusDto.status;
    project.paidAmount =
      updateProjectStatusDto.status === "paid"
        ? updateProjectStatusDto.paidAmount
        : undefined;

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

    project.status = updateProjectStatusDto.status;
    project.paidAmount =
      updateProjectStatusDto.status === "paid"
        ? updateProjectStatusDto.paidAmount
        : undefined;

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
    const visiblePhotos = project.photos.filter((photo) => !photo.isDisabled);
    const effectiveImageResizeWidth =
      await this.resolveEffectiveImageResizeWidth(project);

    return {
      id: project._id.toString(),
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      shareToken: project.shareToken,
      status: project.status,
      notes: project.notes,
      paidAmount: project.paidAmount ?? null,
      imageResizeWidth: null,
      effectiveImageResizeWidth,
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
    name: string;
    clientName: string;
    clientPhone?: string | null;
    notes?: string;
  }) {
    const keyword = this.normalizeForKeyword(
      [
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
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      notes: project.notes ?? undefined,
    });
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
