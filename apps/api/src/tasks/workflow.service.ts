import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TaskInstance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

const ATTACHMENT_TYPES = ['photo', 'file', 'signed_document'];

/**
 * Alur kerja task (PRD 4.4 & 5.7): pengisian oleh teknisi, submit, review per
 * field, revisi langsung reviewer, kirim balik, dan approve akhir.
 *
 * Setiap aksi reviewer dicatat ke ReviewLog agar jejak audit lengkap dan tidak
 * bisa dihapus.
 */
@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadTask(taskId: string): Promise<TaskInstance & { folder: { defaultReviewerId: string } }> {
    const task = await this.prisma.taskInstance.findUnique({
      where: { id: taskId },
      include: { folder: { select: { defaultReviewerId: true } } },
    });
    if (!task) throw new NotFoundException('Task tidak ditemukan.');
    return task;
  }

  /** Reviewer sah = admin, atau SPV yang ditunjuk di folder / override task. */
  private assertCanReview(user: AuthUser, task: TaskInstance & { folder: { defaultReviewerId: string } }): void {
    if (user.role === 'admin') return;
    const isReviewer =
      user.role === 'spv' &&
      (task.reviewerOverrideId === user.id || task.folder.defaultReviewerId === user.id);
    if (!isReviewer) {
      throw new ForbiddenException('Anda bukan reviewer untuk task ini.');
    }
  }

  private assertCanFill(user: AuthUser, task: TaskInstance & { folder: { defaultReviewerId: string } }): void {
    if (task.status === 'approved') {
      throw new ForbiddenException('Task sudah disetujui dan tidak bisa diubah lagi.');
    }
    if (user.role === 'teknisi') {
      if (task.assignedTeknisiId !== user.id) {
        throw new ForbiddenException('Task ini tidak di-assign kepada Anda.');
      }
      // Task yang sudah disubmit sedang menunggu review — teknisi tidak boleh
      // diam-diam mengubah isian yang sedang dilihat reviewer (celah yang
      // ditemukan saat QC: sebelumnya cuma status 'approved' yang dikunci).
      if (task.status === 'submitted') {
        throw new ForbiddenException('Task sedang direview, tidak bisa diubah sampai reviewer memberi keputusan.');
      }
    }
    if (user.role === 'spv') this.assertCanReview(user, task);
  }

  /** Teknisi (atau Admin/SPV) menyimpan isian satu field. */
  async saveFieldValue(user: AuthUser, taskId: string, fieldId: string, value: string | undefined) {
    const task = await this.loadTask(taskId);
    this.assertCanFill(user, task);

    const field = await this.prisma.taskInstanceField.findFirst({
      where: { id: fieldId, taskInstanceId: taskId },
      select: { id: true, reviewStatus: true },
    });
    if (!field) throw new NotFoundException('Field tidak ditemukan.');

    // Field yang sudah di-approve tidak boleh diubah teknisi saat revisi (PRD 4.4).
    if (user.role === 'teknisi' && task.status === 'rejected' && field.reviewStatus === 'approved') {
      throw new ForbiddenException('Field ini sudah disetujui dan terkunci.');
    }

    // Nilai dikirim sebagai string. Untuk field terstruktur (repeat_table) string
    // berisi JSON array/objek — parse dulu agar tersimpan sebagai JSON asli di
    // kolom Json (bukan string ter-escape / double-encoded).
    let toStore: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
    if (value != null) {
      const t = value.trim();
      if (t.startsWith('[') || t.startsWith('{')) {
        try {
          toStore = JSON.parse(t) as Prisma.InputJsonValue;
        } catch {
          toStore = value; // bukan JSON valid — simpan apa adanya
        }
      } else {
        toStore = value;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.taskInstanceField.update({
        where: { id: fieldId },
        data: { value: toStore },
        select: { id: true, value: true, reviewStatus: true },
      });

      if (task.status === 'assigned') {
        await tx.taskInstance.update({ where: { id: taskId }, data: { status: 'in_progress' } });
      }
      return result;
    });

    return updated;
  }

  /** Submit: semua field wajib harus terisi lebih dulu. */
  async submit(user: AuthUser, taskId: string) {
    const task = await this.loadTask(taskId);
    this.assertCanFill(user, task);

    if (task.status === 'submitted') {
      throw new BadRequestException('Task sudah disubmit dan sedang menunggu review.');
    }

    const fields = await this.prisma.taskInstanceField.findMany({
      where: { taskInstanceId: taskId, isRequired: true, fieldType: { not: 'section' } },
      select: { id: true, label: true, fieldType: true, value: true, _count: { select: { attachments: true } } },
    });

    const missing = fields
      .filter((f) =>
        ATTACHMENT_TYPES.includes(f.fieldType)
          ? f._count.attachments === 0
          : f.value === null || f.value === '',
      )
      .map((f) => f.label);

    if (missing.length > 0) {
      throw new BadRequestException(`Field wajib belum lengkap: ${missing.join(', ')}`);
    }

    return this.prisma.taskInstance.update({
      where: { id: taskId },
      data: { status: 'submitted', submittedAt: new Date() },
      select: { id: true, status: true, submittedAt: true },
    });
  }

  /** Approve/reject satu field. Reject wajib disertai komentar. */
  async reviewField(
    user: AuthUser,
    taskId: string,
    fieldId: string,
    action: 'approve' | 'reject',
    comment?: string,
  ) {
    const task = await this.loadTask(taskId);
    this.assertCanReview(user, task);

    if (action === 'reject' && !comment?.trim()) {
      throw new BadRequestException('Komentar wajib diisi saat menolak sebuah field.');
    }

    const field = await this.prisma.taskInstanceField.findFirst({
      where: { id: fieldId, taskInstanceId: taskId },
      select: { id: true },
    });
    if (!field) throw new NotFoundException('Field tidak ditemukan.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskInstanceField.update({
        where: { id: fieldId },
        data: {
          reviewStatus: action === 'approve' ? 'approved' : 'rejected',
          rejectComment: action === 'reject' ? comment?.trim() : null,
          reviewedBy: user.id,
          reviewedAt: new Date(),
        },
        select: { id: true, reviewStatus: true, rejectComment: true },
      });

      await tx.reviewLog.create({
        data: {
          taskInstanceId: taskId,
          reviewerId: user.id,
          taskInstanceFieldId: fieldId,
          action: action === 'approve' ? 'approve_field' : 'reject_field',
          comment: comment?.trim(),
        },
      });

      return updated;
    });
  }

  /** Revisi langsung oleh reviewer — nilai lama disimpan di jejak audit (PRD 4.4). */
  async editFieldAsReviewer(user: AuthUser, taskId: string, fieldId: string, value: string) {
    const task = await this.loadTask(taskId);
    this.assertCanReview(user, task);

    const field = await this.prisma.taskInstanceField.findFirst({
      where: { id: fieldId, taskInstanceId: taskId },
      select: { id: true, value: true },
    });
    if (!field) throw new NotFoundException('Field tidak ditemukan.');

    // Field terstruktur (repeat_table) dikirim sbg string JSON array/objek —
    // parse dulu agar tersimpan sbg JSON asli (bukan string ter-escape ganda).
    let storeValue: Prisma.InputJsonValue = value as Prisma.InputJsonValue;
    if (typeof value === 'string') {
      const t = value.trim();
      if (t.startsWith('[') || t.startsWith('{')) {
        try { storeValue = JSON.parse(t) as Prisma.InputJsonValue; } catch { /* simpan apa adanya */ }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskInstanceField.update({
        where: { id: fieldId },
        data: {
          value: storeValue,
          reviewStatus: 'approved',
          rejectComment: null,
          lastEditedBy: user.id,
          lastEditedAt: new Date(),
        },
        select: { id: true, value: true, reviewStatus: true, lastEditedBy: true },
      });

      await tx.reviewLog.create({
        data: {
          taskInstanceId: taskId,
          reviewerId: user.id,
          taskInstanceFieldId: fieldId,
          action: 'edit_field',
          previousValue: (field.value ?? undefined) as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  /** Kirim balik ke teknisi — hanya bila ada minimal satu field ditolak. */
  async sendBack(user: AuthUser, taskId: string, assignedTeknisiId?: string) {
    const task = await this.loadTask(taskId);
    this.assertCanReview(user, task);

    const rejected = await this.prisma.taskInstanceField.count({
      where: { taskInstanceId: taskId, reviewStatus: 'rejected' },
    });
    if (rejected === 0) {
      throw new BadRequestException('Tidak ada field yang ditolak — tidak perlu dikirim balik.');
    }

    // Fleksibel: reviewer boleh menugaskan revisi ke teknisi mana saja.
    // Validasi teknisi tujuan bila diberikan.
    let reassignId: string | undefined;
    if (assignedTeknisiId && assignedTeknisiId !== task.assignedTeknisiId) {
      const teknisi = await this.prisma.user.findFirst({
        where: { id: assignedTeknisiId, role: 'teknisi', isActive: true },
        select: { id: true },
      });
      if (!teknisi) {
        throw new BadRequestException('Teknisi tujuan tidak ditemukan atau tidak aktif.');
      }
      reassignId = teknisi.id;
    }

    return this.prisma.taskInstance.update({
      where: { id: taskId },
      data: {
        status: 'rejected',
        ...(reassignId ? { assignedTeknisiId: reassignId } : {}),
      },
      select: { id: true, status: true, assignedTeknisiId: true },
    });
  }

  /** Approve akhir — hanya bila seluruh field sudah approved. */
  async approveAll(user: AuthUser, taskId: string) {
    const task = await this.loadTask(taskId);
    this.assertCanReview(user, task);

    // Approve hanya boleh untuk task yang SUDAH disubmit teknisi. Task yang
    // baru dikirim balik (rejected) / masih dikerjakan belum boleh di-approve —
    // harus disubmit ulang dari web-teknisi dulu.
    if (task.status !== 'submitted') {
      throw new BadRequestException(
        'Task hanya bisa disetujui setelah disubmit ulang oleh teknisi.',
      );
    }

    // TestCall: bila ada field repeat_table, field photo & repeat_table dikelola
    // sebagai satu kesatuan di dalam tabel (bukan approve per-field). Kecualikan
    // dari syarat "semua field disetujui" agar approve-all tidak terkunci.
    const hasRepeat = await this.prisma.taskInstanceField.count({
      where: { taskInstanceId: taskId, fieldType: 'repeat_table' },
    });
    const excludedTypes: Array<'section' | 'photo' | 'repeat_table'> =
      hasRepeat > 0 ? ['section', 'photo', 'repeat_table'] : ['section'];

    const pending = await this.prisma.taskInstanceField.count({
      where: {
        taskInstanceId: taskId,
        fieldType: { notIn: excludedTypes },
        reviewStatus: { not: 'approved' },
      },
    });
    if (pending > 0) {
      throw new BadRequestException(`Masih ada ${pending} field yang belum disetujui.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskInstance.update({
        where: { id: taskId },
        data: { status: 'approved', approvedAt: new Date() },
        select: { id: true, status: true, approvedAt: true },
      });

      await tx.reviewLog.create({
        data: { taskInstanceId: taskId, reviewerId: user.id, action: 'approve_all' },
      });

      return updated;
    });
  }

  /**
   * Buka kembali task yang sudah full-approved — supaya bisa tambah foto atau
   * edit isian di kemudian hari tanpa membuat task baru. Sengaja TIDAK
   * me-reset reviewStatus field manapun (field yang sudah approved tetap
   * approved) supaya "Approve Semua" bisa langsung sukses lagi tanpa
   * memaksa re-review menyeluruh — alasan wajib diisi sebagai gantinya,
   * supaya kenapa-nya tetap tercatat di jejak audit.
   */
  async reopen(user: AuthUser, taskId: string, reason: string) {
    const task = await this.loadTask(taskId);
    // Sengaja lebih ketat dari assertCanReview (yang juga mengizinkan spv) —
    // reopen membatalkan approval formal, jadi dikunci admin-only. Dicek lagi
    // di sini (bukan cuma andalkan @Roles di controller) sebagai jaga-jaga
    // kalau suatu saat @Roles controller berubah tanpa sadar melonggarkan ini.
    if (user.role !== 'admin') {
      throw new ForbiddenException('Hanya admin yang bisa membuka kembali task yang sudah disetujui.');
    }

    if (task.status !== 'approved') {
      throw new BadRequestException('Task belum disetujui, tidak perlu dibuka kembali.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskInstance.update({
        where: { id: taskId },
        data: { status: 'in_progress', approvedAt: null },
        select: { id: true, status: true, approvedAt: true },
      });

      await tx.reviewLog.create({
        data: { taskInstanceId: taskId, reviewerId: user.id, action: 'reopen', comment: reason },
      });

      return updated;
    });
  }
}
