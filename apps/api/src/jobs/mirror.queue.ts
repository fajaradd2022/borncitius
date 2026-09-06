import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DriveMirrorService } from '../drive/drive-mirror.service';

export const MIRROR_QUEUE = 'drive-mirror';

export interface MirrorJobData {
  attachmentId: string;
}

/**
 * Antrian mirror ke Google Drive.
 *
 * Dijalankan asinkron supaya upload foto dari teknisi tidak menunggu jaringan
 * Drive. Kegagalan otomatis di-retry dengan backoff; setelah percobaan habis,
 * status attachment ditandai `failed` beserta pesannya — tidak pernah
 * dianggap sukses diam-diam.
 */
@Injectable()
export class MirrorQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MirrorQueue.name);
  private queue?: Queue<MirrorJobData>;
  private worker?: Worker<MirrorJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly drive: DriveMirrorService,
  ) {}

  private connection(): ConnectionOptions {
    return {
      host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(this.config.get('REDIS_PORT') ?? 6379),
    };
  }

  onModuleInit(): void {
    if (!this.drive.isEnabled()) {
      this.logger.warn('Google Drive mirror nonaktif — job tidak akan dijalankan.');
      return;
    }

    const connection = this.connection();
    this.queue = new Queue<MirrorJobData>(MIRROR_QUEUE, { connection });

    this.worker = new Worker<MirrorJobData>(
      MIRROR_QUEUE,
      async (job) => this.process(job.data),
      { connection, concurrency: 3 },
    );

    this.worker.on('failed', (job, err) => {
      const attempts = job?.opts.attempts ?? 1;
      if (job && job.attemptsMade >= attempts) {
        void this.markFailed(job.data.attachmentId, err.message);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(attachmentId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      'mirror',
      { attachmentId },
      {
        attempts: 4,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  private async markFailed(attachmentId: string, message: string): Promise<void> {
    await this.prisma.attachment
      .update({
        where: { id: attachmentId },
        data: { syncStatus: 'failed', syncError: message.slice(0, 500) },
      })
      .catch(() => undefined);
  }

  /**
   * Untuk foto Test Call: cari Sector/Cell dari baris tabel berdasarkan
   * watermarkMetadata._tcRowId, lalu bentuk nama subfolder "SCEN{n}_SEC{cell}".
   * Mengembalikan null bila bukan foto tabel (tidak ada _tcRowId).
   */
  private async resolveSectorSubfolder(
    taskId: string,
    watermarkMetadata: unknown,
  ): Promise<string | null> {
    const meta = (watermarkMetadata ?? {}) as Record<string, unknown>;
    const rowId = typeof meta._tcRowId === 'string' ? meta._tcRowId : '';
    if (!rowId) return null; // bukan foto tabel Test Call

    const repeatField = await this.prisma.taskInstanceField.findFirst({
      where: { taskInstanceId: taskId, fieldType: 'repeat_table' },
      select: { value: true },
    });
    if (!repeatField) return null;

    // value bisa array, string JSON, atau double-encoded — decode bertingkat.
    let rows: Array<Record<string, unknown>> = [];
    let v: unknown = repeatField.value;
    for (let i = 0; i < 3; i++) {
      if (Array.isArray(v)) { rows = v as Array<Record<string, unknown>>; break; }
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { break; } } else break;
    }
    const row = rows.find((r) => String(r._id ?? '') === rowId);
    if (!row) return `Baris_${rowId}`; // fallback aman

    const scen = /(\d+)/.exec(String(row.scenario ?? ''))?.[1] ?? String(row.scenario ?? '');
    const cell = String(row.sectorCell ?? '').trim();
    if (scen && cell) return `SCEN${scen}_SEC${cell}`;
    if (cell) return cell;
    return `Baris_${rowId}`;
  }

  private async process(data: MirrorJobData): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: data.attachmentId },
      include: {
        taskInstanceField: {
          include: { taskInstance: { include: { folder: true } } },
        },
      },
    });

    if (!attachment) {
      this.logger.warn(`Attachment ${data.attachmentId} tidak ditemukan — job dilewati.`);
      return;
    }

    const field = attachment.taskInstanceField;
    const task = field.taskInstance;

    // Test Call: foto tertaut ke baris tabel via watermarkMetadata._tcRowId.
    // Buat subfolder per Sector/Cell agar rapi di Drive.
    const subFolder = await this.resolveSectorSubfolder(task.id, attachment.watermarkMetadata);

    const result = await this.drive.upload(this.storage.absolutePathFor(attachment.storagePath), {
      clientFolder: task.folder.name,
      siteId: task.siteId,
      taskId: task.id,
      fieldLabel: field.label,
      subFolder,
      fileName: attachment.storagePath.split('/').pop() ?? attachment.originalName,
    });

    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        syncStatus: 'synced',
        driveUrl: result.driveUrl,
        syncError: null,
        syncedAt: new Date(),
      },
    });

    this.logger.log(`Mirror selesai: ${result.remotePath}`);
  }
}
