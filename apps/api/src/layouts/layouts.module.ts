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
  Put,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { LayoutBlockType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Frontend memakai penamaan bertanda hubung ("photo-page"), sedangkan enum
 * Prisma memakai garis bawah. Konversi dilakukan di batas API agar kedua sisi
 * tetap idiomatis di lingkungannya masing-masing.
 */
const BLOCK_TYPE_MAP: Record<string, LayoutBlockType> = {
  text: 'text',
  image: 'image',
  field: 'field',
  'field-grid': 'field_grid',
  field_grid: 'field_grid',
  table: 'table',
  'photo-page': 'photo_page',
  photo_page: 'photo_page',
  attachment: 'attachment',
  'page-break': 'page_break',
  page_break: 'page_break',
  header: 'header',
  footer: 'footer',
};

class LayoutBlockDto {
  @IsString()
  type!: string;

  @IsOptional() @IsString() @MaxLength(200)
  label?: string;

  @IsOptional() @IsUUID()
  sourceFieldId?: string;

  @IsOptional() @IsString() @MaxLength(30)
  displayStyle?: string;

  @IsInt()
  orderIndex!: number;

  @IsOptional() @IsObject()
  textStyle?: Record<string, unknown>;

  @IsOptional() @IsObject()
  border?: Record<string, unknown>;

  @IsOptional() @IsObject()
  config?: Record<string, unknown>;
}

class SaveLayoutDto {
  @IsString() @MaxLength(200)
  name!: string;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutBlockDto)
  blocks!: LayoutBlockDto[];
}

class CreateLayoutDto extends SaveLayoutDto {
  @IsUUID()
  sourceTemplateId!: string;
}

const LAYOUT_INCLUDE = {
  blocks: { orderBy: { orderIndex: 'asc' } },
  sourceTemplate: { select: { id: true, name: true } },
} as const;

/** Membuat & mengedit layout hanya untuk Admin (PRD Bagian 3). */
@Controller('layouts')
class LayoutsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('admin')
  findAll() {
    return this.prisma.outputLayout.findMany({
      select: {
        id: true,
        name: true,
        isDefault: true,
        createdAt: true,
        sourceTemplate: { select: { id: true, name: true } },
        _count: { select: { blocks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.outputLayout.findUniqueOrThrow({
      where: { id },
      include: LAYOUT_INCLUDE,
    });
  }

  @Post()
  @Roles('admin')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateLayoutDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, dto.sourceTemplateId);
      return tx.outputLayout.create({
        data: {
          name: dto.name,
          sourceTemplateId: dto.sourceTemplateId,
          isDefault: dto.isDefault ?? false,
          createdBy: user.id,
          blocks: { create: dto.blocks.map((b) => this.toBlockData(b)) },
        },
        include: LAYOUT_INCLUDE,
      });
    });
  }

  /**
   * Blok diganti seluruhnya, bukan di-patch satu per satu — builder mengirim
   * susunan lengkap, jadi replace lebih sederhana dan bebas dari blok yatim.
   */
  @Put(':id')
  @Roles('admin')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveLayoutDto) {
    const existing = await this.prisma.outputLayout.findUniqueOrThrow({
      where: { id },
      select: { sourceTemplateId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, existing.sourceTemplateId, id);
      await tx.layoutBlock.deleteMany({ where: { layoutId: id } });
      return tx.outputLayout.update({
        where: { id },
        data: {
          name: dto.name,
          isDefault: dto.isDefault ?? false,
          blocks: { create: dto.blocks.map((b) => this.toBlockData(b)) },
        },
        include: LAYOUT_INCLUDE,
      });
    });
  }

  /**
   * Hapus layout. Ditolak kalau ini layout default (template jadi tanpa
   * default sama sekali) atau masih dipakai sebagai override khusus di
   * FolderLayoutOverride (onDelete: Cascade — override itu akan diam-diam
   * lenyap kalau tidak dicek dulu). GeneratedDocument.layoutId aman
   * (onDelete: SetNull), tidak perlu dicek.
   */
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const layout = await this.prisma.outputLayout.findUniqueOrThrow({
      where: { id },
      select: { isDefault: true, sourceTemplate: { select: { name: true } } },
    });

    if (layout.isDefault) {
      throw new BadRequestException(
        `Layout ini adalah layout default untuk template "${layout.sourceTemplate.name}" — jadikan layout lain default dulu sebelum menghapusnya.`,
      );
    }

    const overrideCount = await this.prisma.folderLayoutOverride.count({ where: { layoutId: id } });
    if (overrideCount > 0) {
      throw new BadRequestException(
        `Layout ini masih dipakai sebagai override khusus di ${overrideCount} folder — lepas override itu dulu sebelum menghapus layout.`,
      );
    }

    await this.prisma.outputLayout.delete({ where: { id } });
    return { id };
  }

  /** Hanya boleh ada satu layout default per template. */
  private async clearDefault(
    tx: Prisma.TransactionClient,
    templateId: string,
    exceptId?: string,
  ): Promise<void> {
    await tx.outputLayout.updateMany({
      where: { sourceTemplateId: templateId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  private toBlockData(b: LayoutBlockDto) {
    const type = BLOCK_TYPE_MAP[b.type];
    if (!type) throw new BadRequestException(`Tipe blok tidak dikenal: ${b.type}`);

    return {
      type,
      label: b.label ?? '',
      sourceFieldId: b.sourceFieldId ?? null,
      displayStyle: b.displayStyle ?? null,
      orderIndex: b.orderIndex,
      textStyle: (b.textStyle ?? undefined) as Prisma.InputJsonValue | undefined,
      border: (b.border ?? undefined) as Prisma.InputJsonValue | undefined,
      config: (b.config ?? undefined) as Prisma.InputJsonValue | undefined,
    };
  }
}

@Module({ controllers: [LayoutsController] })
export class LayoutsModule {}
