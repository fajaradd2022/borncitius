"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";

import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { LayoutRibbon } from "./layout-ribbon";
import { LayoutCanvas } from "./layout-canvas";
import { BlockPropertiesPanel } from "./block-properties-panel";
import { LayoutAiPanel } from "./layout-ai-panel";
import { toApiBlocks } from "@/lib/api/layout-mapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_BORDER,
  DEFAULT_TEXT_STYLE,
  type LayoutBlock,
  type LayoutBlockType,
  type TaskTemplate,
} from "@/lib/types";

// PRD 9 — Output Layout Builder v2: kanvas WYSIWYG dengan drag & drop
// (@dnd-kit) + toolbar bergaya ribbon. Semua blok bisa dihapus & dipindah
// bebas, termasuk blok "attachment" (merge hasil scan) yang boleh ditaruh
// di awal dokumen — mengikuti format laporan customer.

let idCounter = 6000;
function newBlockId() {
  idCounter += 1;
  return `blk-${idCounter}`;
}

function makeBlock(type: LayoutBlockType, template: TaskTemplate): LayoutBlock {
  const base: LayoutBlock = { id: newBlockId(), type, label: "" };

  switch (type) {
    case "text":
      return { ...base, label: "Teks", content: "Teks baru", textStyle: { ...DEFAULT_TEXT_STYLE } };
    case "image":
      return { ...base, label: "Gambar", imageWidth: 120, textStyle: { ...DEFAULT_TEXT_STYLE } };
    case "field": {
      const f = template.fields.find(
        (x) => x.fieldType !== "section" && !["photo", "file", "signed_document"].includes(x.fieldType)
      );
      return {
        ...base,
        label: f?.label ?? "Field",
        sourceFieldId: f?.id,
        displayStyle: "stacked",
      };
    }
    case "field-grid":
      return { ...base, label: "Grid Field", fieldIds: [], gridColumns: 2, border: { ...DEFAULT_BORDER } };
    case "table":
      return {
        ...base,
        label: "Tabel",
        tableMode: "static",
        columns: [
          { id: `c-${Date.now()}-1`, header: "No" },
          { id: `c-${Date.now()}-2`, header: "Uraian" },
          { id: `c-${Date.now()}-3`, header: "Keterangan" },
        ],
        rows: [["1", "", ""]],
        emptyRows: 0,
        headerBgColor: "#1e3a5f",
        headerTextColor: "#ffffff",
        border: { ...DEFAULT_BORDER },
      };
    case "photo-page": {
      const p = template.fields.find((x) => x.fieldType === "photo");
      return {
        ...base,
        label: p ? `Halaman Foto — ${p.label}` : "Halaman Foto",
        sourceFieldId: p?.id,
        caption: p?.label ?? "",
        captionPosition: "below",
        pageHeader: { show: true, leftText: "Nama Store / Kode Store", rightText: "BERITA ACARA INSTALASI" },
        border: { ...DEFAULT_BORDER },
      };
    }
    case "attachment": {
      const s = template.fields.find((x) => x.fieldType === "signed_document");
      return { ...base, label: "Lampiran Scan", sourceFieldId: s?.id };
    }
    case "page-break":
      return { ...base, label: "Pemisah Halaman" };
    case "header":
      return {
        ...base,
        label: "Header",
        showLogo: true,
        companyName: "Born Citius",
        reportTitle: template.name,
        showReferenceNumber: true,
      };
    case "footer":
      return { ...base, label: "Footer", showPageNumber: true, footerNote: "" };
    default:
      return base;
  }
}

export function LayoutBuilderClient({
  layoutId,
  layoutName: initialName,
  sourceTemplate,
  initialBlocks,
  initialIsDefault = false,
}: {
  /** Kosong berarti layout baru — disimpan lewat POST, bukan PUT. */
  layoutId?: string;
  layoutName: string;
  sourceTemplate: TaskTemplate;
  initialBlocks: LayoutBlock[];
  initialIsDefault?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialName);
  const [blocks, setBlocks] = useState<LayoutBlock[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  // Menyimpan satu snapshot sebelum AI menerapkan perubahan, agar bisa dibatalkan.
  const [previousBlocks, setPreviousBlocks] = useState<LayoutBlock[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function applyAiBlocks(next: LayoutBlock[]) {
    setPreviousBlocks(blocks);
    setBlocks(next);
    setSelectedId(null);
  }

  function undoAi() {
    if (!previousBlocks) return;
    setBlocks(previousBlocks);
    setPreviousBlocks(null);
    setSelectedId(null);
  }

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function updateBlock(id: string, patch: Partial<LayoutBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function updateSelected(patch: Partial<LayoutBlock>) {
    if (!selectedId) return;
    updateBlock(selectedId, patch);
  }

  function insertBlock(type: LayoutBlockType) {
    const block = makeBlock(type, sourceTemplate);
    // Sisipkan setelah blok terpilih supaya penempatan terasa natural.
    setBlocks((prev) => {
      const idx = selectedId ? prev.findIndex((b) => b.id === selectedId) : -1;
      if (idx === -1) return [...prev, block];
      return [...prev.slice(0, idx + 1), block, ...prev.slice(idx + 1)];
    });
    setSelectedId(block.id);
  }

  function duplicateBlock(id: string) {
    const src = blocks.find((b) => b.id === id);
    if (!src) return;
    const copy: LayoutBlock = { ...src, id: newBlockId(), label: `${src.label} (salinan)` };
    const idx = blocks.findIndex((b) => b.id === id);
    setBlocks((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
    setSelectedId(copy.id);
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleTableOp(op: "add-row" | "remove-row" | "add-col" | "remove-col") {
    if (!selected || selected.type !== "table") return;
    const columns = selected.columns ?? [];
    const rows = selected.rows ?? [];

    if (op === "add-row") {
      updateSelected({ rows: [...rows, columns.map(() => "")] });
    } else if (op === "remove-row") {
      updateSelected({ rows: rows.slice(0, -1) });
    } else if (op === "add-col") {
      updateSelected({
        columns: [...columns, { id: `c-${Date.now()}`, header: `Kolom ${columns.length + 1}` }],
        rows: rows.map((r) => [...r, ""]),
      });
    } else {
      updateSelected({
        columns: columns.slice(0, -1),
        rows: rows.map((r) => r.slice(0, -1)),
      });
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Nama layout tidak boleh kosong.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        isDefault,
        blocks: toApiBlocks(blocks),
        ...(layoutId ? {} : { sourceTemplateId: sourceTemplate.id }),
      };

      const res = await fetch(layoutId ? `/api/proxy/layouts/${layoutId}` : "/api/proxy/layouts", {
        method: layoutId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menyimpan layout.", { description: body?.message });
        return;
      }

      toast.success(`Layout "${name}" tersimpan.`, {
        description: isDefault
          ? `Dijadikan layout default untuk template "${sourceTemplate.name}".`
          : "Bisa di-assign ke folder tertentu lewat halaman Folder & Task.",
      });

      // Layout baru: pindah ke URL-nya agar penyimpanan berikutnya jadi update,
      // bukan membuat salinan baru setiap kali tombol Simpan ditekan.
      if (!layoutId && body?.id) router.replace(`/layouts/${body.id}`);
      else router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!layoutId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/layouts/${layoutId}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menghapus layout.", { description: body?.message });
        return;
      }
      toast.success(`Layout "${name}" dihapus.`);
      router.push("/layouts");
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <Topbar
        title="Output Layout Builder"
        description={`Sumber field: ${sourceTemplate.name}`}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="is-default" />
              <Label htmlFor="is-default" className="text-muted-foreground">
                Default
              </Label>
            </div>
            {layoutId && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Hapus Layout
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              data-testid="save-layout-button"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Menyimpan…" : "Simpan Layout"}
            </Button>
          </div>
        }
      />

      <LayoutRibbon
        selected={selected}
        onInsert={insertBlock}
        onUpdateSelected={updateSelected}
        onTableOp={handleTableOp}
      />

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="layout-name" className="shrink-0 text-xs text-muted-foreground">
              Nama Layout
            </Label>
            <Input
              id="layout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-md"
            />
          </div>

          <LayoutCanvas
            blocks={blocks}
            sourceTemplate={sourceTemplate}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={setBlocks}
            onDuplicate={duplicateBlock}
            onRemove={removeBlock}
          />
        </div>

        <div className="lg:sticky lg:top-36 lg:self-start">
          <Tabs defaultValue="properties">
            <TabsList className="w-full">
              <TabsTrigger value="properties" className="flex-1">
                Properti
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex-1">
                Asisten AI
              </TabsTrigger>
            </TabsList>
            <TabsContent value="properties" className="mt-3">
              <BlockPropertiesPanel
                block={selected}
                sourceTemplate={sourceTemplate}
                onUpdate={updateSelected}
              />
            </TabsContent>
            <TabsContent value="ai" className="mt-3">
              <LayoutAiPanel
                sourceTemplate={sourceTemplate}
                currentBlocks={blocks}
                onApply={applyAiBlocks}
                onUndo={undoAi}
                canUndo={previousBlocks !== null}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus layout ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini permanen. Layout yang jadi default untuk template, atau masih dipakai
              sebagai override khusus di suatu folder, tidak bisa dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Menghapus…" : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
