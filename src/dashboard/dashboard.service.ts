import { Injectable } from '@nestjs/common'
import { PipelineStage, Types } from 'mongoose'
import { UserModel, UserRole } from '../auth/models/user.model'
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto'
import { ProjectModel } from '../projects/models/project.model'

@Injectable()
export class DashboardService {
  async getOverview(ownerId: string) {
    const objectOwnerId = new Types.ObjectId(ownerId)

    const [summaryRows, recentProjects] = await Promise.all([
      ProjectModel.aggregate<DashboardProjectSummaryRow>(
        this.buildProjectSummaryPipeline({ ownerId: objectOwnerId }),
      ).exec(),
      ProjectModel.find(
        { ownerId: objectOwnerId },
        {
          name: 1,
          clientName: 1,
          status: 1,
          paidAmount: 1,
          createdAt: 1,
          photos: 1,
        },
      )
        .sort({ createdAt: -1 })
        .limit(4)
        .lean()
        .exec(),
    ])

    const baseSummary = summaryRows[0] ?? {
      totalProjects: 0,
      paidProjects: 0,
      waitingProjects: 0,
      cancelledProjects: 0,
      totalPhotos: 0,
      totalViewSessions: 0,
      totalPaidAmount: 0,
    }

    const paidPercentage = baseSummary.totalProjects > 0
      ? Math.round((baseSummary.paidProjects / baseSummary.totalProjects) * 100)
      : 0

    const averagePhotosPerProject = baseSummary.totalProjects > 0
      ? Number((baseSummary.totalPhotos / baseSummary.totalProjects).toFixed(1))
      : 0
    const cancellationRate = baseSummary.paidProjects > 0
      ? Math.round((baseSummary.cancelledProjects / baseSummary.paidProjects) * 100)
      : 0

    return {
      summary: {
        ...baseSummary,
        paidPercentage,
        averagePhotosPerProject,
        cancellationRate,
      },
      recentProjects: recentProjects.map((project) => ({
        id: project._id.toString(),
        name: project.name,
        clientName: project.clientName,
        status: project.status,
        paidAmount: project.paidAmount ?? null,
        createdAt: project.createdAt,
        photoCount: project.photos.filter((photo: { isDisabled?: boolean }) => photo.isDisabled !== true).length,
      })),
    }
  }

  async getAdminOverview() {
    const [totalUsers, totalAdmins, activeSessions, summaryRows, recentUsers, recentProjects] =
      await Promise.all([
        UserModel.countDocuments().exec(),
        UserModel.countDocuments({ role: 'admin' }).exec(),
        UserModel.countDocuments({
          'currentSession.sessionId': { $exists: true, $ne: null },
        }).exec(),
        ProjectModel.aggregate<DashboardProjectSummaryRow>(
          this.buildProjectSummaryPipeline(),
        ).exec(),
        UserModel.find(
          {},
          {
            name: 1,
            email: 1,
            username: 1,
            role: 1,
            createdAt: 1,
            currentSession: 1,
          },
        )
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
          .exec(),
        ProjectModel.find(
          {},
          {
            ownerId: 1,
            name: 1,
            clientName: 1,
            status: 1,
            paidAmount: 1,
            createdAt: 1,
            photos: 1,
          },
        )
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
          .exec(),
      ])

    const baseSummary = summaryRows[0] ?? {
      totalProjects: 0,
      paidProjects: 0,
      waitingProjects: 0,
      cancelledProjects: 0,
      totalPhotos: 0,
      totalViewSessions: 0,
      totalPaidAmount: 0,
    }
    const paidPercentage = baseSummary.totalProjects > 0
      ? Math.round((baseSummary.paidProjects / baseSummary.totalProjects) * 100)
      : 0
    const averagePhotosPerProject = baseSummary.totalProjects > 0
      ? Number((baseSummary.totalPhotos / baseSummary.totalProjects).toFixed(1))
      : 0
    const cancellationRate = baseSummary.paidProjects > 0
      ? Math.round((baseSummary.cancelledProjects / baseSummary.paidProjects) * 100)
      : 0
    const recentProjectOwnerMap = await this.getUserDirectory(
      recentProjects.map((project) => project.ownerId.toString()),
    )

    return {
      summary: {
        totalUsers,
        totalAdmins,
        activeSessions,
        ...baseSummary,
        paidPercentage,
        averagePhotosPerProject,
        cancellationRate,
      },
      recentUsers: recentUsers.map((user) => ({
        id: user._id.toString(),
        name: user.name ?? null,
        email: user.email,
        username: user.username,
        role: this.resolveUserRole(user.role),
        createdAt: user.createdAt,
        lastLoginAt: user.currentSession?.loggedInAt ?? null,
      })),
      recentProjects: recentProjects.map((project) => ({
        id: project._id.toString(),
        owner: recentProjectOwnerMap.get(project.ownerId.toString()) ?? null,
        name: project.name,
        clientName: project.clientName,
        status: project.status,
        paidAmount: project.paidAmount ?? null,
        createdAt: project.createdAt,
        photoCount: project.photos.filter((photo: { isDisabled?: boolean }) => photo.isDisabled !== true).length,
      })),
    }
  }

  async listAdminUsers(query: ListAdminUsersQueryDto) {
    const offset = query.offset ?? 0
    const limit = query.limit ?? 20
    const search = query.search?.trim() ?? ''
    const filter = this.buildAdminUserFilter(search, query.role)

    const [users, total] = await Promise.all([
      UserModel.find(
        filter,
        {
          name: 1,
          email: 1,
          username: 1,
          role: 1,
          createdAt: 1,
          updatedAt: 1,
          currentSession: 1,
        },
      )
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      UserModel.countDocuments(filter).exec(),
    ])

    const userIds = users.map((user) => user._id)
    const projectStatsRows = userIds.length > 0
      ? await ProjectModel.aggregate<AdminUserProjectStatsRow>([
        {
          $match: {
            ownerId: { $in: userIds },
          },
        },
        {
          $project: {
            ownerId: 1,
            status: 1,
            photoCount: this.buildVisiblePhotoCountExpression(),
            viewSessionCount: { $size: '$accessLogs' },
            paidAmount: { $ifNull: ['$paidAmount', 0] },
            createdAt: 1,
          },
        },
        {
          $group: {
            _id: '$ownerId',
            projectCount: { $sum: 1 },
            paidProjectCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, 1, 0],
              },
            },
            waitingProjectCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'waiting_payment'] }, 1, 0],
              },
            },
            cancelledProjectCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0],
              },
            },
            totalPhotos: { $sum: '$photoCount' },
            totalViewSessions: { $sum: '$viewSessionCount' },
            totalPaidAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, '$paidAmount', 0],
              },
            },
            lastProjectAt: { $max: '$createdAt' },
          },
        },
      ]).exec()
      : []

    const projectStatsMap = new Map(
      projectStatsRows.map((row) => [row._id.toString(), row]),
    )
    const nextOffset = offset + users.length

    return {
      users: users.map((user) => {
        const projectStats = projectStatsMap.get(user._id.toString())

        return {
          id: user._id.toString(),
          name: user.name ?? null,
          email: user.email,
          username: user.username,
          role: this.resolveUserRole(user.role),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.currentSession?.loggedInAt ?? null,
          projectStats: {
            projectCount: projectStats?.projectCount ?? 0,
            paidProjectCount: projectStats?.paidProjectCount ?? 0,
            waitingProjectCount: projectStats?.waitingProjectCount ?? 0,
            cancelledProjectCount: projectStats?.cancelledProjectCount ?? 0,
            totalPhotos: projectStats?.totalPhotos ?? 0,
            totalViewSessions: projectStats?.totalViewSessions ?? 0,
            totalPaidAmount: projectStats?.totalPaidAmount ?? 0,
            lastProjectAt: projectStats?.lastProjectAt ?? null,
          },
        }
      }),
      pagination: {
        offset,
        limit,
        total,
        hasMore: nextOffset < total,
        nextOffset,
      },
      filters: {
        search: search || null,
        role: query.role ?? null,
      },
    }
  }

  private buildProjectSummaryPipeline(match: Record<string, unknown> = {}) {
    const pipeline: PipelineStage[] = []

    if (Object.keys(match).length > 0) {
      pipeline.push({
        $match: match,
      })
    }

    pipeline.push(
      {
        $project: {
          status: 1,
          photoCount: this.buildVisiblePhotoCountExpression(),
          viewSessionCount: { $size: '$accessLogs' },
          paidAmount: { $ifNull: ['$paidAmount', 0] },
        },
      },
      {
        $group: {
          _id: null,
          totalProjects: { $sum: 1 },
          paidProjects: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, 1, 0],
            },
          },
          waitingProjects: {
            $sum: {
              $cond: [{ $eq: ['$status', 'waiting_payment'] }, 1, 0],
            },
          },
          cancelledProjects: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0],
            },
          },
          totalPhotos: { $sum: '$photoCount' },
          totalViewSessions: { $sum: '$viewSessionCount' },
          totalPaidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$paidAmount', 0],
            },
          },
        },
      },
    )

    return pipeline
  }

  private buildVisiblePhotoCountExpression() {
    return {
      $size: {
        $filter: {
          input: '$photos',
          as: 'photo',
          cond: { $ne: ['$$photo.isDisabled', true] },
        },
      },
    }
  }

  private buildAdminUserFilter(search: string, role?: 'admin' | 'user') {
    const filter: Record<string, unknown> = {}

    if (role) {
      filter.role = role
    }

    if (search) {
      const pattern = new RegExp(this.escapeRegex(search), 'i')
      filter.$or = [
        { name: pattern },
        { email: pattern },
        { username: pattern },
      ]
    }

    return filter
  }

  private async getUserDirectory(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)].filter(Boolean)

    if (uniqueIds.length === 0) {
      return new Map<string, AdminDirectoryUser>()
    }

    const users = await UserModel.find(
      {
        _id: {
          $in: uniqueIds.map((value) => new Types.ObjectId(value)),
        },
      },
      {
        name: 1,
        email: 1,
        username: 1,
        role: 1,
      },
    )
      .lean()
      .exec()

    return new Map(
      users.map((user) => [
        user._id.toString(),
        {
          id: user._id.toString(),
          name: user.name ?? null,
          email: user.email,
          username: user.username,
          role: this.resolveUserRole(user.role),
        },
      ]),
    )
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private resolveUserRole(role?: UserRole | null): UserRole {
    return role === 'admin' ? 'admin' : 'user'
  }
}

type DashboardProjectSummaryRow = {
  totalProjects: number
  paidProjects: number
  waitingProjects: number
  cancelledProjects: number
  totalPhotos: number
  totalViewSessions: number
  totalPaidAmount: number
}

type AdminUserProjectStatsRow = {
  _id: Types.ObjectId
  projectCount: number
  paidProjectCount: number
  waitingProjectCount: number
  cancelledProjectCount: number
  totalPhotos: number
  totalViewSessions: number
  totalPaidAmount: number
  lastProjectAt?: Date | null
}

type AdminDirectoryUser = {
  id: string
  name: string | null
  email: string
  username: string
  role: UserRole
}
