import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Format email tidak valid.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(128)
  password!: string;

  /** Identitas perangkat — memungkinkan satu akun aktif di banyak device (PRD 5.2). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}
