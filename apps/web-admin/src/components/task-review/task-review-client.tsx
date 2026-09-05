"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  CheckCircle2,
  Pencil,
  RotateCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  XCircle,
  Download,
  FileText,
  ImageIcon,
  PenLine,
  Loader2,
  X,
  Upload,
  Camera,
} from "lucide-react";

import { Topbar } from "@/components/topbar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttachmentLightbox, type LightboxItem } from "@/components/ui/attachment-lightbox";
import { cn } from "@/lib/utils";
import type { FieldType, ReviewStatus, TaskStatus } from "@/lib/types";

const ATTACHMENT_FIELD_TYPES: FieldType[] = ["photo", "file", "signed_document"];

export interface ReviewAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  syncStatus: "pending" | "synced" | "failed";
  metadata?: Record<string, unknown> | null;
}

export interface ReviewField {
  id: string;
  label: string;
  fieldType: FieldType;
  section: string;
  orderIndex: number;
  isRequired: boolean;
  value: string | null;
  options?: unknown;
  reviewStatus: ReviewStatus;
  rejectComment?: string;
  lastEditedBy?: string;
  attachments?: ReviewAttachment[];
}

export interface ReviewTask {
  id: string;
  status: TaskStatus;
  approvedAt?: string;
  headline: string;
  subtitle: string;
  fields: ReviewField[];
}

// PRD 4.4 — Review & Approval Workflow.
// Approve/reject + komentar digabung langsung di dalam tiap field (bukan
// panel terpisah) — tombol aksi ada di baris bawah, di sebelah kontrol
// edit/revisi. Reviewer juga bisa "revisi langsung" (edit nilai field)
// tanpa mengirim balik ke teknisi — lihat catatan di PRD.
//
// Setiap aksi di bawah memanggil endpoint WorkflowService sungguhan lewat
// proxy admin (token disisipkan dari cookie httpOnly di server) — state
// lokal hanya di-patch dari RESPONS server, bukan ditebak sendiri, supaya
// penolakan server (mis. "masih ada field belum disetujui") tidak diam-diam
// dianggap sukses seperti versi sebelumnya.

function fieldIcon(type: FieldType) {
  if (type === "photo") return ImageIcon;
  if (type === "file" || type === "signed_document") return FileText;
  return null;
}

function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  if (status === "approved")
    return (
      <Badge className="gap-1 bg-[oklch(0.7_0.15_160_/_0.18)] text-[oklch(0.35_0.12_160)] hover:bg-[oklch(0.7_0.15_160_/_0.18)]">
        <CheckCircle2 className="size-3" /> Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" /> Rejected
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      Pending
    </Badge>
  );
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/tasks${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok) {
    throw new Error(body?.message ?? "Permintaan gagal.");
  }
  return body as T;
}

function errorMessage(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

export function TaskReviewClient({ task: initialTask }: { task: ReviewTask }) {
  const [task, setTask] = useState(initialTask);
  const [rejectingFieldId, setRejectingFieldId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [exporting, setExporting] = useState<null | "pdf" | "word">(null);
  const [busyFieldId, setBusyFieldId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<null | "send-back" | "approve-all" | "reopen">(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  // Ref berkas dipakai bersama antar field (hanya satu editor aktif pada satu waktu).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; startIndex: number } | null>(null);

  /**
   * Dokumen dibuat di server lalu diunduh langsung; blob URL dilepas setelah
   * dipakai agar tidak menahan memori.
   */
  async function handleExport(format: "pdf" | "word") {
    setExporting(format);
    try {
      const res =
        format === "pdf"
          ? await fetch(`/api/tasks/${task.id}/document`, { method: "POST" })
          : await fetch(`/api/tasks/${task.id}/word`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error("Gagal membuat dokumen.", { description: body?.error });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BAST-${task.headline}.${format === "pdf" ? "pdf" : "docx"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dokumen berhasil diunduh.");
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setExporting(null);
    }
  }

  const reviewableFields = useMemo(
    () => task.fields.filter((f) => f.fieldType !== "section"),
    [task.fields]
  );
  // TestCall: bila ada repeat_table, SEMUA field photo jadi "gudang foto" yang
  // ditampilkan di dalam tabel (bukan sebagai field terpisah).
  const docPhotoFieldIds = useMemo(() => {
    const hasRepeat = task.fields.some((f) => f.fieldType === "repeat_table");
    return hasRepeat
      ? new Set(task.fields.filter((f) => f.fieldType === "photo").map((f) => f.id))
      : new Set<string>();
  }, [task.fields]);
  const docPhotoAttachments = useMemo(
    () =>
      task.fields
        .filter((f) => docPhotoFieldIds.has(f.id))
        .flatMap((f) => f.attachments ?? []),
    [task.fields, docPhotoFieldIds],
  );
  const allApproved =
    reviewableFields.length > 0 &&
    reviewableFields.every((f) => f.reviewStatus === "approved");
  const anyRejected = reviewableFields.some((f) => f.reviewStatus === "rejected");
  const isFinal = task.status === "approved";

  function updateField(fieldId: string, patch: Partial<ReviewField>) {
    setTask((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
    }));
  }

  async function handleApprove(field: ReviewField) {
    setBusyFieldId(field.id);
    try {
      const updated = await apiRequest<{ reviewStatus: ReviewStatus; rejectComment: string | null }>(
        `/${task.id}/fields/${field.id}/review`,
        { method: "POST", body: JSON.stringify({ action: "approve" }) },
      );
      updateField(field.id, {
        reviewStatus: updated.reviewStatus,
        rejectComment: updated.rejectComment ?? undefined,
      });
      toast.success(`"${field.label}" ditandai approved`);
    } catch (err) {
      toast.error("Gagal approve field.", { description: errorMessage(err) });
    } finally {
      setBusyFieldId(null);
    }
  }

  function openReject(field: ReviewField) {
    setRejectingFieldId(field.id);
    setRejectComment(field.rejectComment ?? "");
  }

  async function submitReject(field: ReviewField) {
    if (!rejectComment.trim()) {
      toast.error("Komentar wajib diisi saat reject.");
      return;
    }
    setBusyFieldId(field.id);
    try {
      const updated = await apiRequest<{ reviewStatus: ReviewStatus; rejectComment: string | null }>(
        `/${task.id}/fields/${field.id}/review`,
        { method: "POST", body: JSON.stringify({ action: "reject", comment: rejectComment.trim() }) },
      );
      updateField(field.id, {
        reviewStatus: updated.reviewStatus,
        rejectComment: updated.rejectComment ?? undefined,
      });
      setRejectingFieldId(null);
      setRejectComment("");
      toast.success(`"${field.label}" direject, komentar terkirim`);
    } catch (err) {
      toast.error("Gagal mengirim reject.", { description: errorMessage(err) });
    } finally {
      setBusyFieldId(null);
    }
  }

  function openEdit(field: ReviewField) {
    setEditingFieldId(field.id);
    setEditValue(field.value ?? "");
  }

  async function saveDirectEdit(field: ReviewField) {
    // "Revisi langsung oleh reviewer" (PRD 4.4 + ERD REVIEW_LOG.action=edit_field):
    // reviewer mengubah nilai field sendiri, tercatat lastEditedBy/At, status jadi approved.
    setBusyFieldId(field.id);
    try {
      const updated = await apiRequest<{
        value: unknown;
        reviewStatus: ReviewStatus;
        lastEditedBy: string | null;
      }>(`/${task.id}/fields/${field.id}/reviewer-edit`, {
        method: "PATCH",
        body: JSON.stringify({ value: editValue }),
      });
      updateField(field.id, {
        value: typeof updated.value === "string" ? updated.value : editValue,
        reviewStatus: updated.reviewStatus,
        lastEditedBy: updated.lastEditedBy ?? "anda",
        rejectComment: undefined,
      });
      setEditingFieldId(null);
      toast.success(`"${field.label}" direvisi langsung.`);
    } catch (err) {
      toast.error("Gagal menyimpan revisi.", { description: errorMessage(err) });
    } finally {
      setBusyFieldId(null);
    }
  }

  async function handleSendBack() {
    setBusyAction("send-back");
    try {
      const updated = await apiRequest<{ status: TaskStatus }>(`/${task.id}/send-back`, {
        method: "POST",
      });
      setTask((prev) => ({ ...prev, status: updated.status }));
      toast.success("Task dikirim balik ke teknisi untuk revisi.");
    } catch (err) {
      toast.error("Gagal mengirim balik ke teknisi.", { description: errorMessage(err) });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApproveAll() {
    setBusyAction("approve-all");
    try {
      const updated = await apiRequest<{ status: TaskStatus; approvedAt: string | null }>(
        `/${task.id}/approve`,
        { method: "POST" },
      );
      setTask((prev) => ({
        ...prev,
        status: updated.status,
        approvedAt: updated.approvedAt ?? prev.approvedAt,
      }));
      toast.success("Task disetujui — dokumen BAST siap di-generate.");
    } catch (err) {
      toast.error("Gagal menyetujui task.", { description: errorMessage(err) });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReopen() {
    if (!reopenReason.trim()) {
      toast.error("Alasan wajib diisi.");
      return;
    }
    setBusyAction("reopen");
    try {
      const updated = await apiRequest<{ status: TaskStatus; approvedAt: string | null }>(
        `/${task.id}/reopen`,
        { method: "POST", body: JSON.stringify({ reason: reopenReason.trim() }) },
      );
      setTask((prev) => ({ ...prev, status: updated.status, approvedAt: updated.approvedAt ?? undefined }));
      toast.success("Task dibuka kembali.", { description: "Bisa diedit dan diapprove ulang." });
      setReopenOpen(false);
      setReopenReason("");
    } catch (err) {
      toast.error("Gagal membuka kembali task.", { description: errorMessage(err) });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteAttachment(field: ReviewField, attachment: ReviewAttachment) {
    if (!window.confirm(`Hapus lampiran "${attachment.originalName}"? Tindakan ini permanen.`)) return;
    try {
      const res = await fetch(
        `/api/proxy/tasks/${task.id}/fields/${field.id}/attachments/${attachment.id}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menghapus lampiran.", { description: body?.message });
        return;
      }
      updateField(field.id, {
        attachments: (field.attachments ?? []).filter((a) => a.id !== attachment.id),
      });
      toast.success("Lampiran dihapus.");
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    }
  }

  // Upload/ganti lampiran (foto/file/dokumen) langsung dari halaman review.
  // Untuk field bertipe foto/file, tombol edit membuka pemilih berkas ini —
  // bukan input teks. Endpoint sama dengan yang dipakai teknisi.
  async function handleUploadAttachment(field: ReviewField, file: File) {
    setBusyFieldId(field.id);
    try {
      const type =
        field.fieldType === "signed_document"
          ? "signed_document"
          : field.fieldType === "file"
            ? "file_uploaded"
            : "photo_uploaded";
      const form = new FormData();
      form.append("file", file);
      form.append("type", type);
      const res = await fetch(
        `/api/proxy/tasks/${task.id}/fields/${field.id}/attachments`,
        { method: "POST", body: form },
      );
      const body = (await res.json().catch(() => null)) as
        | (ReviewAttachment & { message?: string })
        | null;
      if (!res.ok || !body?.id) {
        toast.error("Gagal mengunggah berkas.", { description: body?.message });
        return;
      }
      updateField(field.id, {
        attachments: [
          ...(field.attachments ?? []),
          {
            id: body.id,
            originalName: body.originalName,
            mimeType: body.mimeType,
            syncStatus: body.syncStatus ?? "pending",
          },
        ],
      });
      setEditingFieldId(null);
      toast.success(`Berkas untuk "${field.label}" berhasil diunggah.`);
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setBusyFieldId(null);
    }
  }

  const sections = useMemo(() => {
    const map = new Map<string, ReviewField[]>();
    for (const f of task.fields) {
      const list = map.get(f.section) ?? [];
      list.push(f);
      map.set(f.section, list);
    }
    return Array.from(map.entries());
  }, [task.fields]);

  return (
    <>
      <Topbar
        title={task.headline}
        description={task.subtitle}
        actions={
          isFinal ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => setReopenOpen(true)}
              >
                <RotateCcw className="size-4" />
                Buka Kembali
              </Button>
              <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => void handleExport("pdf")}>
                {exporting === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Export PDF
              </Button>
              <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => void handleExport("word")}>
                {exporting === "word" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Export Word
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <StatusBadge status={task.status} />
              <Button
                variant="outline"
                size="sm"
                disabled={!anyRejected || busyAction !== null}
                onClick={() => void handleSendBack()}
              >
                {busyAction === "send-back" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Kirim Balik ke Teknisi
              </Button>
              <Button
                size="sm"
                disabled={!allApproved || busyAction !== null}
                onClick={() => void handleApproveAll()}
              >
                {busyAction === "approve-all" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Approve Semua
              </Button>
            </div>
          )
        }
      />

      {isFinal && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-[oklch(0.7_0.15_160_/_0.35)] bg-[oklch(0.7_0.15_160_/_0.1)] px-4 py-3 text-sm md:mx-6">
          <CheckCircle2 className="size-4 shrink-0 text-[oklch(0.5_0.15_160)]" />
          Task ini sudah <strong>Approved</strong> pada{" "}
          {task.approvedAt &&
            new Date(task.approvedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
          . Dokumen akhir = halaman isian ini + lampiran tanda tangan fisik (merge otomatis).
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 md:p-6">
        {sections.map(([section, fields]) => (
          <Card key={section}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{section}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {fields
                .filter((f) => f.fieldType !== "section")
                .filter((f) => !docPhotoFieldIds.has(f.id))
                .map((field) => {
                  const Icon = fieldIcon(field.fieldType);
                  const isEditing = editingFieldId === field.id;
                  const isRejectingThis = rejectingFieldId === field.id;
                  const isBusy = busyFieldId === field.id;
                  const hasAttachments = ATTACHMENT_FIELD_TYPES.includes(field.fieldType);
                  return (
                    <div
                      key={field.id}
                      id={`field-${field.id}`}
                      className={cn(
                        "flex flex-col gap-2 py-3 first:pt-0 last:pb-0",
                        field.reviewStatus === "rejected" &&
                          "-mx-4 rounded-md border border-destructive/40 bg-destructive/5 px-4"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {field.label}
                          {field.isRequired && <span className="text-destructive"> *</span>}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {field.lastEditedBy && (
                            <Badge variant="outline" className="gap-1 text-xs font-normal">
                              <PenLine className="size-3" />
                              Direvisi reviewer
                            </Badge>
                          )}
                          <ReviewStatusPill status={field.reviewStatus} />
                        </div>
                      </div>

                      {isEditing ? (
                        hasAttachments ? (
                          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                            <p className="text-xs text-muted-foreground">
                              {field.fieldType === "photo"
                                ? "Ambil foto dari kamera atau unggah dari galeri untuk mengganti/menambah."
                                : "Unggah berkas untuk mengganti/menambah lampiran."}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {field.fieldType === "photo" && (
                                <>
                                  <input
                                    ref={cameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleUploadAttachment(field, f);
                                      e.target.value = "";
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-8"
                                    disabled={isBusy}
                                    onClick={() => cameraInputRef.current?.click()}
                                  >
                                    {isBusy ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <Camera className="size-3.5" />
                                    )}
                                    Ambil Foto
                                  </Button>
                                </>
                              )}
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept={field.fieldType === "photo" ? "image/*" : undefined}
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleUploadAttachment(field, f);
                                  e.target.value = "";
                                }}
                              />
                              <Button
                                size="sm"
                                variant={field.fieldType === "photo" ? "outline" : "default"}
                                className="h-8"
                                disabled={isBusy}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                {isBusy ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Upload className="size-3.5" />
                                )}
                                {field.fieldType === "photo" ? "Upload Foto" : "Upload Berkas"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                disabled={isBusy}
                                onClick={() => setEditingFieldId(null)}
                              >
                                Batal
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-8"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={isBusy}
                              onClick={() => void saveDirectEdit(field)}
                            >
                              {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Simpan"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              disabled={isBusy}
                              onClick={() => setEditingFieldId(null)}
                            >
                              Batal
                            </Button>
                          </div>
                        )
                      ) : field.fieldType === "repeat_table" ? (
                        <TestCallTableView field={field} photoAttachments={docPhotoAttachments} />
                      ) : hasAttachments && field.attachments && field.attachments.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {field.attachments.map((att) => (
                            <div key={att.id} className="group relative">
                              {att.mimeType.startsWith("image/") ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const imageAttachments = field.attachments!.filter((a) =>
                                      a.mimeType.startsWith("image/"),
                                    );
                                    setLightbox({
                                      items: imageAttachments.map((a) => ({
                                        id: a.id,
                                        url: `/api/proxy/tasks/attachments/${a.id}/file`,
                                        alt: a.originalName,
                                      })),
                                      startIndex: imageAttachments.findIndex((a) => a.id === att.id),
                                    });
                                  }}
                                >
                                  <Image
                                    src={`/api/proxy/tasks/attachments/${att.id}/file`}
                                    alt={att.originalName}
                                    width={80}
                                    height={80}
                                    unoptimized
                                    className="size-20 rounded-md border object-cover"
                                  />
                                </button>
                              ) : (
                                <a
                                  href={`/api/proxy/tasks/attachments/${att.id}/file`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border p-1 text-center text-[10px] text-muted-foreground hover:bg-muted"
                                >
                                  <FileText className="size-5 shrink-0" />
                                  <span className="line-clamp-2 break-all">{att.originalName}</span>
                                </a>
                              )}
                              {!isFinal && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteAttachment(field, att)}
                                  className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                                  aria-label="Hapus lampiran"
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {Icon && <Icon className="size-4 shrink-0" />}
                          <span>{hasAttachments ? "Belum ada lampiran" : field.value || "—"}</span>
                        </div>
                      )}

                      {field.reviewStatus === "rejected" && field.rejectComment && (
                        <p className="text-xs text-destructive">
                          Komentar reviewer: {field.rejectComment}
                        </p>
                      )}

                      {/* Kontrol revisi + approve/reject digabung di baris bawah field ini */}
                      {!isFinal && !isEditing && (
                        <div className="flex items-center gap-2 pt-1">
                          {isRejectingThis ? (
                            <div className="flex w-full flex-col gap-2">
                              <Textarea
                                placeholder="Alasan reject (wajib diisi)…"
                                value={rejectComment}
                                onChange={(e) => setRejectComment(e.target.value)}
                                className="min-h-16 text-sm"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isBusy}
                                  onClick={() => void submitReject(field)}
                                >
                                  {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Kirim Reject"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={isBusy}
                                  onClick={() => setRejectingFieldId(null)}
                                >
                                  Batal
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={field.reviewStatus === "approved" || isBusy}
                                onClick={() => void handleApprove(field)}
                              >
                                {isBusy ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <ThumbsUp className="size-3.5" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                disabled={field.reviewStatus === "rejected" || isBusy}
                                onClick={() => openReject(field)}
                              >
                                <ThumbsDown className="size-3.5" />
                                Reject
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="ml-auto size-8"
                                disabled={isBusy}
                                onClick={() => openEdit(field)}
                                aria-label="Revisi langsung"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={reopenOpen} onOpenChange={(open) => { setReopenOpen(open); if (!open) setReopenReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buka kembali task ini?</DialogTitle>
            <DialogDescription>
              Task akan kembali ke status <strong>in_progress</strong> — teknisi dan reviewer bisa
              mengedit isian dan menambah lampiran lagi. Isian yang sudah approved tetap approved,
              jadi tidak perlu di-review ulang kecuali memang diedit. Alasan wajib diisi untuk jejak
              audit.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Contoh: teknisi lupa lampirkan foto SN perangkat."
            className="min-h-24"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={busyAction === "reopen"}>
              Batal
            </Button>
            <Button onClick={() => void handleReopen()} disabled={busyAction === "reopen" || !reopenReason.trim()}>
              {busyAction === "reopen" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Buka Kembali
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightbox && (
        <AttachmentLightbox
          items={lightbox.items}
          startIndex={lightbox.startIndex}
          open={lightbox !== null}
          onOpenChange={(open) => !open && setLightbox(null)}
        />
      )}
    </>
  );
}

interface TableColumnDef {
  key: string;
  label: string;
  group?: boolean;
  filter?: boolean;
}

/**
 * Tampilan read-only tabel test-call untuk reviewer, dengan filter Sector/Cell.
 * Remark dihitung otomatis (Pass/Fail) dari DL Tput vs target scenario.
 */
function TestCallTableView({ field, photoAttachments = [] }: { field: ReviewField; photoAttachments?: ReviewAttachment[] }) {
  const opts = (field.options ?? {}) as {
    columns?: TableColumnDef[];
    remarkRules?: { scenario: string; minDl: number }[];
    defaultRows?: Record<string, string>[];
    photoSlots?: { key: string; label: string }[];
  };
  const columns = opts.columns ?? [];
  const remarkRules = opts.remarkRules ?? [];
  const photoSlots = opts.photoSlots ?? [
    { key: "speedtest", label: "SPEEDTEST" },
    { key: "youtube", label: "YOUTUBE/DETIK" },
    { key: "location", label: "LOCATION" },
  ];
  const [filter, setFilter] = useState("");

  const rows = useMemo<Record<string, string>[]>(() => {
    if (field.value && field.value.trim().startsWith("[")) {
      try {
        const p = JSON.parse(field.value);
        if (Array.isArray(p)) return p as Record<string, string>[];
      } catch {
        /* ignore */
      }
    }
    return opts.defaultRows ?? [];
  }, [field.value, opts.defaultRows]);

  // Peta rowId -> [attachment per slot].
  const photosByRow = useMemo(() => {
    const map = new Map<string, (ReviewAttachment | null)[]>();
    for (const a of photoAttachments) {
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      const rowId = typeof meta._tcRowId === "string" ? meta._tcRowId : "";
      const slot = Number(meta._tcSlot ?? -1);
      if (!rowId) continue;
      if (!map.has(rowId)) map.set(rowId, Array(photoSlots.length).fill(null));
      const arr = map.get(rowId)!;
      if (slot >= 0 && slot < photoSlots.length) arr[slot] = a;
    }
    return map;
  }, [photoAttachments, photoSlots.length]);

  const filterCol = columns.find((c) => c.filter);
  const scenarioCol = columns.find((c) => c.group);
  const sectorValues = useMemo(() => {
    if (!filterCol) return [];
    return Array.from(new Set(rows.map((r) => r[filterCol.key]).filter(Boolean)));
  }, [rows, filterCol]);

  const computeRemark = (row: Record<string, string>): string => {
    const rule = remarkRules.find((r) => scenarioCol && r.scenario === row[scenarioCol.key]);
    const dl = Number(row.dlTput);
    if (!rule || !row.dlTput || !isFinite(dl)) return "-";
    return dl >= rule.minDl ? "Pass" : "Fail";
  };

  const shown = filter && filterCol ? rows.filter((r) => r[filterCol.key] === filter) : rows;
  const displayCols = columns.filter((c) => c.key !== "remark");
  const scenAbbr = (s: string) => (/(\d+)/.exec(s ?? "")?.[1] ?? s);
  const rowsWithPhotos = shown.filter((r) => (photosByRow.get(String(r._id ?? "")) ?? []).some(Boolean));
  // Ringkasan Pass/Fail untuk memudahkan reviewer.
  const summary = useMemo(() => {
    let pass = 0, fail = 0, empty = 0;
    for (const r of rows) {
      const rk = computeRemark(r);
      if (rk === "Pass") pass++; else if (rk === "Fail") fail++; else empty++;
    }
    return { pass, fail, empty };
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      {/* Ringkasan + filter untuk memudahkan review */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold">Ringkasan:</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">Pass {summary.pass}</span>
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Fail {summary.fail}</span>
          {summary.empty > 0 && <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-500">Belum {summary.empty}</span>}
          <span className="text-muted-foreground">Total {rows.length}</span>
        </div>
        {filterCol && sectorValues.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter {filterCol.label}:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 rounded border bg-background px-2 text-xs"
            >
              <option value="">Semua ({rows.length})</option>
              {sectorValues.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-muted">
              {displayCols.map((c) => (
                <th key={c.key} className="border px-1.5 py-1 text-left font-semibold">{c.label}</th>
              ))}
              <th className="border px-1.5 py-1 text-left font-semibold">Remark</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => {
              const remark = computeRemark(row);
              return (
                <tr key={i} className="odd:bg-background even:bg-muted/30">
                  {displayCols.map((c) => (
                    <td key={c.key} className="border px-1.5 py-1">{row[c.key] ?? ""}</td>
                  ))}
                  <td className={cn("border px-1.5 py-1 font-semibold", remark === "Pass" ? "text-emerald-600" : remark === "Fail" ? "text-destructive" : "text-muted-foreground")}>{remark}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={displayCols.length + 1} className="px-2 py-3 text-center text-muted-foreground">Belum ada data.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Foto per baris (mengikuti filter) — klik untuk buka penuh */}
      {rowsWithPhotos.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-muted-foreground">Dokumentasi Foto ({rowsWithPhotos.length} sektor)</span>
          {rowsWithPhotos.map((row) => {
            const rid = String(row._id ?? "");
            const photos = photosByRow.get(rid) ?? [];
            const remark = computeRemark(row);
            const title = `SCEN${scenAbbr(String(row.scenario ?? ""))}_SEC${row.sectorCell ?? ""} (${row.distance ?? ""}m)`;
            return (
              <div key={rid} className="rounded-md border">
                <div className="flex items-center justify-between border-b bg-muted px-2 py-1">
                  <span className="text-xs font-semibold">{title}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", remark === "Pass" ? "bg-emerald-100 text-emerald-700" : remark === "Fail" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500")}>{remark}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 p-2">
                  {photoSlots.map((ps, slot) => {
                    const att = photos[slot];
                    return (
                      <div key={ps.key} className="flex flex-col gap-1">
                        <span className="text-[9px] font-semibold uppercase text-muted-foreground">{ps.label}</span>
                        {att ? (
                          <a href={`/api/proxy/tasks/attachments/${att.id}/file`} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/proxy/tasks/attachments/${att.id}/file`} alt={ps.label} className="h-28 w-full rounded border object-cover transition hover:opacity-90" />
                          </a>
                        ) : (
                          <div className="flex h-28 items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground">—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

