"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListFilter, Search, Trash2 } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/types";
import { AssignTaskDialog, type OptionItem } from "./assign-task-dialog";
import { BulkImportDialog } from "./bulk-import-dialog";

interface FolderDetail {
  id: string;
  name: string;
  clientName: string;
  defaultReviewer: { id: string; name: string };
}

interface TaskRow {
  id: string;
  status: TaskStatus;
  siteId: string | null;
  dueDate: string;
  template: { id: string; name: string };
  assignedTeknisi: { id: string; name: string };
}

// Task yang belum pernah melalui siklus review (nol baris ReviewLog) —
// menghapus task di luar status ini akan ikut menghapus jejak audit
// (ReviewLog cascade), jadi sengaja dikunci hanya dua status ini. Sinkron
// manual dengan DELETABLE_TASK_STATUSES di apps/api/src/tasks/tasks.service.ts.
const DELETABLE_STATUSES: TaskStatus[] = ["assigned", "in_progress"];

type DeleteTarget =
  | { type: "single"; task: TaskRow }
  | { type: "bulk"; ids: string[] }
  | { type: "folder" }
  | null;

// Data folder & task datang dari API (server component), bukan mock.
export function FolderDetailClient({
  folder,
  initialTasks,
  templates,
  teknisiList,
}: {
  folder: FolderDetail;
  initialTasks: TaskRow[];
  templates: OptionItem[];
  teknisiList: OptionItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<TaskStatus>>(new Set());
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [busy, setBusy] = useState(false);

  // Task yang sungguh-sungguh hilang (setelah dihapus + refresh) dibuang dari
  // seleksi lewat perhitungan turunan ini (bukan setState di effect) — task
  // yang cuma tersaring filter tetap boleh tetap tercentang di `selectedIds`.
  const activeSelectedIds = useMemo(() => {
    const validIds = new Set(initialTasks.map((t) => t.id));
    return new Set([...selectedIds].filter((id) => validIds.has(id)));
  }, [selectedIds, initialTasks]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return initialTasks.filter((task) => {
      const matchesSearch =
        term.length === 0 ||
        task.id.toLowerCase().includes(term) ||
        (task.siteId ?? "").toLowerCase().includes(term) ||
        task.assignedTeknisi.name.toLowerCase().includes(term);
      const matchesStatus = statusFilter.size === 0 || statusFilter.has(task.status);
      const matchesTemplate = templateFilter === "all" || task.template.id === templateFilter;
      return matchesSearch && matchesStatus && matchesTemplate;
    });
  }, [initialTasks, search, statusFilter, templateFilter]);

  const selectableIds = useMemo(
    () => filteredTasks.filter((t) => DELETABLE_STATUSES.includes(t.status)).map((t) => t.id),
    [filteredTasks],
  );
  const allSelectableChecked = selectableIds.length > 0 && selectableIds.every((id) => activeSelectedIds.has(id));
  const someSelectableChecked = selectableIds.some((id) => activeSelectedIds.has(id));

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      selectableIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (deleteTarget.type === "folder") {
        const res = await fetch(`/api/proxy/folders/${folder.id}`, { method: "DELETE" });
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          toast.error("Gagal menghapus folder.", { description: body?.message });
          return;
        }
        toast.success(`Folder "${folder.name}" dihapus.`);
        setDeleteTarget(null);
        router.push("/folders");
        return;
      } else if (deleteTarget.type === "single") {
        const res = await fetch(`/api/proxy/tasks/${deleteTarget.task.id}`, { method: "DELETE" });
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          toast.error("Gagal menghapus task.", { description: body?.message });
          return;
        }
        toast.success(`Task "${deleteTarget.task.siteId ?? deleteTarget.task.id.slice(0, 8)}" dihapus.`);
      } else {
        const res = await fetch("/api/proxy/tasks/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: deleteTarget.ids }),
        });
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          results?: Array<{ id: string; status: "deleted" | "failed"; reason?: string }>;
        } | null;
        if (!res.ok) {
          toast.error("Gagal menghapus task.", { description: body?.message });
          return;
        }
        const results = body?.results ?? [];
        const deleted = results.filter((r) => r.status === "deleted").length;
        const failed = results.filter((r) => r.status === "failed");
        if (deleted > 0) toast.success(`${deleted} task dihapus.`);
        if (failed.length > 0) {
          toast.error(`${failed.length} task gagal dihapus.`, {
            description: failed.map((f) => f.reason).filter(Boolean).slice(0, 3).join("; "),
          });
        }
        setSelectedIds(new Set());
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title={folder.name}
        description={`Klien: ${folder.clientName} · Reviewer default: ${folder.defaultReviewer.name}`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={initialTasks.length > 0}
              title={initialTasks.length > 0 ? "Kosongkan folder dari task dulu sebelum menghapusnya" : undefined}
              onClick={() => setDeleteTarget({ type: "folder" })}
            >
              <Trash2 className="size-4" />
              Hapus Folder
            </Button>
            <BulkImportDialog folderId={folder.id} templates={templates} />
            <AssignTaskDialog
              folderId={folder.id}
              templates={templates}
              teknisiList={teknisiList}
            />
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cari Task ID, Site Code, atau nama teknisi…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ListFilter className="size-4" />
                  Status{statusFilter.size > 0 ? ` (${statusFilter.size})` : ""}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter.has(status)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) =>
                      setStatusFilter((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(status);
                        else next.delete(status);
                        return next;
                      })
                    }
                  >
                    <StatusBadge status={status} />
                  </DropdownMenuCheckboxItem>
                ))}
                {statusFilter.size > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setStatusFilter(new Set())}>
                      Reset filter status
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue placeholder="Semua Template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Template</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelectableChecked ? true : someSelectableChecked ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleSelectAll(v === true)}
                      aria-label="Pilih semua task yang bisa dihapus"
                    />
                  </TableHead>
                  <TableHead>Task ID</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Teknisi</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-36 pr-4 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => {
                  const deletable = DELETABLE_STATUSES.includes(task.status);
                  return (
                    <TableRow key={task.id} data-state={activeSelectedIds.has(task.id) ? "selected" : undefined}>
                      <TableCell className="w-10">
                        {deletable && (
                          <Checkbox
                            checked={activeSelectedIds.has(task.id)}
                            onCheckedChange={(v) => toggleSelected(task.id, v === true)}
                            aria-label={`Pilih task ${task.siteId ?? task.id}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{task.siteId ?? task.id.slice(0, 8)}</TableCell>
                      <TableCell>{task.template.name}</TableCell>
                      <TableCell>{task.assignedTeknisi.name}</TableCell>
                      <TableCell>
                        {new Date(task.dueDate).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={task.status} />
                      </TableCell>
                      <TableCell className="w-36 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/tasks/${task.id}`}>
                              {task.status === "submitted" || task.status === "rejected"
                                ? "Review"
                                : "Lihat"}
                            </Link>
                          </Button>
                          {deletable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget({ type: "single", task })}
                              aria-label="Hapus task"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {initialTasks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Belum ada task di folder ini.
                    </TableCell>
                  </TableRow>
                )}
                {initialTasks.length > 0 && filteredTasks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Tidak ada task yang cocok dengan pencarian/filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {activeSelectedIds.size > 0 && (
          <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-4 border-t bg-background px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] md:-mx-6 md:px-6">
            <span className="text-sm font-medium">{activeSelectedIds.size} task dipilih</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Batal
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteTarget({ type: "bulk", ids: [...activeSelectedIds] })}
              >
                <Trash2 className="size-4" />
                Hapus ({activeSelectedIds.size})
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "folder"
                ? "Hapus folder ini?"
                : deleteTarget?.type === "bulk"
                  ? `Hapus ${deleteTarget.ids.length} task?`
                  : "Hapus task ini?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "folder"
                ? "Tindakan ini permanen. Folder yang masih punya task tidak bisa dihapus — kosongkan dulu."
                : "Tindakan ini permanen dan tidak bisa dibatalkan. Seluruh isian, lampiran foto/dokumen, dan salinannya di penyimpanan lokal maupun Google Drive akan ikut dihapus."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {busy ? "Menghapus…" : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
