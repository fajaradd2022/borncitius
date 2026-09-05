import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MirrorQueue } from '../jobs/mirror.queue';
import { DriveMirrorService } from '../drive/drive-mirror.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Status yang boleh dihapus tanpa kehilangan jejak audit — task yang belum
 * pernah direview (nol baris ReviewLog). Kalau kebijakan berubah agar
 * 'rejected' ikut boleh dihapus, cukup tambahkan di sini.
 */
export const DELETABLE_TASK_STATUSES: TaskStatus[] = ['assigned', 'in_progress'];

export interface BulkDeleteResult {
  id: string;
  status: 'deleted' | 'failed';
  reason?: string;
}

interface DeletionCandidate {
  id: string;
  localPaths: string[];
  driveRemotePaths: string[];
}

interface TaskForAttachmentGuard {
  status: TaskStatus;
  assignedTeknisiId: string;
  reviewerOverrideId: string | null;
  folder: { defaultReviewerId: string };
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mirror: MirrorQueue,
    private readonly drive: DriveMirrorService,
  ) {}

  /**
   * Pembatasan data per role (PRD Bagian 3) diterapkan di lapisan query —
   * bukan disaring setelahnya — agar data yang bukan hak pengguna tidak pernah
   * ikut terambil dari database.
   */
  private scopeFor(user: AuthUser): Prisma.TaskInstanceWhereInput {
    const scopes: Record<Role, Prisma.TaskInstanceWhereInput> = {
      admin: {},
      spv: {
        OR: [{ folder: { defaultReviewerId: user.id } }, { reviewerOverrideId: user.id }],
      },
      teknisi: { assignedTeknisiId: user.id },
    };
    return scopes[user.role];
  }

  async findAll(user: AuthUser, folderId?: string) {
    return this.prisma.taskInstance.findMany({
      where: {
        AND: [this.scopeFor(user), folderId ? { folderId } : {}],
      },
      select: {
        id: true,
        status: true,
        siteId: true,
        dueDate: true,
        submittedAt: true,
        approvedAt: true,
        createdAt: true,
        folder: { select: { id: true, name: true, clientName: true } },
        template: { select: { id: true, name: true } },
        assignedTeknisi: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const task = await this.prisma.taskInstance.findFirst({
      where: { AND: [{ id }, this.scopeFor(user)] },
      include: {
        folder: { select: { id: true, name: true, clientName: true } },
        template: { select: { id: true, name: true, version: true } },
        assignedTeknisi: { select: { id: true, name: true } },
        fields: {
          orderBy: { orderIndex: 'asc' },
          include: {
            attachments: {
              select: {
                id: true,
                type: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                syncStatus: true,
                driveUrl: true,
                capturedAt: true,
                watermarkMetadata: true,
              },
            },
          },
        },
      },
    });

    if (!task) throw new NotFoundException('Task tidak ditemukan atau bukan hak akses Anda.');
    return task;
  }

  /**
   * Otorisasi bersama untuk mengubah lampiran (unggah/hapus): teknisi hanya
   * boleh untuk task miliknya sendiri dan yang belum final/sedang direview;
   * SPV harus reviewer folder/task tersebut; admin selalu boleh. Task yang
   * sudah `approved` terkunci untuk semua role.
   */
  private assertCanModifyAttachments(user: AuthUser, task: TaskForAttachmentGuard): void {
    if (task.status === 'approved') {
      throw new ForbiddenException('Task sudah disetujui dan tidak bisa diubah lagi.');
    }
    if (user.role === 'teknisi') {
      if (task.assignedTeknisiId !== user.id) {
        throw new ForbiddenException('Task ini tidak di-assign kepada Anda.');
      }
      if (task.status === 'submitted') {
        throw new ForbiddenException('Task sedang direview, tidak bisa diubah sampai reviewer memberi keputusan.');
      }
    }
    if (user.role === 'spv') {
      const isReviewer =
        task.reviewerOverrideId === user.id || task.folder.defaultReviewerId === user.id;
      if (!isReviewer) throw new ForbiddenException('Anda bukan reviewer untuk task ini.');
    }
  }

  /** Teknisi (atau reviewer) mengunggah lampiran ke satu field. */
  async addAttachment(
    user: AuthUser,
    taskId: string,
    fieldId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    meta: { type: 'photo_taken' | 'photo_uploaded' | 'file_uploaded' | 'signed_document'; watermark?: unknown },
  ) {
    const field = await this.prisma.taskInstanceField.findFirst({
      where: { id: fieldId, taskInstanceId: taskId },
      include: { taskInstance: { include: { folder: true } } },
    });

    if (!field) throw new NotFoundException('Field task tidak ditemukan.');

    const task = field.taskInstance;
    this.assertCanModifyAttachments(user, task);

    const stored = await this.storage.save({
      buffer: file.buffer,
      declaredMime: file.mimetype,
      segments: [task.folder.name, task.siteId ?? task.id, field.label],
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        taskInstanceFieldId: field.id,
        type: meta.type,
        storagePath: stored.storagePath,
        originalName: file.originalname.slice(0, 255),
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        watermarkMetadata: (meta.watermark ?? undefined) as Prisma.InputJsonValue | undefined,
        capturedAt: new Date(),
        syncStatus: 'pending',
      },
    });

    // Task otomatis berpindah ke in_progress saat bukti pertama masuk.
    if (task.status === 'assigned') {
      await this.prisma.taskInstance.update({
        where: { id: task.id },
        data: { status: 'in_progress' },
      });
    }

    await this.mirror.enqueue(attachment.id);

    return {
      id: attachment.id,
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      syncStatus: attachment.syncStatus,
    };
  }

  /** Hapus satu lampiran — file lokal & Drive ikut dibersihkan (best-effort). */
  async removeAttachment(user: AuthUser, taskId: string, fieldId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, taskInstanceFieldId: fieldId },
      include: {
        taskInstanceField: {
          include: { taskInstance: { include: { folder: true } } },
        },
      },
    });
    if (!attachment || attachment.taskInstanceField.taskInstanceId !== taskId) {
      throw new NotFoundException('Lampiran tidak ditemukan.');
    }

    const field = attachment.taskInstanceField;
    const task = field.taskInstance;
    this.assertCanModifyAttachments(user, task);

    await this.prisma.attachment.delete({ where: { id: attachmentId } });

    await this.storage.remove(attachment.storagePath);
    if (attachment.syncStatus === 'synced') {
      const remotePath = this.drive.buildRemotePath({
        clientFolder: task.folder.name,
        siteId: task.siteId,
        taskId: task.id,
        fieldLabel: field.label,
        fileName: attachment.storagePath.split('/').pop() ?? attachment.originalName,
      });
      await this.drive.remove(remotePath);
    }

    return { id: attachmentId };
  }

  /** Mengambil path fisik + metadata untuk menyajikan berkas lampiran. */
  async getAttachmentFile(user: AuthUser, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, taskInstanceField: { taskInstance: this.scopeFor(user) } },
      select: { storagePath: true, mimeType: true, originalName: true },
    });
    if (!attachment) throw new NotFoundException('Lampiran tidak ditemukan.');
    return {
      absolutePath: this.storage.absolutePathFor(attachment.storagePath),
      mimeType: attachment.mimeType,
      originalName: attachment.originalName,
    };
  }

  async attachmentStatus(user: AuthUser, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        taskInstanceField: { taskInstance: this.scopeFor(user) },
      },
      select: {
        id: true,
        syncStatus: true,
        driveUrl: true,
        syncError: true,
        syncedAt: true,
      },
    });
    if (!attachment) throw new NotFoundException('Lampiran tidak ditemukan.');
    return attachment;
  }

  // ── Penghapusan task (hanya yang belum pernah direview) ──────────────────

  private async loadDeletionCandidates(
    user: AuthUser,
    ids: string[],
  ): Promise<{ deletable: DeletionCandidate[]; failures: BulkDeleteResult[] }> {
    const tasks = await this.prisma.taskInstance.findMany({
      where: { AND: [{ id: { in: ids } }, this.scopeFor(user)] },
      select: {
        id: true,
        status: true,
        siteId: true,
        folder: { select: { name: true } },
        fields: {
          select: { label: true, attachments: { select: { storagePath: true, syncStatus: true } } },
        },
        generatedDocument: { select: { pdfPath: true, wordPath: true } },
      },
    });
    const byId = new Map(tasks.map((t) => [t.id, t]));

    const deletable: DeletionCandidate[] = [];
    const failures: BulkDeleteResult[] = [];

    for (const id of ids) {
      const task = byId.get(id);
      if (!task) {
        failures.push({ id, status: 'failed', reason: 'Task tidak ditemukan atau bukan hak akses Anda.' });
        continue;
      }
      if (!DELETABLE_TASK_STATUSES.includes(task.status)) {
        failures.push({ id, status: 'failed', reason: 'Task yang sudah pernah direview tidak bisa dihapus.' });
        continue;
      }

      const localPaths: string[] = [];
      const driveRemotePaths: string[] = [];
      for (const field of task.fields) {
        for (const att of field.attachments) {
          localPaths.push(att.storagePath);
          if (att.syncStatus === 'synced') {
            driveRemotePaths.push(
              this.drive.buildRemotePath({
                clientFolder: task.folder.name,
                siteId: task.siteId,
                taskId: task.id,
                fieldLabel: field.label,
                fileName: att.storagePath.split('/').pop() ?? '',
              }),
            );
          }
        }
      }
      if (task.generatedDocument?.pdfPath) localPaths.push(task.generatedDocument.pdfPath);
      if (task.generatedDocument?.wordPath) localPaths.push(task.generatedDocument.wordPath);

      deletable.push({ id: task.id, localPaths, driveRemotePaths });
    }

    return { deletable, failures };
  }

  private async cleanupFiles(candidate: DeletionCandidate): Promise<void> {
    await Promise.all(candidate.localPaths.map((p) => this.storage.remove(p)));
    if (candidate.driveRemotePaths.length > 0) {
      await Promise.all(
        candidate.driveRemotePaths.map((p) =>
          this.drive.remove(p).catch((err) => {
            this.logger.warn(`Gagal menghapus berkas Drive ${p}: ${String(err)}`);
          }),
        ),
      );
    }
  }

  async removeOne(user: AuthUser, id: string): Promise<{ id: string }> {
    const { deletable, failures } = await this.loadDeletionCandidates(user, [id]);
    if (failures.length > 0) {
      const reason = failures[0].reason ?? 'Task tidak bisa dihapus.';
      if (reason.startsWith('Task tidak ditemukan')) throw new NotFoundException(reason);
      throw new BadRequestException(reason);
    }
    await this.prisma.taskInstance.delete({ where: { id } });
    await this.cleanupFiles(deletable[0]);
    return { id };
  }

  async removeMany(user: AuthUser, ids: string[]): Promise<{ results: BulkDeleteResult[] }> {
    const uniqueIds = [...new Set(ids)];
    const { deletable, failures } = await this.loadDeletionCandidates(user, uniqueIds);

    if (deletable.length > 0) {
      await this.prisma.taskInstance.deleteMany({ where: { id: { in: deletable.map((d) => d.id) } } });
      await Promise.allSettled(deletable.map((d) => this.cleanupFiles(d)));
    }

    const deletedResults: BulkDeleteResult[] = deletable.map((d) => ({ id: d.id, status: 'deleted' }));
    return { results: [...deletedResults, ...failures] };
  }
}
