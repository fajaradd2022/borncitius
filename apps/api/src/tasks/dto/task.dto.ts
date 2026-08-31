import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaveFieldValueDto {
  /** Nilai field disimpan sebagai string; parsing tipe dilakukan saat render dokumen. */
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  value?: string;
}

export class ReviewFieldDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  /** Wajib saat reject (PRD 4.4) — divalidasi di service. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class EditFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  value!: string;
}

export class ReopenTaskDto {
  /** Wajib diisi — jejak audit kenapa task yang sudah disetujui dibuka lagi. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

export class CreateTaskDto {
  @IsUUID()
  folderId!: string;

  @IsUUID()
  templateId!: string;

  @IsUUID()
  assignedTeknisiId!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional() @IsString() @MaxLength(64)
  siteId?: string;

  @IsOptional() @IsUUID()
  reviewerOverrideId?: string;
}

export class BulkRowDto {
  @IsInt()
  rowNumber!: number;

  @IsString() @MaxLength(255)
  teknisiEmail!: string;

  @IsString() @MaxLength(64)
  dueDate!: string;

  @IsOptional() @IsString() @MaxLength(64)
  siteId?: string;

  @IsOptional() @IsObject()
  prefill?: Record<string, string>;
}

export class BulkCreateDto {
  @IsUUID()
  folderId!: string;

  @IsUUID()
  templateId!: string;

  @IsArray()
  @ArrayMaxSize(500, { message: 'Maksimal 500 baris per unggahan.' })
  @ValidateNested({ each: true })
  @Type(() => BulkRowDto)
  rows!: BulkRowDto[];
}

export class BulkDeleteDto {
  @IsArray()
  @ArrayMaxSize(500, { message: 'Maksimal 500 task per penghapusan massal.' })
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
