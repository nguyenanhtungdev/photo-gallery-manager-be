import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../auth/guards/admin.guard'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AddProjectPhotoDto } from './dto/add-project-photo.dto'
import { CreateProjectDto } from './dto/create-project.dto'
import { CreateProjectPhotoPresignDto } from './dto/create-project-photo-presign.dto'
import { ListProjectsQueryDto } from './dto/list-projects-query.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
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
  list(@Request() req: AuthenticatedRequest, @Query() query: ListProjectsQueryDto) {
    return this.projectsService.list(req.user.sub, query)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin')
  listForAdmin(@Query() query: ListProjectsQueryDto) {
    return this.projectsService.listForAdmin(query)
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(req.user.sub, createProjectDto)
  }

  @Get('share/:shareToken')
  getByShareToken(
    @Param('shareToken') shareToken: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('x-real-ip') realIp?: string,
  ) {
    return this.projectsService.getByShareToken(shareToken, {
      forwardedFor,
      realIp,
      userAgent,
    })
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getById(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.getById(req.user.sub, id)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/:id')
  getByIdForAdmin(@Param('id') id: string) {
    return this.projectsService.getByIdForAdmin(id)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return this.projectsService.update(req.user.sub, id, updateProjectDto)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/:id')
  updateForAdmin(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return this.projectsService.updateForAdmin(id, updateProjectDto)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/photos/presign-put')
  createPhotoUploadUrl(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() createProjectPhotoPresignDto: CreateProjectPhotoPresignDto,
  ) {
    return this.projectsService.createPhotoUploadUrl(req.user.sub, id, createProjectPhotoPresignDto)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/:id/photos/presign-put')
  createPhotoUploadUrlForAdmin(
    @Param('id') id: string,
    @Body() createProjectPhotoPresignDto: CreateProjectPhotoPresignDto,
  ) {
    return this.projectsService.createPhotoUploadUrlForAdmin(id, createProjectPhotoPresignDto)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/photos')
  addPhoto(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() addProjectPhotoDto: AddProjectPhotoDto,
  ) {
    return this.projectsService.addPhoto(req.user.sub, id, addProjectPhotoDto)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/:id/photos')
  addPhotoForAdmin(
    @Param('id') id: string,
    @Body() addProjectPhotoDto: AddProjectPhotoDto,
  ) {
    return this.projectsService.addPhotoForAdmin(id, addProjectPhotoDto)
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

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/:id/status')
  updateStatusForAdmin(
    @Param('id') id: string,
    @Body() updateProjectStatusDto: UpdateProjectStatusDto,
  ) {
    return this.projectsService.updateStatusForAdmin(id, updateProjectStatusDto)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.remove(req.user.sub, id)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/:id')
  removeForAdmin(@Param('id') id: string) {
    return this.projectsService.removeForAdmin(id)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':projectId/photos/:photoId')
  removePhoto(
    @Request() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.projectsService.removePhoto(req.user.sub, projectId, photoId)
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/:projectId/photos/:photoId')
  removePhotoForAdmin(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.projectsService.removePhotoForAdmin(projectId, photoId)
  }
}
