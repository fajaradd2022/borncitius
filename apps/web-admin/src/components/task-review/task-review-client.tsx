"use client";

import { useMemo, useState } from "react";
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
}

export interface ReviewField {
  id: string;
  label: string;
  fieldType: FieldType;
  section: string;
  orderIndex: number;
  isRequired: boolean;
  value: string | null;
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
