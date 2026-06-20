import { Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { isValidObjectId, Types } from 'mongoose'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectStatusDto } from './dto/update-project-status.dto'
import { ProjectDocument, ProjectModel } from './models/project.model'

@Injectable()
export class ProjectsService {
  async list(ownerId: string) {
    const projects = await ProjectModel.find({
      ownerId: this.toObjectId(ownerId),
    })
      .sort({ createdAt: -1 })
      .exec()

    return {
      projects: projects.map((project) => this.toProjectResponse(project)),
    }
  }

  async create(ownerId: string, createProjectDto: CreateProjectDto) {
    const project = await ProjectModel.create({
      ownerId: this.toObjectId(ownerId),
      name: createProjectDto.name,
      clientName: createProjectDto.clientName,
      clientPhone: createProjectDto.clientPhone,
      notes: createProjectDto.notes,
      shareToken: this.generateShareToken(),
      status: 'waiting_payment',
      photos: [],
      accessLogs: [],
    })

    return {
      project: this.toProjectResponse(project),
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
      project: this.toProjectResponse(project),
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
      project: this.toProjectResponse(project),
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
      },
      {
        new: true,
      },
    ).exec()

    if (!project) {
      throw new NotFoundException('Project khong ton tai')
    }

    return {
      project: this.toProjectResponse(project),
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

  private toProjectResponse(project: ProjectDocument) {
    return {
      id: project._id.toString(),
      name: project.name,
      clientName: project.clientName,
      clientPhone: project.clientPhone,
      shareToken: project.shareToken,
      status: project.status,
      notes: project.notes,
      createdAt: project.createdAt,
      photos: project.photos,
      accessLogs: project.accessLogs,
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
}
