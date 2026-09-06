import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StorageService } from '../storage/storage.service';

const execFileAsync = promisify(execFile);

export interface MirrorTarget {
  /** Nama folder klien, mis. "UAT PT MTM". */
  clientFolder: string;
  /** Kode site bila ada, mis. "R881-CAMMING-BONE". */
  siteId?: string | null;
  taskId: string;
  /** Judul field foto, jadi nama subfolder — mis. "Posisi Perangkat Fortigate FG40F". */
  fieldLabel: string;
  /** Subfolder tambahan di dalam fieldLabel, mis. Sector/Cell "1/01" untuk Test Call. */
  subFolder?: string | null;
  fileName: string;
}

export interface MirrorResult {
  remotePath: string;
  driveUrl: string | null;
}

/**
 * Menyalin berkas ke Google Drive sebagai arsip (PRD 8.1).
 *
 * Storage lokal tetap primary — Drive hanya mirror, sehingga kegagalan sync
 * tidak pernah memblokir alur kerja teknisi maupun admin.
 *
 * Implementasi memakai rclone karena remote "gdrive:" sudah terkonfigurasi di
 * server. root folder id diberikan lewat flag, jadi rclone.conf milik user
 * tidak perlu diubah. Antarmuka ini sengaja dibuat kecil agar bisa diganti
 * implementasi googleapis tanpa menyentuh pemanggilnya.
 */
@Injectable()
export class DriveMirrorService {
  private readonly logger = new Logger(DriveMirrorService.name);
  private readonly enabled: boolean;
  private readonly bin: string;
  private readonly remote: string;
  private readonly rootFolderId: string;
  private readonly basePath: string;

  constructor(config: ConfigService) {
    this.enabled = config.get('GDRIVE_ENABLED') === 'true';
    this.bin = config.get<string>('RCLONE_BIN') ?? 'rclone';
    this.remote = config.get<string>('GDRIVE_REMOTE') ?? 'gdrive';
    this.rootFolderId = config.get<string>('GDRIVE_ROOT_FOLDER_ID') ?? '';
    this.basePath = config.get<string>('GDRIVE_BASE_PATH') ?? 'BORN CITIUS';
  }

  isEnabled(): boolean {
    return this.enabled && this.rootFolderId.length > 0;
  }

  /** Struktur: BORN CITIUS/{Klien}/{Site}_{taskId}/{Judul Field}/[{Sub}/]{file} */
  buildRemotePath(target: MirrorTarget): string {
    const s = StorageService.sanitizeSegment;
    const taskFolder = target.siteId
      ? `${s(target.siteId)}_${s(target.taskId)}`
      : s(target.taskId);

    const segments = [this.basePath, s(target.clientFolder), taskFolder, s(target.fieldLabel)];
    // Subfolder per Sector/Cell (mis. "1/01" → "1-01") bila ada.
    if (target.subFolder && target.subFolder.trim()) {
      segments.push(s(target.subFolder));
    }
    segments.push(target.fileName);

    return segments.map((p) => p.trim()).join('/');
  }

  private baseFlags(): string[] {
    return [
      '--drive-root-folder-id',
      this.rootFolderId,
      '--config',
      process.env.RCLONE_CONFIG ?? `${process.env.HOME ?? ''}/.config/rclone/rclone.conf`,
    ];
  }

  /**
   * Argumen selalu dikirim sebagai array ke execFile (bukan string ke shell),
   * sehingga nama berkas berisi karakter aneh tidak bisa menjadi injeksi shell.
   */
  async upload(localAbsolutePath: string, target: MirrorTarget): Promise<MirrorResult> {
    if (!this.isEnabled()) {
      throw new Error('Google Drive mirror tidak aktif (GDRIVE_ENABLED/ROOT_FOLDER_ID belum diset).');
    }

    const remotePath = this.buildRemotePath(target);
    const remoteArg = `${this.remote}:${remotePath}`;

    await execFileAsync(
      this.bin,
      ['copyto', localAbsolutePath, remoteArg, ...this.baseFlags(), '--retries', '3'],
      { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
    );

    // Link publik bersifat pelengkap: kegagalan di sini tidak membatalkan upload
    // yang sudah berhasil.
    let driveUrl: string | null = null;
    try {
      const { stdout } = await execFileAsync(this.bin, ['link', remoteArg, ...this.baseFlags()], {
        timeout: 60_000,
      });
      driveUrl = stdout.trim() || null;
    } catch (err) {
      this.logger.warn(`Gagal mengambil link Drive untuk ${remotePath}: ${String(err)}`);
    }

    return { remotePath, driveUrl };
  }

  /**
   * Menghapus satu berkas di Drive. Best-effort: kegagalan (mis. berkas sudah
   * tidak ada, atau mirror memang tidak aktif) tidak pernah dilempar ke
   * pemanggil — penghapusan lokal/DB adalah sumber kebenaran, Drive cuma cermin.
   */
  async remove(remotePath: string): Promise<void> {
    if (!this.isEnabled()) return;
    const remoteArg = `${this.remote}:${remotePath}`;
    try {
      await execFileAsync(this.bin, ['deletefile', remoteArg, ...this.baseFlags()], {
        timeout: 60_000,
      });
    } catch (err) {
      this.logger.warn(`Gagal menghapus berkas Drive ${remotePath}: ${String(err)}`);
    }
  }
}
