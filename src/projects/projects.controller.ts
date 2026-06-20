import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectStatusDto } from './dto/update-project-status.dto'
import { ProjectsService } from './projects.service'

type AuthenticatedRequest = {
  user: {
    sub: string
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Request() req: AuthenticatedRequest) {
    return this.projectsService.list(req.user.sub)
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(req.user.sub, createProjectDto)
  }

  @Get('share/:shareToken')
  getByShareToken(@Param('shareToken') shareToken: string) {
    return this.projectsService.getByShareToken(shareToken)
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getById(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.getById(req.user.sub, id)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateProjectStatusDto: UpdateProjectStatusDto,
  ) {
    return this.projectsService.updateStatus(req.user.sub, id, updateProjectStatusDto)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.remove(req.user.sub, id)
  }
}
