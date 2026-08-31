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
import type { OptionItem } from "./assign-task-dialog";

/** Buat folder klien/project baru — admin only (PRD Bagian 3). */
export function CreateFolderDialog({ reviewerOptions }: { reviewerOptions: OptionItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", clientName: "", defaultReviewerId: "" });

  async function submit() {
    if (!form.name.trim() || !form.clientName.trim() || !form.defaultReviewerId) {
      toast.error("Nama folder, klien, dan reviewer default wajib diisi.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/proxy/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          clientName: form.clientName.trim(),
          defaultReviewerId: form.defaultReviewerId,
        }),
      });

      const body = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal membuat folder.", { description: body?.message });
        return;
      }

      toast.success(`Folder "${body?.name ?? form.name}" dibuat.`);
      setOpen(false);
      setForm({ name: "", clientName: "", defaultReviewerId: "" });
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
          Buat Folder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Folder Baru</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-name">Nama Folder</Label>
            <Input
              id="folder-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="mis. Rollout SD-WAN Alfamart"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-name">Nama Klien</Label>
            <Input
              id="client-name"
              value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              placeholder="mis. PT Sumber Alfaria Trijaya Tbk."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Reviewer Default</Label>
            <Select
              value={form.defaultReviewerId}
              onValueChange={(v) => setForm((f) => ({ ...f, defaultReviewerId: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih reviewer…" />
              </SelectTrigger>
              <SelectContent>
                {reviewerOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Reviewer yang meng-approve task di folder ini secara default.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Membuat…" : "Buat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
