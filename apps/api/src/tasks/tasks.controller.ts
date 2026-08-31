import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsObject, IsOptional } from 'class-validator';
import { TasksService } from './tasks.service';
import { WorkflowService } from './workflow.service';
import {
  BulkCreateDto,
  BulkDeleteDto,
  CreateTaskDto,
  EditFieldDto,
  ReopenTaskDto,
  ReviewFieldDto,
  SaveFieldValueDto,
} from './dto/task.dto';
import { CreateTaskService } from './create-task.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

class AttachmentMetaDto {
  @IsIn(['photo_taken', 'photo_uploaded', 'file_uploaded', 'signed_document'])
  type!: 'photo_taken' | 'photo_uploaded' | 'file_uploaded' | 'signed_document';

  @IsOptional()
  @IsObject()
  watermark?: Record<string, unknown>;
}

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly workflow: WorkflowService,
    private readonly creator: CreateTaskService,
  ) {}

  // ── Pembuatan task ─────────────────────────────────────────────────────

  @Post()
  @Roles('admin', 'spv')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.creator.createOne(user, dto);
  }

  @Post('bulk')
  @Roles('admin', 'spv')
  @HttpCode(200)
  bulkCreate(@CurrentUser() user: AuthUser, @Body() dto: BulkCreateDto) {
    return this.creator.createMany(user, dto.folderId, dto.templateId, dto.rows);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('folderId') folderId?: string) {
    return this.tasks.findAll(user, folderId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.findOne(user, id);
  }

  // ── Penghapusan task (hanya yang belum pernah direview) ──────────────────

  @Delete(':id')
  @Roles('admin', 'spv')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.removeOne(user, id);
  }

  @Post('bulk-delete')
  @Roles('admin', 'spv')
  @HttpCode(200)
  bulkRemove(@CurrentUser() user: AuthUser, @Body() dto: BulkDeleteDto) {
    return this.tasks.removeMany(user, dto.ids);
  }

  // ── Lampiran ───────────────────────────────────────────────────────────

  @Post(':taskId/fields/:fieldId/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { type?: string; watermark?: string },
  ) {
    if (!file) throw new BadRequestException('Berkas wajib diunggah pada field "file".');

    // watermark dikirim sebagai string JSON karena request-nya multipart.
    let watermark: Record<string, unknown> | undefined;
    if (body.watermark) {
      try {
        watermark = JSON.parse(body.watermark) as Record<string, unknown>;
      } catch {
        throw new BadRequestException('Field watermark harus berupa JSON yang valid.');
      }
    }

    const meta = new AttachmentMetaDto();
    meta.type = (body.type ?? 'photo_uploaded') as AttachmentMetaDto['type'];
    if (!['photo_taken', 'photo_uploaded', 'file_uploaded', 'signed_document'].includes(meta.type)) {
      throw new BadRequestException('Nilai "type" tidak dikenal.');
    }

    return this.tasks.addAttachment(user, taskId, fieldId, file, {
      type: meta.type,
      watermark,
    });
  }

  @Delete(':taskId/fields/:fieldId/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.tasks.removeAttachment(user, taskId, fieldId, attachmentId);
  }

  @Get('attachments/:attachmentId/status')
  attachmentStatus(
    @CurrentUser() user: AuthUser,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.tasks.attachmentStatus(user, attachmentId);
  }

  @Get('attachments/:attachmentId/file')
  async attachmentFile(
    @CurrentUser() user: AuthUser,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const file = await this.tasks.getAttachmentFile(user, attachmentId);
    res.setHeader('Content-Type', file.mimeType);
    // dotfiles: 'allow' — STORAGE_ROOT itself may contain a dot-prefixed
    // segment (e.g. ".storage"); express's `send` otherwise treats any such
    // segment in the resolved path as a forbidden dotfile and 404s every
    // request. The path is already traversal-checked in absolutePathFor().
    res.sendFile(file.absolutePath, { dotfiles: 'allow' });
  }

  // ── Alur kerja task ────────────────────────────────────────────────────

  @Patch(':taskId/fields/:fieldId')
  saveField(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: SaveFieldValueDto,
  ) {
    return this.workflow.saveFieldValue(user, taskId, fieldId, dto.value);
  }

  @Post(':taskId/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.workflow.submit(user, taskId);
  }

  @Post(':taskId/fields/:fieldId/review')
  @HttpCode(200)
  reviewField(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: ReviewFieldDto,
  ) {
    return this.workflow.reviewField(user, taskId, fieldId, dto.action, dto.comment);
  }

  @Patch(':taskId/fields/:fieldId/reviewer-edit')
  reviewerEdit(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: EditFieldDto,
  ) {
    return this.workflow.editFieldAsReviewer(user, taskId, fieldId, dto.value);
  }

  @Post(':taskId/send-back')
  @HttpCode(200)
  sendBack(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.workflow.sendBack(user, taskId);
  }

  @Post(':taskId/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.workflow.approveAll(user, taskId);
  }

  @Post(':taskId/reopen')
  @HttpCode(200)
  @Roles('admin')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: ReopenTaskDto,
  ) {
    return this.workflow.reopen(user, taskId, dto.reason);
  }
}
