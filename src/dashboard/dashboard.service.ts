import { Injectable } from '@nestjs/common'
import { Types } from 'mongoose'
import { ProjectModel } from '../projects/models/project.model'

@Injectable()
export class DashboardService {
  async getOverview(ownerId: string) {
    const objectOwnerId = new Types.ObjectId(ownerId)

    const [summaryRows, recentProjects] = await Promise.all([
      ProjectModel.aggregate<{
        totalProjects: number
        paidProjects: number
        waitingProjects: number
        totalPhotos: number
        totalViewSessions: number
        totalPaidAmount: number
      }>([
        {
          $match: {
            ownerId: objectOwnerId,
          },
        },
        {
          $project: {
            status: 1,
            photoCount: {
              $size: {
                $filter: {
                  input: '$photos',
                  as: 'photo',
                  cond: { $ne: ['$$photo.isDisabled', true] },
                },
              },
            },
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
            totalPhotos: { $sum: '$photoCount' },
            totalViewSessions: { $sum: '$viewSessionCount' },
            totalPaidAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, '$paidAmount', 0],
              },
            },
          },
        },
      ]).exec(),
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

    return {
      summary: {
        ...baseSummary,
        paidPercentage,
        averagePhotosPerProject,
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
}
