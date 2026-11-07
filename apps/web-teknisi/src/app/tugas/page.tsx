"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { taskPath } from "@/lib/api";
import { useApiData } from "@/lib/use-api-data";
import { TaskForm, type FormTask } from "@/components/task-form";
import { PageError, PageLoading } from "@/components/page-state";

interface ApiTask {
  id: string;
  status: string;
  siteId: string | null;
  template: { name: string };
  folder: { name: string };
  fields: Array<{
    id: string;
    label: string;
    fieldType: string;
    section: string;
    isRequired: boolean;
    value: unknown;
    options: unknown;
    reviewStatus: "pending" | "approved" | "rejected";
    rejectComment: string | null;
    attachments: Array<{ id: string; originalName: string; mimeType: string; watermarkMetadata?: unknown }>;
  }>;
}

function toFormTask(task: ApiTask): FormTask {
  return {
    id: task.id,
    status: task.status,
    siteId: task.siteId,
    templateName: task.template.name,
    folderName: task.folder.name,
    fields: task.fields.map((f) => ({
      id: f.id,
      label: f.label,
      fieldType: f.fieldType,
      section: f.section,
      isRequired: f.isRequired,
      value: typeof f.value === "string" ? f.value : f.value != null ? JSON.stringify(f.value) : null,
      options: f.options ?? null,
      reviewStatus: f.reviewStatus,
      rejectComment: f.rejectComment,
      attachments: f.attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        metadata: (a.watermarkMetadata ?? null) as Record<string, unknown> | null,
      })),
    })),
  };
}

/** Rute statis /tugas?id=… — static export tidak mendukung segmen dinamis runtime. */
export default function IsiTugasPage() {
  return (
    <Suspense fallback={<Shell><PageLoading /></Shell>}>
      <IsiTugas />
    </Suspense>
  );
}

function IsiTugas() {
  const taskId = useSearchParams().get("id");
  const { data, error, reload } = useApiData<ApiTask>(taskId ? taskPath(taskId) : null);
  const task = useMemo(() => (data ? toFormTask(data) : null), [data]);

  if (task) return <TaskForm key={task.id} task={task} onRefresh={reload} />;
  if (!taskId) return <Shell><PageError message="Tugas tidak ditemukan." /></Shell>;
  return <Shell>{error ? <PageError message={error} onRetry={reload} /> : <PageLoading />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col">{children}</main>;
}
