"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, FileUp, Loader2, MapPin, Send, X } from "lucide-react";
import { PhotoField } from "./photo-field";
import { RepeatTableField, type TableColumn, type RemarkRule } from "./repeat-table-field";
import { SyncIndicator } from "./sync-indicator";
import { AttachmentLightbox, type LightboxItem } from "./ui/attachment-lightbox";
import { drainQueue, enqueue, itemsForTask } from "@/lib/offline-queue";
import { getPosition } from "@/lib/watermark";

export interface FormAttachment {
  id: string;
  originalName: string;
  mimeType: string;
}

export interface FormField {
  id: string;
  label: string;
  fieldType: string;
  section: string;
  isRequired: boolean;
  value: string | null;
  options?: unknown;
  reviewStatus: "pending" | "approved" | "rejected";
  rejectComment?: string | null;
  attachments: FormAttachment[];
}

export interface FormTask {
  id: string;
  status: string;
  siteId: string | null;
  templateName: string;
  folderName: string;
  fields: FormField[];
}

const ATTACHMENT_TYPES = ["photo", "file", "signed_document"];

/** Parse nilai repeat_table (string JSON) → array baris; fallback ke defaultRows. */
function parseRows(value: string | null, options: unknown): Record<string, string>[] {
  if (value && value.trim().startsWith("[")) {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p as Record<string, string>[];
    } catch {
      /* abaikan */
    }
  }
  const opts = options as Record<string, unknown> | null;
  const def = opts?.defaultRows;
  return Array.isArray(def) ? (def as Record<string, string>[]) : [];
}

export function TaskForm({ task }: { task: FormTask }) {
  const router = useRouter();
  // Nama task ditampilkan sebagai baris ke-3 watermark foto (bukan nama
  // teknisi) — sama persis dengan yang dipakai di header halaman ini.
  const taskName = task.siteId ?? task.id.slice(0, 8);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(task.fields.map((f) => [f.id, f.value ?? ""])),
  );
  const [submitting, setSubmitting] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const isRevision = task.status === "rejected";

  /**
   * Isian disimpan ke antrian offline setelah jeda mengetik, bukan tiap ketukan
   * — supaya tidak membanjiri IndexedDB dan jaringan.
   */
  const saveField = useCallback((fieldId: string, value: string) => {
    const existing = timers.current.get(fieldId);
    if (existing) clearTimeout(existing);

    timers.current.set(
      fieldId,
      setTimeout(() => {
        void enqueue({ kind: "field-value", taskId: task.id, fieldId, value }).then(() =>
          drainQueue(),
        );
        timers.current.delete(fieldId);
      }, 700),
    );
  }, [task.id]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
    };
  }, []);

  async function fillGps(fieldId: string) {
    toast.info("Mengambil lokasi…");
    const gps = await getPosition();
    setValues((v) => ({ ...v, [fieldId]: gps }));
    saveField(fieldId, gps);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Pastikan semua isian & foto terkirim lebih dulu; submit dengan antrian
      // yang belum kosong akan ditolak server sebagai "field wajib kosong".
      //
      // drainQueue() bisa saja sedang dijalankan oleh trigger lain (mis. auto-save
      // field yang baru saja diketik) saat kita memanggilnya di sini — panggilan
      // itu langsung pulang dengan {sent:0,failed:0} tanpa benar-benar mengirim
      // apa pun (lihat drainQueue's single-flight guard). Karena itu `failed === 0`
      // saja tidak cukup dipercaya; kita cek ulang isi antrian task ini secara
      // langsung, dan retry drain beberapa kali sampai benar-benar kosong.
      let failed = 0;
      let stillQueued = await itemsForTask(task.id);
      for (let attempt = 0; stillQueued.length > 0 && attempt < 5; attempt++) {
        const result = await drainQueue();
        failed = result.failed;
        stillQueued = await itemsForTask(task.id);
        if (stillQueued.length > 0) await new Promise((r) => setTimeout(r, 400));
      }

      if (failed > 0 || stillQueued.length > 0) {
        toast.error("Sebagian data belum terkirim.", {
          description: "Periksa koneksi Anda, lalu coba submit lagi.",
        });
        return;
      }

      const res = await fetch(`/api/proxy/tasks/${task.id}/submit`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;

      if (!res.ok) {
        toast.error("Belum bisa disubmit.", { description: body?.message });
        return;
      }

      toast.success("Tugas berhasil dikirim.", { description: "Menunggu review admin." });
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Gagal mengirim. Periksa koneksi Anda.");
    } finally {
      setSubmitting(false);
    }
  }

  const sections = new Map<string, FormField[]>();
  for (const f of task.fields) {
    if (f.fieldType === "section") continue;
    const list = sections.get(f.section) ?? [];
    list.push(f);
    sections.set(f.section, list);
  }

  return (
    <main className="flex min-h-dvh flex-col pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Kembali"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg active:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold">{task.siteId ?? task.id.slice(0, 8)}</h1>
          <p className="truncate text-xs text-zinc-500">{task.templateName}</p>
        </div>
        <SyncIndicator />
      </header>

      {isRevision && (
        <div className="mx-4 mt-4 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
          <p className="font-semibold text-danger">Tugas dikembalikan untuk revisi</p>
          <p className="mt-0.5 text-zinc-600">
            Perbaiki hanya bagian yang ditandai merah. Bagian yang sudah disetujui terkunci.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5 p-4">
        {Array.from(sections.entries()).map(([section, fields]) => (
          <section key={section} className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {section}
            </h2>

            {fields.map((field) => {
              const locked = isRevision && field.reviewStatus === "approved";
              const rejected = field.reviewStatus === "rejected";

              return (
                <div
                  key={field.id}
                  className={`flex flex-col gap-2 rounded-xl border p-3 ${
                    rejected ? "border-danger/50 bg-danger/5" : "border-border"
                  } ${locked ? "opacity-60" : ""}`}
                >
                  {rejected && field.rejectComment && (
                    <p className="text-xs font-medium text-danger">
                      Catatan reviewer: {field.rejectComment}
                    </p>
                  )}

                  {field.fieldType === "repeat_table" ? (
                    <RepeatTableField
                      label={field.label + (field.isRequired ? " *" : "")}
                      columns={(((field.options as Record<string, unknown>)?.columns) as TableColumn[]) ?? []}
                      remarkRules={(((field.options as Record<string, unknown>)?.remarkRules) as RemarkRule[]) ?? []}
                      initialRows={parseRows(field.value, field.options)}
                      locked={locked}
                      onSave={(rows) => {
                        const json = JSON.stringify(rows);
                        setValues((v) => ({ ...v, [field.id]: json }));
                        saveField(field.id, json);
                      }}
                    />
                  ) : ATTACHMENT_TYPES.includes(field.fieldType) ? (
                    field.fieldType === "photo" ? (
                      <PhotoField
                        taskId={task.id}
                        fieldId={field.id}
                        label={field.label + (field.isRequired ? " *" : "")}
                        taskName={taskName}
                        existingAttachments={field.attachments}
                        locked={locked}
                      />
                    ) : (
                      <SignedDocField
                        taskId={task.id}
                        fieldId={field.id}
                        label={field.label + (field.isRequired ? " *" : "")}
                        existingAttachments={field.attachments}
                        locked={locked}
                      />
                    )
                  ) : (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">
                        {field.label}
                        {field.isRequired && <span className="text-danger"> *</span>}
                      </span>

                      {field.fieldType === "gps" ? (
                        <div className="flex gap-2">
                          <input
                            value={values[field.id] ?? ""}
                            readOnly
                            placeholder="Belum diambil"
                            className="h-12 flex-1 rounded-xl border border-border bg-muted px-3"
                          />
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => void fillGps(field.id)}
                            className="flex h-12 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            <MapPin className="size-4" />
                            Ambil
                          </button>
                        </div>
                      ) : field.fieldType === "textarea" ? (
                        <textarea
                          value={values[field.id] ?? ""}
                          disabled={locked}
                          onChange={(e) => {
                            setValues((v) => ({ ...v, [field.id]: e.target.value }));
                            saveField(field.id, e.target.value);
                          }}
                          rows={3}
                          className="rounded-xl border border-border p-3 outline-none focus:border-primary disabled:bg-muted"
                        />
                      ) : (
                        <input
                          type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
                          value={values[field.id] ?? ""}
                          disabled={locked}
                          onChange={(e) => {
                            setValues((v) => ({ ...v, [field.id]: e.target.value }));
                            saveField(field.id, e.target.value);
                          }}
                          className="h-12 rounded-xl border border-border px-3 outline-none focus:border-primary disabled:bg-muted"
                        />
                      )}
                    </label>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-white active:opacity-90 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          {submitting ? "Mengirim…" : "Submit Tugas"}
        </button>
      </div>
    </main>
  );
}

function SignedDocField({
  taskId,
  fieldId,
  label,
  existingAttachments,
  locked,
}: {
  taskId: string;
  fieldId: string;
  label: string;
  existingAttachments: FormAttachment[];
  locked?: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  // Preview lokal (object URL) supaya dokumen langsung terlihat begitu
  // diunggah — sama seperti fix di PhotoField, hindari harus refresh-refresh
  // dulu baru muncul.
  const [localPreviews, setLocalPreviews] = useState<{ objectUrl: string; fileName: string }[]>([]);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; startIndex: number } | null>(null);

  useEffect(() => {
    return () => {
      localPreviews.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(att: FormAttachment) {
    if (!window.confirm(`Hapus "${att.originalName}"? Tindakan ini permanen.`)) return;
    try {
      const res = await fetch(`/api/proxy/tasks/${taskId}/fields/${fieldId}/attachments/${att.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menghapus berkas.", { description: body?.error });
        return;
      }
      toast.success("Berkas dihapus.");
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {existingAttachments.length + localPreviews.length > 0 && (
          <span className="text-xs font-medium text-success">
            {existingAttachments.length + localPreviews.length} berkas
          </span>
        )}
      </div>

      {existingAttachments.length + localPreviews.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {existingAttachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <FileText className="size-4 shrink-0 text-zinc-400" />
              {att.mimeType.startsWith("image/") ? (
                <button
                  type="button"
                  onClick={() => {
                    const imageAttachments = existingAttachments.filter((a) =>
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
                  className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
                >
                  {att.originalName}
                </button>
              ) : (
                <a
                  href={`/api/proxy/tasks/attachments/${att.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
                >
                  {att.originalName}
                </a>
              )}
              {!locked && (
                <button
                  type="button"
                  onClick={() => void handleDelete(att)}
                  aria-label="Hapus berkas"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-danger active:bg-danger/10"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          {localPreviews.map((p) => (
            <a
              key={p.objectUrl}
              href={p.objectUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <FileText className="size-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
                {p.fileName}
              </span>
            </a>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={locked}
        onClick={() => ref.current?.click()}
        className="flex h-14 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold active:bg-muted disabled:opacity-60"
      >
        <FileUp className="size-5" />
        Upload Scan Dokumen
      </button>
      <p className="text-xs text-zinc-400">
        Foto atau PDF hasil scan dokumen yang sudah ditandatangani. Boleh lebih dari satu.
      </p>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setLocalPreviews((prev) => [...prev, { objectUrl: URL.createObjectURL(f), fileName: f.name }]);
          await enqueue({
            kind: "attachment",
            taskId,
            fieldId,
            blob: f,
            fileName: f.name,
            attachmentType: "signed_document",
          });
          toast.success("Dokumen disimpan.", { description: "Akan terkirim saat ada koneksi." });
          void drainQueue();
        }}
      />

      {lightbox && (
        <AttachmentLightbox
          items={lightbox.items}
          startIndex={lightbox.startIndex}
          open={lightbox !== null}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
