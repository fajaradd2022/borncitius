import { notFound } from "next/navigation";
import { TaskReviewClient } from "@/components/task-review/task-review-client";
import { apiGet, ApiError } from "@/lib/api/client";
import type { TaskInstance } from "@/lib/types";

interface ApiTask {
  id: string;
  status: TaskInstance["status"];
  siteId: string | null;
  approvedAt: string | null;
  folder: { id: string; name: string };
  template: { id: string; name: string };
  assignedTeknisi: { id: string; name: string };
  fields: Array<{
    id: string;
    label: string;
    fieldType: TaskInstance["fields"][number]["fieldType"];
    section: string;
    orderIndex: number;
    isRequired: boolean;
    value: unknown;
    options: unknown;
    reviewStatus: "pending" | "approved" | "rejected";
    rejectComment: string | null;
    lastEditedBy: string | null;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      syncStatus: "pending" | "synced" | "failed";
      watermarkMetadata?: unknown;
    }>;
  }>;
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  let task: ApiTask;
  try {
    task = await apiGet<ApiTask>(`/tasks/${taskId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <TaskReviewClient
      task={{
        id: task.id,
        status: task.status,
        approvedAt: task.approvedAt ?? undefined,
        headline: task.siteId ?? task.id.slice(0, 8),
        subtitle: `${task.template.name} · ${task.folder.name} · Teknisi: ${task.assignedTeknisi.name}`,
        fields: task.fields.map((f) => ({
          id: f.id,
          label: f.label,
          fieldType: f.fieldType,
          section: f.section,
          orderIndex: f.orderIndex,
          isRequired: f.isRequired,
          value: typeof f.value === "string" ? f.value : f.value == null ? null : JSON.stringify(f.value),
          options: f.options ?? null,
          reviewStatus: f.reviewStatus,
          rejectComment: f.rejectComment ?? undefined,
          lastEditedBy: f.lastEditedBy ?? undefined,
          attachments: f.attachments.map((a) => ({
            id: a.id,
            originalName: a.originalName,
            mimeType: a.mimeType,
            syncStatus: a.syncStatus,
            metadata: (a.watermarkMetadata ?? null) as Record<string, unknown> | null,
          })),
        })),
      }}
    />
  );
}
