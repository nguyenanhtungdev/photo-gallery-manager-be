import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { UserModel, UserRole } from '../models/user.model'

type AuthenticatedRequest = {
  user?: {
    sub?: string
    role?: UserRole
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    if (request.user?.role === 'admin') {
      return true
    }

    if (request.user?.sub) {
      const user = await UserModel.findById(request.user.sub)
        .select({ role: 1 })
        .lean()
        .exec()

      if (user?.role === 'admin') {
        return true
      }
    }

    throw new ForbiddenException('Ban khong co quyen truy cap')
  }
}
