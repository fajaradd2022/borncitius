import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { DriveModule } from './drive/drive.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { FoldersModule } from './folders/folders.module';
import { TemplatesModule } from './templates/templates.module';
import { UsersModule } from './users/users.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LayoutsModule } from './layouts/layouts.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    PrismaModule,
    StorageModule,
    DriveModule,
    JobsModule,
    AuthModule,
    TasksModule,
    FoldersModule,
    TemplatesModule,
    UsersModule,
    DashboardModule,
    LayoutsModule,
    DocumentsModule,
    HealthModule,
  ],
  providers: [
    // Terpasang global: endpoint tertutup secara default, dibuka lewat @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
