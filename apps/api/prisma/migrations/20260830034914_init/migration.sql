-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'spv', 'teknisi');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('assigned', 'in_progress', 'submitted', 'rejected', 'approved');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'textarea', 'photo', 'file', 'signed_document', 'gps', 'section', 'repeat_table');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('photo_taken', 'photo_uploaded', 'file_uploaded', 'signed_document');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('approve_field', 'reject_field', 'approve_all', 'edit_field');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('task_assigned', 'task_rejected');

-- CreateEnum
CREATE TYPE "LayoutBlockType" AS ENUM ('text', 'image', 'field', 'field_grid', 'table', 'photo_page', 'attachment', 'page_break', 'header', 'footer');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "default_reviewer_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_fields" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT NOT NULL DEFAULT '',
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_instances" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_version_snapshot" INTEGER NOT NULL,
    "assigned_teknisi_id" TEXT NOT NULL,
    "reviewer_override_id" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'assigned',
    "site_id" TEXT,
    "locked_by_device_id" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_instance_fields" (
    "id" TEXT NOT NULL,
    "task_instance_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT NOT NULL DEFAULT '',
    "order_index" INTEGER NOT NULL,
    "value" JSONB,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "reject_comment" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "last_edited_by" TEXT,
    "last_edited_at" TIMESTAMP(3),

    CONSTRAINT "task_instance_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "task_instance_field_id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "watermark_metadata" JSONB,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "drive_url" TEXT,
    "sync_error" TEXT,
    "captured_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL,
    "task_instance_id" TEXT NOT NULL,
    "layout_id" TEXT,
    "pdf_path" TEXT,
    "word_path" TEXT,
    "drive_url" TEXT,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "merged_attachment_ids" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" TEXT NOT NULL,
    "task_instance_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "task_instance_field_id" TEXT,
    "action" "ReviewAction" NOT NULL,
    "comment" TEXT,
    "previous_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "push_subscription" JSONB,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "output_layouts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_template_id" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "output_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_blocks" (
    "id" TEXT NOT NULL,
    "layout_id" TEXT NOT NULL,
    "type" "LayoutBlockType" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "source_field_id" TEXT,
    "display_style" TEXT,
    "order_index" INTEGER NOT NULL,
    "text_style" JSONB,
    "border" JSONB,
    "config" JSONB,

    CONSTRAINT "layout_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder_layout_overrides" (
    "folder_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "layout_id" TEXT NOT NULL,

    CONSTRAINT "folder_layout_overrides_pkey" PRIMARY KEY ("folder_id","template_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "folders_default_reviewer_id_idx" ON "folders"("default_reviewer_id");

-- CreateIndex
CREATE INDEX "task_templates_is_active_idx" ON "task_templates"("is_active");

-- CreateIndex
CREATE INDEX "template_fields_template_id_order_index_idx" ON "template_fields"("template_id", "order_index");

-- CreateIndex
CREATE INDEX "task_instances_folder_id_status_idx" ON "task_instances"("folder_id", "status");

-- CreateIndex
CREATE INDEX "task_instances_assigned_teknisi_id_status_idx" ON "task_instances"("assigned_teknisi_id", "status");

-- CreateIndex
CREATE INDEX "task_instances_status_due_date_idx" ON "task_instances"("status", "due_date");

-- CreateIndex
CREATE INDEX "task_instance_fields_task_instance_id_order_index_idx" ON "task_instance_fields"("task_instance_id", "order_index");

-- CreateIndex
CREATE INDEX "attachments_task_instance_field_id_idx" ON "attachments"("task_instance_field_id");

-- CreateIndex
CREATE INDEX "attachments_sync_status_idx" ON "attachments"("sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_task_instance_id_key" ON "generated_documents"("task_instance_id");

-- CreateIndex
CREATE INDEX "review_logs_task_instance_id_created_at_idx" ON "review_logs"("task_instance_id", "created_at");

-- CreateIndex
CREATE INDEX "device_sessions_user_id_idx" ON "device_sessions"("user_id");

-- CreateIndex
CREATE INDEX "device_sessions_expires_at_idx" ON "device_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "output_layouts_source_template_id_is_default_idx" ON "output_layouts"("source_template_id", "is_default");

-- CreateIndex
CREATE INDEX "layout_blocks_layout_id_order_index_idx" ON "layout_blocks"("layout_id", "order_index");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_default_reviewer_id_fkey" FOREIGN KEY ("default_reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_fields" ADD CONSTRAINT "template_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_assigned_teknisi_id_fkey" FOREIGN KEY ("assigned_teknisi_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_reviewer_override_id_fkey" FOREIGN KEY ("reviewer_override_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instance_fields" ADD CONSTRAINT "task_instance_fields_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_instance_field_id_fkey" FOREIGN KEY ("task_instance_field_id") REFERENCES "task_instance_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "output_layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_task_instance_field_id_fkey" FOREIGN KEY ("task_instance_field_id") REFERENCES "task_instance_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "output_layouts" ADD CONSTRAINT "output_layouts_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "output_layouts" ADD CONSTRAINT "output_layouts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_blocks" ADD CONSTRAINT "layout_blocks_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "output_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_blocks" ADD CONSTRAINT "layout_blocks_source_field_id_fkey" FOREIGN KEY ("source_field_id") REFERENCES "template_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_layout_overrides" ADD CONSTRAINT "folder_layout_overrides_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_layout_overrides" ADD CONSTRAINT "folder_layout_overrides_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_layout_overrides" ADD CONSTRAINT "folder_layout_overrides_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "output_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
