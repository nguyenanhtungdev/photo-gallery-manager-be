import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { UserRole } from '../models/user.model'

type AuthenticatedRequest = {
  user?: {
    role?: UserRole
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Ban khong co quyen truy cap')
    }

    return true
  }
}
