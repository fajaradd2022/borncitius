import Link from "next/link";
import { ChevronRight, ClipboardList, LogOut, MapPin } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { logoutAction } from "@/lib/api/auth-actions";
import { SyncIndicator } from "@/components/sync-indicator";
import { PrefetchTasks } from "@/components/prefetch-tasks";

interface TaskRow {
  id: string;
  status: "assigned" | "in_progress" | "submitted" | "rejected" | "approved";
  siteId: string | null;
  dueDate: string;
  folder: { name: string; clientName: string };
  template: { name: string };
}

const STATUS_LABEL: Record<TaskRow["status"], { text: string; cls: string }> = {
  assigned: { text: "Baru", cls: "bg-blue-100 text-blue-700" },
  in_progress: { text: "Dikerjakan", cls: "bg-amber-100 text-amber-700" },
  submitted: { text: "Menunggu Review", cls: "bg-zinc-100 text-zinc-600" },
  rejected: { text: "Perlu Revisi", cls: "bg-red-100 text-red-700" },
  approved: { text: "Selesai", cls: "bg-green-100 text-green-700" },
};

export default async function DaftarTugasPage() {
  const all = await apiGet<TaskRow[]>("/tasks");
  // Task yang sudah disubmit/selesai hilang dari daftar teknisi (PRD 5.7).
  const tasks = all.filter((t) => t.status !== "submitted" && t.status !== "approved");

  return (
    <main className="flex min-h-dvh flex-col">
      <PrefetchTasks taskIds={tasks.map((t) => t.id)} />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-bold">Tugas Saya</h1>
          <p className="text-xs text-zinc-500">{tasks.length} tugas aktif</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncIndicator />
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Keluar"
              className="flex size-10 items-center justify-center rounded-lg text-zinc-500 active:bg-muted"
            >
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {tasks.map((task) => {
          const badge = STATUS_LABEL[task.status];
          const overdue = new Date(task.dueDate) < new Date();
          return (
            <Link
              key={task.id}
              href={`/tugas/${task.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border p-4 active:bg-muted"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardList className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{task.siteId ?? task.id.slice(0, 8)}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                    {badge.text}
                  </span>
                </div>
                <p className="truncate text-sm text-zinc-500">{task.template.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">
                  <MapPin className="size-3" />
                  {task.folder.name}
                  <span className={overdue ? "ml-1 font-medium text-danger" : "ml-1"}>
                    · {new Date(task.dueDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                  </span>
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-zinc-300" />
            </Link>
          );
        })}

        {tasks.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <ClipboardList className="size-12 text-zinc-300" />
            <p className="font-medium">Tidak ada tugas aktif</p>
            <p className="max-w-xs text-sm text-zinc-500">
              Tugas baru akan muncul di sini begitu admin menugaskannya kepada Anda.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
