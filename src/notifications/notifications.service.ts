import { Injectable, NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'
import { Notification, NotificationModel, NotificationType } from './models/notification.model'
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto'
import { NotificationsGateway } from './notifications.gateway'

type CreateNotificationInput = {
  ownerId: string | Types.ObjectId
  projectId?: string | Types.ObjectId | null
  type: NotificationType
  title: string
  message: string
  projectName?: string | null
  metadata?: Record<string, unknown>
}

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsGateway: NotificationsGateway) {}

  async list(ownerId: string, query: ListNotificationsQueryDto) {
    const ownerObjectId = this.toObjectId(ownerId)
    const offset = query.offset ?? 0
    const limit = query.limit ?? 20

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationModel.find({ ownerId: ownerObjectId })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      NotificationModel.countDocuments({ ownerId: ownerObjectId }).exec(),
      NotificationModel.countDocuments({ ownerId: ownerObjectId, readAt: null }).exec(),
    ])

    const nextOffset = offset + notifications.length

    return {
      notifications: notifications.map((notification) => this.toResponse(notification)),
      unreadCount,
      pagination: {
        offset,
        limit,
        total,
        hasMore: nextOffset < total,
        nextOffset,
      },
    }
  }

  async create(input: CreateNotificationInput) {
    const notification = await NotificationModel.create({
      ownerId: this.toObjectId(input.ownerId),
      projectId: input.projectId ? this.toObjectId(input.projectId) : null,
      type: input.type,
      title: input.title,
      message: input.message,
      projectName: input.projectName ?? null,
      metadata: input.metadata ?? {},
      readAt: null,
    })

    const unreadCount = await this.countUnread(input.ownerId)
    const response = this.toResponse(notification)

    this.notificationsGateway.emitNotificationCreated(response.ownerId, {
      notification: response,
      unreadCount,
    })

    return response
  }

  async markAsRead(ownerId: string, notificationId: string) {
    const notification = await NotificationModel.findOneAndUpdate(
      {
        _id: this.toObjectId(notificationId),
        ownerId: this.toObjectId(ownerId),
      },
      {
        readAt: new Date(),
      },
      {
        new: true,
      },
    ).exec()

    if (!notification) {
      throw new NotFoundException('Thong bao khong ton tai')
    }

    const unreadCount = await this.countUnread(ownerId)
    const readAt = notification.readAt instanceof Date
      ? notification.readAt.toISOString()
      : new Date(notification.readAt ?? Date.now()).toISOString()

    this.notificationsGateway.emitNotificationRead(ownerId, {
      notificationId: notification._id.toString(),
      readAt,
      unreadCount,
    })

    return {
      notification: this.toResponse(notification),
    }
  }

  async markAllAsRead(ownerId: string) {
    const readAt = new Date().toISOString()

    await NotificationModel.updateMany(
      {
        ownerId: this.toObjectId(ownerId),
        readAt: null,
      },
      {
        readAt: new Date(readAt),
      },
    ).exec()

    this.notificationsGateway.emitAllNotificationsRead(ownerId, {
      readAt,
      unreadCount: 0,
    })

    return {
      success: true,
    }
  }

  private toResponse(notification: Notification) {
    return {
      id: notification._id.toString(),
      ownerId: notification.ownerId.toString(),
      projectId: notification.projectId?.toString() ?? null,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      projectName: notification.projectName ?? null,
      metadata: notification.metadata ?? {},
      readAt: notification.readAt ?? null,
      createdAt: notification.createdAt,
    }
  }

  private toObjectId(value: string | Types.ObjectId) {
    return typeof value === 'string' ? new Types.ObjectId(value) : value
  }

  private countUnread(ownerId: string | Types.ObjectId) {
    return NotificationModel.countDocuments({
      ownerId: this.toObjectId(ownerId),
      readAt: null,
    }).exec()
  }
}
