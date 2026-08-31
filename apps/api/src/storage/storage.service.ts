import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export interface StoredFile {
  /** Path relatif terhadap STORAGE_ROOT — disimpan di DB agar storage bisa dipindah. */
  storagePath: string;
  absolutePath: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
}

const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['application/pdf', '.pdf'],
]);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Magic bytes — MIME yang dikirim klien tidak dipercaya begitu saja. */
const MAGIC: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  {
    mime: 'image/jpeg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    test: (b) => b.length > 8 && b.subarray(0, 8).equals(PNG_SIGNATURE),
  },
  {
    mime: 'application/pdf',
    test: (b) => b.length > 4 && b.subarray(0, 4).toString('latin1') === '%PDF',
  },
];

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('STORAGE_ROOT'));
  }

  /**
   * Membuang karakter yang tidak aman untuk nama berkas/folder — termasuk yang
   * ditolak Google Drive. Dipakai juga oleh DriveMirrorService agar struktur
   * folder lokal dan Drive konsisten.
   */
  static sanitizeSegment(input: string): string {
    const cleaned = input
      .replace(/[^\p{L}\p{N} _.()-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+/, '')
      .replace(/[.\s]+$/, '')
      .slice(0, 120);
    return cleaned.length > 0 ? cleaned : 'untitled';
  }

  private detectMime(buffer: Buffer): string | null {
    return MAGIC.find((m) => m.test(buffer))?.mime ?? null;
  }

  /**
   * Menyimpan berkas ke disk. Nama berkas selalu dibuat ulang (UUID) dan tidak
   * pernah memakai nama dari klien, sehingga path traversal lewat originalName
   * tidak mungkin terjadi.
   */
  async save(params: {
    buffer: Buffer;
    declaredMime: string;
    segments: string[];
  }): Promise<StoredFile> {
    const actualMime = this.detectMime(params.buffer);
    if (!actualMime || !ALLOWED_MIME.has(actualMime)) {
      throw new BadRequestException('Tipe berkas tidak didukung. Hanya JPG, PNG, atau PDF.');
    }
    if (actualMime !== params.declaredMime) {
      this.logger.warn(
        `MIME dari klien (${params.declaredMime}) berbeda dari isi berkas (${actualMime}).`,
      );
    }

    const safeSegments = params.segments.map((s) => StorageService.sanitizeSegment(s));
    const filename = `${randomUUID()}${ALLOWED_MIME.get(actualMime)}`;
    const storagePath = [...safeSegments, filename].join('/');
    const absolutePath = join(this.root, ...safeSegments, filename);

    // Sabuk pengaman kedua: hasil resolve wajib tetap di dalam root.
    if (!absolutePath.startsWith(this.root + sep)) {
      throw new BadRequestException('Path berkas tidak valid.');
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, params.buffer, { mode: 0o640 });

    return {
      storagePath,
      absolutePath,
      sizeBytes: params.buffer.length,
      sha256: createHash('sha256').update(params.buffer).digest('hex'),
      mimeType: actualMime,
    };
  }

  absolutePathFor(storagePath: string): string {
    const abs = resolve(this.root, storagePath);
    if (!abs.startsWith(this.root + sep)) {
      throw new BadRequestException('Path berkas tidak valid.');
    }
    return abs;
  }

  async remove(storagePath: string): Promise<void> {
    await unlink(this.absolutePathFor(storagePath)).catch(() => undefined);
  }
}
