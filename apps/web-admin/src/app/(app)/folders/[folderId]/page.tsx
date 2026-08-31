import { notFound } from "next/navigation";
import { FolderDetailClient } from "@/components/folder-detail/folder-detail-client";
import { apiGet, ApiError } from "@/lib/api/client";
import type { TaskStatus } from "@/lib/types";

interface FolderDetail {
  id: string;
  name: string;
  clientName: string;
  defaultReviewer: { id: string; name: string };
}

export interface TaskRow {
  id: string;
  status: TaskStatus;
  siteId: string | null;
  dueDate: string;
  template: { id: string; name: string };
  assignedTeknisi: { id: string; name: string };
}

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  // Pengambilan data dipisah dari render — lihat catatan di halaman template.
  let folder: FolderDetail;
  let tasks: TaskRow[];
  let templates: Array<{ id: string; name: string; isActive: boolean }>;
  let users: Array<{ id: string; name: string; role: string; isActive: boolean }>;
  try {
    [folder, tasks, templates, users] = await Promise.all([
      apiGet<FolderDetail>(`/folders/${folderId}`),
      apiGet<TaskRow[]>(`/tasks?folderId=${folderId}`),
      apiGet<Array<{ id: string; name: string; isActive: boolean }>>("/templates"),
      apiGet<Array<{ id: string; name: string; role: string; isActive: boolean }>>("/users").catch(
        // SPV tidak berhak melihat daftar user; dialog tetap bisa dibuka
        // dengan pilihan teknisi kosong daripada seluruh halaman gagal.
        () => [],
      ),
    ]);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 500)) notFound();
    throw err;
  }

  return (
    <FolderDetailClient
      folder={folder}
      initialTasks={tasks}
      templates={templates.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
      teknisiList={users
        .filter((u) => u.role === "teknisi" && u.isActive)
        .map((u) => ({ id: u.id, name: u.name }))}
    />
  );
}
