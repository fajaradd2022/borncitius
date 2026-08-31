import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * `findUniqueOrThrow`/`findFirstOrThrow` melempar PrismaClientKnownRequestError
 * (kode P2025) kalau baris tidak ditemukan — tanpa filter ini, itu bocor jadi
 * 500 mentah berisi stack trace, bukan 404 rapi berbahasa Indonesia seperti
 * konvensi lain di API ini (mis. NotFoundException manual di tasks.service.ts).
 *
 * Hanya P2025 yang ditangani di sini; kode Prisma lain (mis. pelanggaran
 * constraint unik) sengaja dibiarkan lewat sebagai 500 — itu bug yang perlu
 * kelihatan, bukan disamarkan jadi "tidak ditemukan".
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    if (exception.code !== 'P2025') throw exception;

    const notFound = new NotFoundException('Data tidak ditemukan.');
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();
    response.status(notFound.getStatus()).json(notFound.getResponse());
  }
}
