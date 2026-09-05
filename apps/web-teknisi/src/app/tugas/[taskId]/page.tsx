import { notFound } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api/client";
import { TaskForm, type FormTask } from "@/components/task-form";

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
    attachments: Array<{ id: string; originalName: string; mimeType: string }>;
  }>;
}

export default async function IsiTugasPage({
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

  const formTask: FormTask = {
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
      attachments: f.attachments,
    })),
  };

  return <TaskForm task={formTask} />;
}
