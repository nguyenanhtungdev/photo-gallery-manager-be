import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes, randomUUID } from 'node:crypto'
import { isValidObjectId, Types } from 'mongoose'
import { StorageService } from '../storage/storage.service'
import { AddProjectPhotoDto } from './dto/add-project-photo.dto'
import { CreateProjectDto } from './dto/create-project.dto'
import { CreateProjectPhotoPresignDto } from './dto/create-project-photo-presign.dto'
import { ListProjectsQueryDto } from './dto/list-projects-query.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { UpdateProjectStatusDto } from './dto/update-project-status.dto'
import { Photo, Project, ProjectDocument, ProjectModel } from './models/project.model'

@Injectable()
export class ProjectsService {
  constructor(private readonly storageService: StorageService) {}

  async list(ownerId: string, query: ListProjectsQueryDto) {
    const baseFilter = this.buildListBaseFilter(ownerId, query)
    const listFilter = {
      ...baseFilter,
      ...(query.status ? { status: query.status } : {}),
    }
    const offset = query.offset ?? 0
    const limit = query.limit ?? 12

    const [projects, total, paidCount, waitingPaymentCount] = await Promise.all([
      ProjectModel.find(listFilter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      ProjectModel.countDocuments(listFilter).exec(),
      ProjectModel.countDocuments({ ...baseFilter, status: 'paid' }).exec(),
      ProjectModel.countDocuments({ ...baseFilter, status: 'waiting_payment' }).exec(),
    ])

    const resolvedProjects = await Promise.all(projects.map((project) => this.toProjectResponse(project)))
    const nextOffset = offset + resolvedProjects.length

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
        all: paidCount + waitingPaymentCount,
        paid: paidCount,
        waiting_payment: waitingPaymentCount,
      },
    }
  }

  async create(ownerId: string, createProjectDto: CreateProjectDto) {
    const resolvedProjectName = createProjectDto.name?.trim() || createProjectDto.clientName
    const resolvedClientPhone = createProjectDto.clientPhone?.trim() || null
    const keyword = this.buildProjectKeyword({
      name: resolvedProjectName,
      clientName: createProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      notes: createProjectDto.notes,
    })

    const project = await ProjectModel.create({
      ownerId: this.toObjectId(ownerId),
      name: resolvedProjectName,
      clientName: createProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      keyword,
      notes: createProjectDto.notes,
      shareToken: this.generateShareToken(),
      status: 'waiting_payment',
      paidAmount: undefined,
      photos: [],
      accessLogs: [],
    })

    return {
      project: await this.toProjectResponse(project),
    }
  }

  async getById(ownerId: string, projectId: string) {
    const project = await ProjectModel.findOne({
      _id: this.toProjectObjectId(projectId),
      ownerId: this.toObjectId(ownerId),
    }).exec()

    if (!project) {
      throw new NotFoundException('Project khong ton tai')
    }

    return {
      project: await this.toProjectResponse(project),
    }
  }

  async update(ownerId: string, projectId: string, updateProjectDto: UpdateProjectDto) {
    const resolvedProjectName = updateProjectDto.name?.trim() || updateProjectDto.clientName
    const resolvedClientPhone = updateProjectDto.clientPhone?.trim() || null
    const keyword = this.buildProjectKeyword({
      name: resolvedProjectName,
      clientName: updateProjectDto.clientName,
      clientPhone: resolvedClientPhone,
      notes: updateProjectDto.notes,
    })

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
    ).exec()

    if (!project) {
      throw new NotFoundException('Project khong ton tai')
    }

    return {
      project: await this.toProjectResponse(project),
    }
  }

  async getByShareToken(shareToken: string) {
    const project = await ProjectModel.findOne({
      shareToken: shareToken.trim(),
    }).exec()

    if (!project) {
      throw new NotFoundException('Project khong ton tai')
    }

    return {
      project: await this.toProjectResponse(project),
    }
  }

  async createPhotoUploadUrl(
    ownerId: string,
    projectId: string,
    createProjectPhotoPresignDto: CreateProjectPhotoPresignDto,
  ) {
    await this.getOwnedProject(ownerId, projectId)
    this.validateImageUpload(
      createProjectPhotoPresignDto.contentType,
      createProjectPhotoPresignDto.fileSize,
    )

    const key = this.buildPhotoStorageKey(
      ownerId,
      projectId,
      createProjectPhotoPresignDto.fileName,
    )
    const uploadUrl = await this.storageService.getSignedUploadUrl(
      key,
      createProjectPhotoPresignDto.contentType,
    )

    return {
      key,
      uploadUrl,
      method: 'PUT',
      contentType: createProjectPhotoPresignDto.contentType,
      expiresIn: 600,
    }
  }

  async addPhoto(ownerId: string, projectId: string, addProjectPhotoDto: AddProjectPhotoDto) {
    const project = await this.getOwnedProject(ownerId, projectId)
    this.validateImageUpload(addProjectPhotoDto.contentType, addProjectPhotoDto.fileSize)

    const photo: Photo = {
      id: randomUUID(),
      projectId,
      filename: addProjectPhotoDto.filename,
      storageKey: addProjectPhotoDto.key,
      isDisabled: false,
      disabledAt: null,
      contentType: addProjectPhotoDto.contentType,
      fileSize: addProjectPhotoDto.fileSize,
      width: addProjectPhotoDto.width ?? 0,
      height: addProjectPhotoDto.height ?? 0,
    }

    this.ensureProjectKeyword(project)
    project.photos.unshift(photo)
    await project.save()

    return {
      project: await this.toProjectResponse(project),
    }
  }

  async updateStatus(ownerId: string, projectId: string, updateProjectStatusDto: UpdateProjectStatusDto) {
    const project = await ProjectModel.findOneAndUpdate(
      {
        _id: this.toProjectObjectId(projectId),
        ownerId: this.toObjectId(ownerId),
      },
      {
        status: updateProjectStatusDto.status,
        paidAmount: updateProjectStatusDto.status === 'paid'
          ? (updateProjectStatusDto.paidAmount ?? null)
          : null,
      },
      {
        new: true,
      },
    ).exec()

    if (!project) {
      throw new NotFoundException('Project khong ton tai')
    }

    this.ensureProjectKeyword(project)
    await project.save()

    return {
      project: await this.toProjectResponse(project),
    }
  }

  async remove(ownerId: string, projectId: string) {
    const project = await ProjectModel.findOneAndDelete({
      _id: this.toProjectObjectId(projectId),
      ownerId: this.toObjectId(ownerId),
    }).exec()

    if (!project) {
      throw new NotFoundException('Project khong ton tai')
    }

    return {
      deleted: true,
      id: project._id.toString(),
    }
  }

  async removePhoto(ownerId: string, projectId: string, photoId: string) {
    const project = await this.getOwnedProject(ownerId, projectId)
    const photo = project.photos.find((item) => item.id === photoId)

    if (!photo) {
      throw new NotFoundException('Anh khong ton tai')
    }

    this.ensureProjectKeyword(project)
    photo.isDisabled = true
    photo.disabledAt = new Date()
    await project.save()

    return {
      project: await this.toProjectResponse(project),
    }
  }

  private async toProjectResponse(project: ProjectDocument) {
    const visiblePhotos = project.photos.filter((photo) => !photo.isDisabled)

    return {
      id: project._id.toString(),
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      shareToken: project.shareToken,
      status: project.status,
      notes: project.notes,
      paidAmount: project.paidAmount ?? null,
      createdAt: project.createdAt,
      photos: await Promise.all(visiblePhotos.map((photo) => this.toPhotoResponse(photo))),
      accessLogs: project.accessLogs,
    }
  }

  private async toPhotoResponse(photo: Photo) {
    if (photo.storageKey) {
      const signedUrl = await this.storageService.getSignedViewUrl(photo.storageKey)
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
      }
    }

    return {
      id: photo.id,
      projectId: photo.projectId,
      storageKey: photo.storageKey,
      filename: photo.filename,
      contentType: photo.contentType,
      fileSize: photo.fileSize,
      previewUrl: photo.previewUrl ?? photo.originalUrl ?? '',
      originalUrl: photo.originalUrl ?? photo.previewUrl ?? '',
      width: photo.width,
      height: photo.height,
    }
  }

  private toObjectId(value: string) {
    return new Types.ObjectId(value)
  }

  private toProjectObjectId(projectId: string) {
    if (!isValidObjectId(projectId)) {
      throw new NotFoundException('Project khong ton tai')
    }

    return new Types.ObjectId(projectId)
  }

  private generateShareToken() {
    return `share-${randomBytes(12).toString('hex')}`
  }

  private async getOwnedProject(ownerId: string, projectId: string) {
    const project = await ProjectModel.findOne({
      _id: this.toProjectObjectId(projectId),
      ownerId: this.toObjectId(ownerId),
    }).exec()

    if (!project) {
      throw new NotFoundException('Project khong ton tai')
    }

    return project
  }

  private buildPhotoStorageKey(ownerId: string, projectId: string, fileName: string) {
    const safeFileName = fileName
      .trim()
      .split('/')
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo.jpg'
    const randomPart = randomBytes(4).toString('hex')

    return `projects/${ownerId}/${projectId}/${Date.now()}-${randomPart}-${safeFileName}`
  }

  private validateImageUpload(contentType: string, fileSize: number) {
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Chi ho tro upload file anh')
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedMimeTypes.includes(contentType)) {
      throw new BadRequestException('Loai anh chua duoc ho tro')
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 30 * 1024 * 1024) {
      throw new BadRequestException('Dung luong anh toi da 30MB')
    }
  }

  private buildListBaseFilter(ownerId: string, query: ListProjectsQueryDto) {
    const baseFilter: Record<string, unknown> = {
      ownerId: this.toObjectId(ownerId),
    }

    if (query.q) {
      const normalizedQuery = this.normalizeForKeyword(query.q)
      const escapedKeywordQuery = this.escapeRegex(normalizedQuery)
      const escapedRawQuery = this.escapeRegex(query.q.trim())

      baseFilter.$or = [
        { keyword: new RegExp(escapedKeywordQuery, 'i') },
        { name: new RegExp(escapedRawQuery, 'i') },
        { clientName: new RegExp(escapedRawQuery, 'i') },
        { clientPhone: new RegExp(escapedRawQuery, 'i') },
      ]
    }

    if (query.dateFrom || query.dateTo) {
      const createdAt: { $gte?: Date; $lte?: Date } = {}

      if (query.dateFrom) {
        const dateFrom = new Date(query.dateFrom)
        if (!Number.isNaN(dateFrom.getTime())) {
          createdAt.$gte = dateFrom
        }
      }

      if (query.dateTo) {
        const dateTo = new Date(query.dateTo)
        if (!Number.isNaN(dateTo.getTime())) {
          createdAt.$lte = dateTo
        }
      }

      if (createdAt.$gte || createdAt.$lte) {
        baseFilter.createdAt = createdAt
      }
    }

    return baseFilter
  }

  private buildProjectKeyword(input: {
    name: string
    clientName: string
    clientPhone?: string | null
    notes?: string
  }) {
    const keyword = this.normalizeForKeyword(
      [input.name, input.clientName, input.clientPhone ?? '', input.notes ?? ''].join(' '),
    )

    return keyword || this.normalizeForKeyword([input.clientName, input.clientPhone ?? ''].join(' '))
  }

  private ensureProjectKeyword(project: ProjectDocument) {
    const keyword = project.keyword?.trim()
    if (keyword) {
      return
    }

    project.keyword = this.buildProjectKeyword({
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      notes: project.notes ?? undefined,
    })
  }

  private normalizeForKeyword(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
