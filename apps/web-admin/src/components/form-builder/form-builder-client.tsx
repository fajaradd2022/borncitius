"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileText,
  Heading,
  Image as ImageIcon,
  MapPin,
  Plus,
  Save,
  Table2,
  Trash2,
  Type,
} from "lucide-react";

import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { FIELD_TYPE_LABEL, type FieldType, type TemplateField } from "@/lib/types";

// PRD 4.1 (Dynamic Form Builder) + 9.3 (referensi 21st.dev: "Drag-and-drop
// form builder canvas + panel properti field"). v1 memakai reorder tombol
// naik/turun — upgrade ke drag-and-drop (mis. @dnd-kit) bisa menyusul tanpa
// mengubah bentuk data TemplateField di bawah ini.

let idCounter = 1000;
function newFieldId() {
  idCounter += 1;
  return `new-${idCounter}`;
}

// Field baru dari builder punya id seperti "new-1001" — cuma UUID asli yang
// dikirim ke server sebagai penanda "update di tempat" (lihat komentar
// upsert-per-id di templates.module.ts).
const REAL_UUID = /^[0-9a-f-]{36}$/i;

function fieldIcon(type: FieldType) {
  switch (type) {
    case "section":
      return Heading;
    case "photo":
      return ImageIcon;
    case "file":
    case "signed_document":
      return FileText;
    case "gps":
      return MapPin;
    case "repeat_table":
      return Table2;
    default:
      return Type;
  }
}

export function FormBuilderClient({
  templateId,
  templateName,
  templateVersion,
  initialFields,
  initialIsActive,
}: {
  templateId?: string;
  templateName: string;
  templateVersion: number;
  initialFields: TemplateField[];
  initialIsActive: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(templateName);
  const [fields, setFields] = useState<TemplateField[]>(initialFields);
  const [selectedId, setSelectedId] = useState<string | null>(initialFields[0]?.id ?? null);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  function updateSelected(patch: Partial<TemplateField>) {
    if (!selected) return;
    setFields((prev) =>
      prev.map((f) => (f.id === selected.id ? { ...f, ...patch } : f))
    );
  }

  function addField() {
    const field: TemplateField = {
      id: newFieldId(),
      label: "Field Baru",
      fieldType: "text",
      isRequired: false,
      section: fields[fields.length - 1]?.section ?? "Info Umum",
      orderIndex: fields.length,
    };
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateField(field: TemplateField) {
    const copy: TemplateField = { ...field, id: newFieldId(), label: `${field.label} (copy)` };
    const idx = fields.findIndex((f) => f.id === field.id);
    setFields((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
  }

  function move(id: string, dir: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Nama template wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        isActive,
        fields: fields.map((f, i) => ({
          id: REAL_UUID.test(f.id) ? f.id : undefined,
          label: f.label,
          fieldType: f.fieldType,
          options: f.options,
          isRequired: f.isRequired,
          section: f.section,
          orderIndex: i,
        })),
      });

      const res = templateId
        ? await fetch(`/api/proxy/templates/${templateId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch("/api/proxy/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });

      const result = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menyimpan template.", { description: result?.message });
        return;
      }

      toast.success(`Template "${name}" disimpan.`, {
        description:
          "Task yang sudah berjalan tidak berubah — snapshot versi lama tetap dipakai (PRD: Template Versioning).",
      });

      if (!templateId && result?.id) {
        router.push(`/templates/${result.id}`);
      } else {
        router.refresh();
      }
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!templateId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/templates/${templateId}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menghapus template.", { description: body?.message });
        return;
      }
      toast.success(`Template "${name}" dihapus.`);
      router.push("/templates");
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
        title="Form Builder"
        description={`Susun field & section untuk template ini · v${templateVersion}`}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="active" />
              <Label htmlFor="active" className="text-muted-foreground">
                {isActive ? "Aktif" : "Nonaktif"}
              </Label>
            </div>
            {templateId && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Hapus Template
              </Button>
            )}
            <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
              <Save className="size-4" />
              {saving ? "Menyimpan…" : "Simpan Template"}
            </Button>
          </div>
        }
      />
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-[1fr_360px]">
        {/* Canvas */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-6">
              <Label htmlFor="tmpl-name" className="mb-1.5 block text-xs text-muted-foreground">
                Nama Template
              </Label>
              <Input id="tmpl-name" value={name} onChange={(e) => setName(e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col divide-y pt-2">
              {fields.map((field, i) => {
                const Icon = fieldIcon(field.fieldType);
                return (
                  <div
                    key={field.id}
                    onClick={() => setSelectedId(field.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-2 py-3 first:pt-3",
                      selectedId === field.id && "rounded-md bg-accent",
                      field.fieldType === "section" && "font-medium"
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 truncate">
                      <span className={field.fieldType === "section" ? "" : "text-sm"}>
                        {field.label}
                      </span>
                      {field.isRequired && <span className="ml-1 text-destructive">*</span>}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {FIELD_TYPE_LABEL[field.fieldType]} · {field.section}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => move(field.id, -1)} disabled={i === 0}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => move(field.id, 1)} disabled={i === fields.length - 1}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => duplicateField(field)}>
                        <Copy className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => removeField(field.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {fields.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada field. Tambahkan dari tombol di bawah.
                </p>
              )}
            </CardContent>
          </Card>

          <Button variant="outline" onClick={addField} className="self-start">
            <Plus className="size-4" />
            Tambah Field
          </Button>
        </div>

        {/* Panel properti field */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Pilih field di kiri untuk mengatur propertinya.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input
                      value={selected.label}
                      onChange={(e) => updateSelected({ label: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Tipe Field</Label>
                    <Select
                      value={selected.fieldType}
                      onValueChange={(v) => updateSelected({ fieldType: v as FieldType })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Section</Label>
                    <Input
                      value={selected.section}
                      onChange={(e) => updateSelected({ section: e.target.value })}
                    />
                  </div>

                  {(selected.fieldType === "dropdown" || selected.fieldType === "radio") && (
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Opsi (pisahkan dengan koma)
                      </Label>
                      <Textarea
                        value={(selected.options ?? []).join(", ")}
                        onChange={(e) =>
                          updateSelected({
                            options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        className="min-h-16"
                      />
                    </div>
                  )}

                  {selected.fieldType !== "section" && (
                    <div className="flex items-center justify-between">
                      <Label htmlFor="required" className="text-sm">
                        Wajib diisi
                      </Label>
                      <Switch
                        id="required"
                        checked={selected.isRequired}
                        onCheckedChange={(v) => updateSelected({ isRequired: v })}
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus template ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini permanen. Template yang masih dipakai task atau punya layout output
              tidak bisa dihapus — lepaskan dependensi itu dulu.
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
