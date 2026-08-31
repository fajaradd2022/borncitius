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
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { FieldType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'textarea',
  'photo', 'file', 'signed_document', 'gps', 'section', 'repeat_table',
];

const TEMPLATE_LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  version: true,
  isActive: true,
  createdAt: true,
  _count: { select: { fields: true } },
} as const;

class TemplateFieldDto {
  /** Kosong/UUID palsu dari builder = field baru; UUID asli = update di tempat. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsIn(FIELD_TYPES)
  fieldType!: FieldType;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsBoolean()
  isRequired!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  section?: string;

  @IsInt()
  @Min(0)
  orderIndex!: number;
}

class SaveTemplateDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsArray()
  @ArrayMaxSize(300, { message: 'Maksimal 300 field per template.' })
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  fields!: TemplateFieldDto[];
}

@Controller('templates')
@Roles('admin', 'spv')
class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.taskTemplate.findMany({
      select: TEMPLATE_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.taskTemplate.findUniqueOrThrow({
      where: { id },
      include: { fields: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  @Post()
  @Roles('admin')
  async create(@CurrentUser() user: AuthUser, @Body() dto: SaveTemplateDto) {
    return this.prisma.taskTemplate.create({
      data: {
        name: dto.name,
        isActive: dto.isActive,
        createdBy: user.id,
        fields: {
          create: dto.fields.map((f, i) => ({
            label: f.label,
            fieldType: f.fieldType,
            options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
            isRequired: f.isRequired,
            section: f.section ?? '',
            orderIndex: f.orderIndex ?? i,
          })),
        },
      },
      include: { fields: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  /**
   * Simpan template — upsert per-id (BUKAN hapus-semua-lalu-buat-ulang seperti
   * Layout Builder). TemplateField.id dirujuk oleh LayoutBlock.sourceFieldId
   * (onDelete: SetNull) — kalau field dihapus-buat-ulang setiap simpan,
   * Output Layout yang sudah dibuat dari template ini diam-diam kehilangan
   * sambungan ke field-nya. Field lama yang masih dipakai satu layout atau
   * lebih ditolak dihapus (harus dilepas dari layout itu dulu).
   */
  @Put(':id')
  @Roles('admin')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveTemplateDto) {
    const existing = await this.prisma.templateField.findMany({
      where: { templateId: id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((f) => f.id));
    const incomingIds = new Set(dto.fields.filter((f) => f.id && existingIds.has(f.id)).map((f) => f.id!));
    const toDeleteIds = [...existingIds].filter((eid) => !incomingIds.has(eid));

    if (toDeleteIds.length > 0) {
      const stillUsed = await this.prisma.layoutBlock.findMany({
        where: { sourceFieldId: { in: toDeleteIds } },
        select: { layout: { select: { name: true } } },
      });
      if (stillUsed.length > 0) {
        const names = [...new Set(stillUsed.map((b) => b.layout.name))].join(', ');
        throw new BadRequestException(
          `Ada field yang masih dipakai di layout "${names}" — lepas dari layout itu dulu sebelum menghapusnya di sini.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (toDeleteIds.length > 0) {
        await tx.templateField.deleteMany({ where: { id: { in: toDeleteIds } } });
      }

      for (const [i, f] of dto.fields.entries()) {
        const data = {
          label: f.label,
          fieldType: f.fieldType,
          options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
          isRequired: f.isRequired,
          section: f.section ?? '',
          orderIndex: f.orderIndex ?? i,
        };
        if (f.id && existingIds.has(f.id)) {
          await tx.templateField.update({ where: { id: f.id }, data });
        } else {
          await tx.templateField.create({ data: { ...data, templateId: id } });
        }
      }

      await tx.taskTemplate.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive } });

      return tx.taskTemplate.findUniqueOrThrow({
        where: { id },
        include: { fields: { orderBy: { orderIndex: 'asc' } } },
      });
    });
  }

  /**
   * Hapus template. TaskInstance.templateId adalah onDelete: Restrict (task yang
   * pernah dibuat dari template ini akan menahan delete di level DB), dan
   * OutputLayout.sourceTemplateId adalah onDelete: Cascade (layout yang belum
   * dicek dulu akan ikut terhapus diam-diam) — keduanya dicek lebih dulu di sini
   * supaya admin dapat pesan yang jelas, bukan error Postgres mentah.
   */
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const [taskCount, layouts] = await Promise.all([
      this.prisma.taskInstance.count({ where: { templateId: id } }),
      this.prisma.outputLayout.findMany({ where: { sourceTemplateId: id }, select: { name: true } }),
    ]);

    if (taskCount > 0) {
      throw new BadRequestException(
        `Template ini masih dipakai oleh ${taskCount} task — hapus atau pindahkan task itu dulu sebelum menghapus template.`,
      );
    }
    if (layouts.length > 0) {
      const names = layouts.map((l) => l.name).join(', ');
      throw new BadRequestException(
        `Template ini masih punya layout output "${names}" — hapus layout itu dulu sebelum menghapus template.`,
      );
    }

    await this.prisma.taskTemplate.delete({ where: { id } });
    return { id };
  }
}

@Module({ controllers: [TemplatesController] })
export class TemplatesModule {}
