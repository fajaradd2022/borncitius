import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

export interface CreateTaskInput {
  folderId: string;
  templateId: string;
  assignedTeknisiId: string;
  dueDate: string;
  siteId?: string;
  reviewerOverrideId?: string;
  /** Prefill isian awal, dikunci pada label field (dipakai import massal). */
  prefill?: Record<string, string>;
}

export interface BulkRowResult {
  rowNumber: number;
  status: 'created' | 'skipped';
  taskId?: string;
  siteId?: string;
  reason?: string;
}

@Injectable()
export class CreateTaskService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SPV hanya boleh membuat task di folder yang ia review (PRD Bagian 3).
   * Admin bebas.
   */
  private async assertCanCreateIn(user: AuthUser, folderId: string): Promise<void> {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: { defaultReviewerId: true },
    });
    if (!folder) throw new NotFoundException('Folder tidak ditemukan.');

    if (user.role === 'spv' && folder.defaultReviewerId !== user.id) {
      throw new ForbiddenException('Anda hanya bisa membuat task di folder yang Anda review.');
    }
  }

  async createOne(user: AuthUser, input: CreateTaskInput) {
    await this.assertCanCreateIn(user, input.folderId);

    const [template, teknisi] = await Promise.all([
      this.prisma.taskTemplate.findUnique({
        where: { id: input.templateId },
        include: { fields: { orderBy: { orderIndex: 'asc' } } },
      }),
      this.prisma.user.findUnique({
        where: { id: input.assignedTeknisiId },
        select: { id: true, role: true, isActive: true },
      }),
    ]);

    if (!template) throw new NotFoundException('Template tidak ditemukan.');
    if (!template.isActive) throw new BadRequestException('Template sedang nonaktif.');
    if (!teknisi || teknisi.role !== 'teknisi') {
      throw new BadRequestException('Penerima tugas harus akun bertipe teknisi.');
    }
    if (!teknisi.isActive) throw new BadRequestException('Akun teknisi sedang nonaktif.');

    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Format jatuh tempo tidak valid.');
    }

    return this.prisma.taskInstance.create({
      data: this.buildTaskData(template, input, dueDate),
      select: {
        id: true,
        siteId: true,
        status: true,
        dueDate: true,
        template: { select: { id: true, name: true } },
        assignedTeknisi: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Struktur field di-snapshot dari template saat task dibuat (PRD 4.1).
   * Perubahan template setelah ini tidak mengubah task yang sudah berjalan.
   */
  private buildTaskData(
    template: { id: string; version: number; fields: Array<{ id: string; label: string; fieldType: string; options: unknown; isRequired: boolean; section: string; orderIndex: number }> },
    input: CreateTaskInput,
    dueDate: Date,
  ): Prisma.TaskInstanceUncheckedCreateInput {
    const prefill = input.prefill ?? {};

    return {
      folderId: input.folderId,
      templateId: template.id,
      templateVersionSnapshot: template.version,
      assignedTeknisiId: input.assignedTeknisiId,
      reviewerOverrideId: input.reviewerOverrideId ?? null,
      siteId: input.siteId?.trim() || null,
      status: 'assigned',
      dueDate,
      fields: {
        create: template.fields.map((f) => ({
          fieldKey: f.id,
          label: f.label,
          fieldType: f.fieldType as Prisma.TaskInstanceFieldCreateInput['fieldType'],
          options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
          isRequired: f.isRequired,
          section: f.section,
          orderIndex: f.orderIndex,
          value: (prefill[f.label] ?? null) as Prisma.InputJsonValue,
        })),
      },
    };
  }

  /**
   * Import massal.
   *
   * Baris yang tidak valid dilewati dan dilaporkan beserta alasannya — satu
   * baris bermasalah tidak boleh membatalkan seluruh batch, karena admin
   * biasanya mengunggah puluhan baris sekaligus.
   */
  async createMany(
    user: AuthUser,
    folderId: string,
    templateId: string,
    rows: Array<{ rowNumber: number; teknisiEmail: string; dueDate: string; siteId?: string; prefill?: Record<string, string> }>,
  ): Promise<{ created: number; skipped: number; results: BulkRowResult[] }> {
    await this.assertCanCreateIn(user, folderId);

    const template = await this.prisma.taskTemplate.findUnique({
      where: { id: templateId },
      include: { fields: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Template tidak ditemukan.');
    if (!template.isActive) throw new BadRequestException('Template sedang nonaktif.');

    // Satu query untuk semua email, bukan satu query per baris.
    const emails = [...new Set(rows.map((r) => r.teknisiEmail.toLowerCase().trim()))];
    const teknisiList = await this.prisma.user.findMany({
      where: { email: { in: emails }, role: 'teknisi' },
      select: { id: true, email: true, isActive: true },
    });
    const byEmail = new Map(teknisiList.map((t) => [t.email.toLowerCase(), t]));

    const results: BulkRowResult[] = [];
    const toCreate: Array<{ row: (typeof rows)[number]; teknisiId: string; dueDate: Date }> = [];

    for (const row of rows) {
      const email = row.teknisiEmail?.toLowerCase().trim();
      const teknisi = email ? byEmail.get(email) : undefined;
      const dueDate = new Date(row.dueDate);

      if (!email) {
        results.push({ rowNumber: row.rowNumber, status: 'skipped', reason: 'Email teknisi kosong' });
      } else if (!teknisi) {
        results.push({ rowNumber: row.rowNumber, status: 'skipped', reason: 'Email teknisi tidak ditemukan' });
      } else if (!teknisi.isActive) {
        results.push({ rowNumber: row.rowNumber, status: 'skipped', reason: 'Akun teknisi nonaktif' });
      } else if (Number.isNaN(dueDate.getTime())) {
        results.push({ rowNumber: row.rowNumber, status: 'skipped', reason: 'Format tanggal tidak valid' });
      } else {
        toCreate.push({ row, teknisiId: teknisi.id, dueDate });
      }
    }

    // Seluruh baris valid dibuat dalam satu transaksi agar batch tidak
    // setengah jadi bila terjadi kegagalan database di tengah jalan.
    const created = await this.prisma.$transaction(
      toCreate.map((item) =>
        this.prisma.taskInstance.create({
          data: this.buildTaskData(
            template,
            {
              folderId,
              templateId,
              assignedTeknisiId: item.teknisiId,
              dueDate: item.row.dueDate,
              siteId: item.row.siteId,
              prefill: item.row.prefill,
            },
            item.dueDate,
          ),
          select: { id: true, siteId: true },
        }),
      ),
    );

    created.forEach((task, i) => {
      results.push({
        rowNumber: toCreate[i].row.rowNumber,
        status: 'created',
        taskId: task.id,
        siteId: task.siteId ?? undefined,
      });
    });

    results.sort((a, b) => a.rowNumber - b.rowNumber);

    return {
      created: created.length,
      skipped: results.length - created.length,
      results,
    };
  }
}
