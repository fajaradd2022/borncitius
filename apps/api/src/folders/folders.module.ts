import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

class CreateFolderDto {
  @IsString() @MaxLength(200)
  name!: string;

  @IsString() @MaxLength(200)
  clientName!: string;

  @IsUUID()
  defaultReviewerId!: string;
}

@Controller('folders')
class FoldersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Buat folder baru — admin only (PRD Bagian 3). */
  @Post()
  @Roles('admin')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateFolderDto) {
    try {
      return await this.prisma.folder.create({
        data: {
          name: dto.name,
          clientName: dto.clientName,
          defaultReviewerId: dto.defaultReviewerId,
          createdBy: user.id,
        },
        select: {
          id: true,
          name: true,
          clientName: true,
          defaultReviewer: { select: { id: true, name: true } },
        },
      });
    } catch (err) {
      // defaultReviewerId cuma pernah datang dari dropdown berisi user asli —
      // P2003 di sini praktis tidak akan pernah kejadian, tapi tetap
      // diterjemahkan supaya tidak bocor stack trace Prisma mentah ke client.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException('Reviewer default yang dipilih tidak ditemukan.');
      }
      throw err;
    }
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    // SPV hanya melihat folder yang ia review (PRD Bagian 3).
    const where = user.role === 'spv' ? { defaultReviewerId: user.id } : {};
    return this.prisma.folder.findMany({
      where,
      select: {
        id: true,
        name: true,
        clientName: true,
        createdAt: true,
        defaultReviewer: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    // Mirror scoping findAll — tanpa ini, SPV/teknisi mana pun bisa lihat
    // folder klien lain hanya dengan menebak UUID-nya.
    const where = user.role === 'spv' ? { id, defaultReviewerId: user.id } : { id };
    return this.prisma.folder.findFirstOrThrow({
      where,
      select: {
        id: true,
        name: true,
        clientName: true,
        defaultReviewer: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Hapus folder. TaskInstance.folderId adalah onDelete: Cascade — kalau
   * dibiarkan tanpa cek, folder yang masih punya task (termasuk yang sudah
   * direview) akan ikut menghapus TaskInstanceField/Attachment/ReviewLog/
   * GeneratedDocument-nya diam-diam dan melenyapkan jejak audit. Karena itu
   * folder yang masih punya task apa pun (status apa pun) ditolak dihapus.
   */
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const taskCount = await this.prisma.taskInstance.count({ where: { folderId: id } });
    if (taskCount > 0) {
      throw new BadRequestException(
        `Folder ini masih punya ${taskCount} task — hapus task itu dulu sebelum menghapus foldernya.`,
      );
    }
    await this.prisma.folder.delete({ where: { id } });
    return { id };
  }
}

@Module({ controllers: [FoldersController] })
export class FoldersModule {}
