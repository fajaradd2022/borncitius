import { Controller, Get, Module } from '@nestjs/common';
import type { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

const STATUSES: TaskStatus[] = ['assigned', 'in_progress', 'submitted', 'rejected', 'approved'];

@Controller('dashboard')
class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  private scopeFor(user: AuthUser): Prisma.TaskInstanceWhereInput {
    if (user.role === 'admin') return {};
    if (user.role === 'spv') {
      return { OR: [{ folder: { defaultReviewerId: user.id } }, { reviewerOverrideId: user.id }] };
    }
    return { assignedTeknisiId: user.id };
  }

  /**
   * Ringkasan dashboard (PRD Bagian 11).
   *
   * Hitungan diambil lewat groupBy di database, bukan dengan menarik seluruh
   * task lalu menghitung di aplikasi — supaya tetap cepat saat data bertumbuh.
   */
  @Get('summary')
  async summary(@CurrentUser() user: AuthUser) {
    const scope = this.scopeFor(user);

    const [byStatus, byFolder, overdue, folders] = await Promise.all([
      this.prisma.taskInstance.groupBy({
        by: ['status'],
        where: scope,
        _count: { _all: true },
      }),
      this.prisma.taskInstance.groupBy({
        by: ['folderId', 'status'],
        where: scope,
        _count: { _all: true },
      }),
      this.prisma.taskInstance.findMany({
        where: {
          AND: [scope, { status: { not: 'approved' } }, { dueDate: { lt: new Date() } }],
        },
        select: {
          id: true,
          siteId: true,
          status: true,
          dueDate: true,
          folder: { select: { id: true, name: true } },
          assignedTeknisi: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
      this.prisma.folder.findMany({ select: { id: true, name: true, clientName: true } }),
    ]);

    const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const folderMap = new Map(folders.map((f) => [f.id, f]));
    const perFolder = new Map<string, Record<string, unknown>>();
    for (const row of byFolder) {
      const folder = folderMap.get(row.folderId);
      if (!folder) continue;
      const entry =
        perFolder.get(row.folderId) ??
        { ...folder, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) };
      entry[row.status] = row._count._all;
      perFolder.set(row.folderId, entry);
    }

    return { statusCounts, perFolder: Array.from(perFolder.values()), overdue };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
