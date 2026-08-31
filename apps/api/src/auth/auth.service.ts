import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Refresh token disimpan sebagai hash SHA-256 — nilai mentahnya tidak pernah ada di DB. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlDays(): number {
    return Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    // Verifikasi tetap dijalankan terhadap hash dummy saat user tidak ada,
    // supaya waktu respons tidak membocorkan email mana yang terdaftar.
    const hash = user?.passwordHash ?? (await argon2.hash(randomBytes(32).toString('hex')));
    const passwordValid = await argon2.verify(hash, dto.password).catch(() => false);

    if (!user || !passwordValid || !user.isActive) {
      throw new UnauthorizedException('Email atau password salah, atau akun nonaktif.');
    }

    return this.issueTokens(user.id, user.email, user.role, user.name, dto.deviceId, userAgent);
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    name: string,
    deviceId?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        // Tipe expiresIn di @nestjs/jwt memakai StringValue dari `ms`;
        // nilai dari env bertipe string biasa, jadi perlu penyempitan eksplisit.
        expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as `${number}${'m' | 'h' | 'd'}`,
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlDays() * 86_400_000);

    await this.prisma.deviceSession.create({
      data: {
        userId,
        deviceId: deviceId ?? 'unknown',
        refreshTokenHash: this.hashToken(refreshToken),
        userAgent: userAgent?.slice(0, 255),
        expiresAt,
      },
    });

    return { accessToken, refreshToken, user: { id: userId, name, email, role } };
  }

  /** Rotasi refresh token: sesi lama dihapus, sesi baru dibuat. */
  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    const session = await this.prisma.deviceSession.findFirst({
      where: { refreshTokenHash: this.hashToken(refreshToken), expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!session || !session.user.isActive) {
      throw new UnauthorizedException('Sesi tidak valid atau sudah berakhir.');
    }

    await this.prisma.deviceSession.delete({ where: { id: session.id } });

    return this.issueTokens(
      session.user.id,
      session.user.email,
      session.user.role,
      session.user.name,
      session.deviceId,
      userAgent,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.deviceSession.deleteMany({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
    });
  }
}
