"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface OptionItem {
  id: string;
  name: string;
}

/** PRD 4.3 — membuat Task Instance baru dari template, di-assign ke 1 teknisi. */
export function AssignTaskDialog({
  folderId,
  templates,
  teknisiList,
}: {
  folderId: string;
  templates: OptionItem[];
  teknisiList: OptionItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ templateId: "", teknisiId: "", dueDate: "", siteId: "" });

  async function submit() {
    if (!form.templateId || !form.teknisiId || !form.dueDate) {
      toast.error("Template, teknisi, dan jatuh tempo wajib diisi.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/proxy/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId,
          templateId: form.templateId,
          assignedTeknisiId: form.teknisiId,
          dueDate: new Date(form.dueDate).toISOString(),
          siteId: form.siteId.trim() || undefined,
        }),
      });

      const body = (await res.json().catch(() => null)) as { message?: string; siteId?: string } | null;
      if (!res.ok) {
        toast.error("Gagal membuat task.", { description: body?.message });
        return;
      }

      toast.success(`Task "${body?.siteId ?? "baru"}" dibuat & di-assign.`);
      setOpen(false);
      setForm({ templateId: "", teknisiId: "", dueDate: "", siteId: "" });
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Assign Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Task Baru</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Template</Label>
            <Select
              value={form.templateId}
              onValueChange={(v) => setForm((f) => ({ ...f, templateId: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Teknisi</Label>
            <Select
              value={form.teknisiId}
              onValueChange={(v) => setForm((f) => ({ ...f, teknisiId: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih teknisi…" />
              </SelectTrigger>
              <SelectContent>
                {teknisiList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-id">Kode Site / Store</Label>
            <Input
              id="site-id"
              value={form.siteId}
              onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
              placeholder="mis. R881-CAMMING-BONE"
            />
            <p className="text-xs text-muted-foreground">
              Dipakai sebagai nama folder di Google Drive dan judul task.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="due-date">Jatuh Tempo</Label>
            <Input
              id="due-date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Membuat…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
