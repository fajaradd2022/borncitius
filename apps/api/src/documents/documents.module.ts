import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PdfService, type RenderBlock } from './pdf.service';
import { DocxService } from './docx.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('tasks/:taskId/document')
@Roles('admin', 'spv')
class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
    private readonly docx: DocxService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Membuat dokumen akhir untuk task yang sudah disetujui.
   *
   * Layout yang dipakai mengikuti override folder bila ada, jika tidak memakai
   * layout default template (PRD 4.2/4.3).
   */
  /**
   * Menyusun blok siap-render dari layout yang berlaku + isian task.
   * Dipakai bersama oleh export PDF dan Word agar aturannya tidak bercabang.
   */
  private async buildBlocks(user: AuthUser, taskId: string) {
    const task = await this.prisma.taskInstance.findUnique({
      where: { id: taskId },
      include: {
        folder: { select: { id: true, name: true, defaultReviewerId: true } },
        template: { select: { id: true, name: true } },
        fields: {
          orderBy: { orderIndex: 'asc' },
          include: { attachments: { select: { storagePath: true, mimeType: true } } },
        },
      },
    });
    if (!task) throw new NotFoundException('Task tidak ditemukan.');

    if (user.role === 'spv' && task.folder.defaultReviewerId !== user.id && task.reviewerOverrideId !== user.id) {
      throw new ForbiddenException('Anda bukan reviewer untuk task ini.');
    }
    if (task.status !== 'approved') {
      throw new BadRequestException('Dokumen hanya bisa dibuat untuk task yang sudah disetujui.');
    }

    const override = await this.prisma.folderLayoutOverride.findUnique({
      where: { folderId_templateId: { folderId: task.folderId, templateId: task.templateId } },
      select: { layoutId: true },
    });

    const layout = await this.prisma.outputLayout.findFirst({
      where: override ? { id: override.layoutId } : { sourceTemplateId: task.templateId, isDefault: true },
      include: { blocks: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!layout) {
      throw new BadRequestException('Belum ada Output Layout untuk template ini. Buat layout terlebih dahulu.');
    }

    // Blok layout merujuk field template, sedangkan task menyimpan salinannya
    // sendiri (versioning) — pemetaan dilakukan lewat label.
    const byLabel = new Map(task.fields.map((f) => [f.label, f]));
    const templateFields = await this.prisma.templateField.findMany({
      where: { templateId: task.templateId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, label: true, fieldType: true, orderIndex: true },
    });
    const labelById = new Map(templateFields.map((f) => [f.id, f.label]));

    // Resolusi placeholder {{Label}} pada teks (mis. header foto memakai
    // {{Site ID}} / {{Site Name}}). Nilai diambil dari isian task (per label);
    // jika tidak ada, placeholder dikosongkan agar tidak muncul mentah.
    const resolvePlaceholders = (input: unknown): string => {
      if (typeof input !== 'string') return '';
      return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, name: string) => {
        const f = byLabel.get(name.trim());
        return typeof f?.value === 'string' ? f.value : '';
      });
    };

    // Config bisa mengandung placeholder di beberapa tempat (caption, footerNote,
    // pageHeader.leftText/rightText). Kita resolusi secara rekursif dangkal.
    const resolveConfig = (cfg: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...cfg };
      for (const key of ['caption', 'footerNote', 'content', 'noteText']) {
        if (typeof out[key] === 'string') out[key] = resolvePlaceholders(out[key]);
      }
      if (out.pageHeader && typeof out.pageHeader === 'object') {
        const ph = out.pageHeader as Record<string, unknown>;
        out.pageHeader = {
          ...ph,
          leftText: resolvePlaceholders(ph.leftText),
          rightText: resolvePlaceholders(ph.rightText),
        };
      }
      return out;
    };

    const blocks: RenderBlock[] = layout.blocks.map((b) => {
      const label = b.sourceFieldId ? labelById.get(b.sourceFieldId) : undefined;
      const field = label ? byLabel.get(label) : undefined;
      const rawCfg = (b.config ?? {}) as Record<string, unknown>;
      const cfg = resolveConfig(rawCfg);

      // field_grid: kumpulkan nilai tiap field yang dirujuk (via label template).
      let gridValues: Array<{ label: string; value: string }> | undefined;
      const fieldIds = Array.isArray(rawCfg.fieldIds) ? (rawCfg.fieldIds as string[]) : [];
      if (b.type === 'field_grid' && fieldIds.length > 0) {
        gridValues = fieldIds.map((fid) => {
          const lbl = labelById.get(fid) ?? '';
          const fv = lbl ? byLabel.get(lbl) : undefined;
          return { label: lbl, value: typeof fv?.value === 'string' ? fv.value : '' };
        });
      }

      return {
        type: b.type,
        label: b.label || label || '',
        orderIndex: b.orderIndex,
        displayStyle: b.displayStyle,
        config: cfg,
        textStyle: (b.textStyle ?? null) as RenderBlock['textStyle'],
        border: (b.border ?? null) as RenderBlock['border'],
        value: typeof field?.value === 'string' ? field.value : null,
        caption: typeof cfg.caption === 'string' ? cfg.caption : undefined,
        gridValues,
        attachments: field?.attachments.map((a) => ({
          absolutePath: this.storage.absolutePathFor(a.storagePath),
          mimeType: a.mimeType,
        })),
      };
    });

    // Fallback lampiran: field bertipe `file` (mis. "BAST") yang punya lampiran
    // tetapi TIDAK direferensikan oleh blok attachment manapun di layout, tetap
    // digabungkan ke dokumen agar tidak hilang. Lampiran disisipkan di POSISI
    // field-nya (bukan selalu di akhir): berdasarkan urutan field template,
    // disisipkan tepat sebelum blok pertama yang merujuk field ber-urutan lebih
    // besar. Contoh: BAST (field pertama) muncul di awal dokumen.
    const referencedLabels = new Set(
      layout.blocks
        .filter((b) => b.type === 'attachment' && b.sourceFieldId)
        .map((b) => labelById.get(b.sourceFieldId as string))
        .filter((l): l is string => Boolean(l)),
    );
    const templateOrderByLabel = new Map(
      templateFields.map((f) => [f.label, f.orderIndex]),
    );
    const fileFieldLabels = new Set(
      templateFields.filter((f) => f.fieldType === 'file').map((f) => f.label),
    );
    // Untuk tiap blok layout, cari urutan field template yang dirujuknya (jika ada).
    const blockFieldOrder = (b: (typeof layout.blocks)[number]): number | undefined => {
      const lbl = b.sourceFieldId ? labelById.get(b.sourceFieldId) : undefined;
      return lbl ? templateOrderByLabel.get(lbl) : undefined;
    };
    const maxOrder = blocks.reduce((m, b) => Math.max(m, b.orderIndex), 0);
    for (const tf of task.fields) {
      if (!fileFieldLabels.has(tf.label)) continue; // hanya field tipe file
      if (referencedLabels.has(tf.label)) continue; // sudah ada blok attachment
      if (!tf.attachments.length) continue; // tidak ada berkas
      const myOrder = templateOrderByLabel.get(tf.label) ?? 0;
      // Blok layout pertama yang merujuk field dengan urutan template > myOrder.
      const laterBlocks = layout.blocks
        .filter((b) => {
          const o = blockFieldOrder(b);
          return o !== undefined && o > myOrder;
        })
        .map((b) => b.orderIndex);
      const insertAt =
        laterBlocks.length > 0 ? Math.min(...laterBlocks) - 0.5 : maxOrder + 1;
      blocks.push({
        type: 'attachment',
        label: tf.label,
        orderIndex: insertAt,
        displayStyle: null,
        config: {},
        textStyle: null,
        border: null,
        value: null,
        attachments: tf.attachments.map((a) => ({
          absolutePath: this.storage.absolutePathFor(a.storagePath),
          mimeType: a.mimeType,
        })),
      });
    }

    const siteId = task.siteId ?? task.id.slice(0, 8);
    return {
      blocks,
      layoutId: layout.id,
      siteId,
      folderName: task.folder.name,
      ctx: {
        title: `${task.template.name} — ${siteId}`,
        subtitle: task.folder.name,
        referenceNumber: `BC-${task.id.slice(0, 8).toUpperCase()}`,
      },
    };
  }

  @Post()
  async generate(@CurrentUser() user: AuthUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    const { blocks, ctx, layoutId, siteId, folderName } = await this.buildBlocks(user, taskId);

    // compose() menyisipkan lampiran di posisi urutan bloknya (interleaved) dan
    // menormalkan tiap halaman lampiran ke A4 (preserve aspect, tanpa stretch).
    const merged = await this.pdf.compose(blocks, ctx);

    const relPath = join('documents', folderName, `${siteId}-${Date.now()}.pdf`);
    const absPath = join(this.config.getOrThrow<string>('STORAGE_ROOT'), relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, merged, { mode: 0o640 });

    const doc = await this.prisma.generatedDocument.upsert({
      where: { taskInstanceId: taskId },
      create: { taskInstanceId: taskId, layoutId, pdfPath: relPath, generatedAt: new Date() },
      update: { layoutId, pdfPath: relPath, generatedAt: new Date() },
      select: { id: true, pdfPath: true, generatedAt: true },
    });

    return { ...doc, sizeBytes: merged.length, pages: blocks.length };
  }

  /** Word berisi data mentah saja — lampiran tetap hanya di PDF. */
  @Get('word')
  async downloadWord(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Res() res: Response,
  ) {
    const { blocks, ctx, siteId } = await this.buildBlocks(user, taskId);
    const buffer = await this.docx.render(blocks, ctx);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="BAST-${siteId}.docx"`);
    res.send(buffer);
  }

  @Get('pdf')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Res() res: Response,
  ) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { taskInstanceId: taskId },
      include: { taskInstance: { select: { siteId: true, folder: { select: { defaultReviewerId: true } }, reviewerOverrideId: true } } },
    });
    if (!doc?.pdfPath) throw new NotFoundException('Dokumen belum dibuat.');

    const t = doc.taskInstance;
    if (user.role === 'spv' && t.folder.defaultReviewerId !== user.id && t.reviewerOverrideId !== user.id) {
      throw new ForbiddenException('Anda bukan reviewer untuk task ini.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="BAST-${t.siteId ?? taskId.slice(0, 8)}.pdf"`,
    );
    // dotfiles: 'allow' — see tasks.controller.ts's attachmentFile for why
    // this is needed (STORAGE_ROOT may contain a dot-prefixed segment).
    res.sendFile(this.storage.absolutePathFor(doc.pdfPath), { dotfiles: 'allow' });
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [PdfService, DocxService],
})
export class DocumentsModule {}
