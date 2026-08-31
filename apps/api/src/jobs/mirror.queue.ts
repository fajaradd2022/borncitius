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

    const result = await this.drive.upload(this.storage.absolutePathFor(attachment.storagePath), {
      clientFolder: task.folder.name,
      siteId: task.siteId,
      taskId: task.id,
      fieldLabel: field.label,
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
