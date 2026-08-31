import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @IsEmail() @MaxLength(255)
  email!: string;

  @IsString() @MinLength(8) @MaxLength(128)
  password!: string;

  @IsIn(['admin', 'spv', 'teknisi'])
  role!: 'admin' | 'spv' | 'teknisi';
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsIn(['admin', 'spv', 'teknisi'])
  role?: 'admin' | 'spv' | 'teknisi';
}

class ResetPasswordDto {
  /** Sama seperti aturan CreateUserDto.password — biar konsisten. */
  @IsString() @MinLength(8) @MaxLength(128)
  password!: string;
}

/** Kelola user hanya untuk Admin (PRD Bagian 3). */
@Controller('users')
@Roles('admin')
class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.user.findMany({ select: PUBLIC_FIELDS, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw new ConflictException('Email sudah terdaftar.');

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        role: dto.role,
        passwordHash: await argon2.hash(dto.password),
      },
      select: PUBLIC_FIELDS,
    });
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Tidak ada perubahan yang dikirim.');
    }

    const updated = await this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_FIELDS });

    // Nonaktifkan mencegah login BARU, tapi access token yang sudah terlanjur
    // terbit sebelumnya tetap sah sampai kedaluwarsa sendiri — sekalian putus
    // semua sesi (refresh token) supaya efeknya langsung terasa. Penambahan
    // ini opsional/bisa ditinjau ulang; tidak mengubah kontrak endpoint.
    if (dto.isActive === false) {
      await this.prisma.deviceSession.deleteMany({ where: { userId: id } });
    }

    return updated;
  }

  /**
   * Reset password oleh admin — password baru selalu dibuat/diacak di
   * frontend dan dikirim di sini apa adanya (server tidak menebak-nebak).
   * Seluruh sesi user itu ikut diputus supaya device lama wajib login ulang
   * dengan password baru (PRD keamanan akun).
   */
  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await argon2.hash(dto.password) },
      select: { id: true },
    });
    await this.prisma.deviceSession.deleteMany({ where: { userId: id } });
    return { id };
  }

  /**
   * Hapus akun secara permanen. Berbeda dari nonaktifkan (soft-disable) di
   * atas — ini betul-betul menghapus baris User, jadi ditolak kalau masih
   * ada referensi apa pun (folder yang dia review/buat, template/layout yang
   * dia buat, task yang di-assign ke dia, atau riwayat review) supaya jejak
   * audit BAST tidak pernah bolong. Nonaktifkan akun ini kalau memang ingin
   * menghentikan aksesnya tapi masih ada riwayat yang terikat.
   */
  @Delete(':id')
  async remove(@CurrentUser() currentUser: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (id === currentUser.id) {
      throw new ForbiddenException('Tidak bisa menghapus akun Anda sendiri.');
    }

    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { role: true },
    });

    if (target.role === 'admin') {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: 'admin', isActive: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException('Tidak bisa menghapus admin terakhir di sistem.');
      }
    }

    const [
      reviewingFolders,
      createdFolders,
      createdTemplates,
      assignedTasks,
      reviewLogs,
      createdLayouts,
    ] = await Promise.all([
      this.prisma.folder.count({ where: { defaultReviewerId: id } }),
      this.prisma.folder.count({ where: { createdBy: id } }),
      this.prisma.taskTemplate.count({ where: { createdBy: id } }),
      this.prisma.taskInstance.count({ where: { assignedTeknisiId: id } }),
      this.prisma.reviewLog.count({ where: { reviewerId: id } }),
      this.prisma.outputLayout.count({ where: { createdBy: id } }),
    ]);

    const blockers: string[] = [];
    if (reviewingFolders > 0) blockers.push(`reviewer default di ${reviewingFolders} folder`);
    if (createdFolders > 0) blockers.push(`pembuat ${createdFolders} folder`);
    if (createdTemplates > 0) blockers.push(`pembuat ${createdTemplates} template`);
    if (assignedTasks > 0) blockers.push(`teknisi yang di-assign di ${assignedTasks} task`);
    if (reviewLogs > 0) blockers.push(`reviewer pada ${reviewLogs} riwayat review`);
    if (createdLayouts > 0) blockers.push(`pembuat ${createdLayouts} layout`);

    if (blockers.length > 0) {
      throw new BadRequestException(
        `User ini masih tercatat sebagai ${blockers.join('; ')} — akun tidak bisa dihapus selagi masih ada referensi ini. Nonaktifkan akun ini jika ingin menghentikan aksesnya.`,
      );
    }

    await this.prisma.user.delete({ where: { id } });
    return { id };
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
