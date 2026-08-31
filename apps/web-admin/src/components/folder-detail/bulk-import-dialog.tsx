"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OptionItem } from "./assign-task-dialog";

const COL_EMAIL = "Email Teknisi";
const COL_DUE = "Jatuh Tempo (YYYY-MM-DD)";
const COL_SITE = "Kode Site";

interface ParsedRow {
  rowNumber: number;
  teknisiEmail: string;
  dueDate: string;
  siteId: string;
  prefill: Record<string, string>;
}

interface ImportResult {
  rowNumber: number;
  status: "created" | "skipped";
  siteId?: string;
  reason?: string;
}

/**
 * Import massal (PRD 4.3).
 *
 * Validasi sesungguhnya dilakukan server — di sini hanya parsing berkas dan
 * penyajian hasil, supaya aturan tidak terduplikasi di dua tempat dan tidak
 * bisa dilewati lewat request langsung.
 */
export function BulkImportDialog({
  folderId,
  templates,
}: {
  folderId: string;
  templates: Array<OptionItem & { fields?: Array<{ label: string; fieldType: string }> }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const template = templates.find((t) => t.id === templateId);

  function reset() {
    setTemplateId("");
    setRows([]);
    setResults(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function downloadTemplate() {
    if (!template) return;

    // Field detail diambil saat dibutuhkan agar daftar template tetap ringan.
    const res = await fetch(`/api/proxy/templates/${template.id}`);
    if (!res.ok) {
      toast.error("Gagal mengambil struktur template.");
      return;
    }
    const detail = (await res.json()) as { fields: Array<{ label: string; fieldType: string }> };

    const dataFields = detail.fields.filter(
      (f) => f.fieldType !== "section" && !["photo", "file", "signed_document"].includes(f.fieldType),
    );
    const headers = [COL_EMAIL, COL_DUE, COL_SITE, ...dataFields.map((f) => f.label)];

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `import-${template.name.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

        const parsed: ParsedRow[] = raw.map((r, i) => {
          const prefill: Record<string, string> = {};
          for (const [key, val] of Object.entries(r)) {
            if ([COL_EMAIL, COL_DUE, COL_SITE].includes(key)) continue;
            if (val !== "" && val != null) prefill[key] = String(val);
          }

          const due = r[COL_DUE];
          return {
            rowNumber: i + 2, // +2: baris header + indeks 1-basis
            teknisiEmail: String(r[COL_EMAIL] ?? "").trim(),
            dueDate: due instanceof Date ? due.toISOString() : String(due ?? "").trim(),
            siteId: String(r[COL_SITE] ?? "").trim(),
            prefill,
          };
        });

        setRows(parsed);
        setResults(null);
      } catch {
        toast.error("Berkas tidak bisa dibaca. Pastikan formatnya .xlsx atau .csv.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/proxy/tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, templateId, rows }),
      });

      const body = (await res.json().catch(() => null)) as
        | { created: number; skipped: number; results: ImportResult[]; message?: string }
        | null;

      if (!res.ok || !body) {
        toast.error("Import gagal.", { description: body?.message });
        return;
      }

      setResults(body.results);
      toast.success(`${body.created} task dibuat.`, {
        description: body.skipped > 0 ? `${body.skipped} baris dilewati.` : undefined,
      });
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  const shown = results ?? rows.map((r) => ({ rowNumber: r.rowNumber, status: "created" as const, siteId: r.siteId }));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileSpreadsheet className="size-4" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Massal via Excel</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>1. Pilih Template</Label>
            <Select
              value={templateId}
              onValueChange={(v) => {
                setTemplateId(v);
                setRows([]);
                setResults(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih template sumber…" />
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

          {template && (
            <div className="flex flex-col gap-2">
              <Label>2. Download Template, Isi, lalu Upload</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void downloadTemplate()}>
                  <Download className="size-4" />
                  Download Template Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4" />
                  Upload File
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Kolom wajib: <strong>{COL_EMAIL}</strong> dan <strong>{COL_DUE}</strong>. Kolom
                data lain opsional — mengisinya berarti teknisi tinggal melengkapi foto di lapangan.
              </p>
            </div>
          )}

          {shown.length > 0 && (
            <div className="flex flex-col gap-2">
              {results && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge className="gap-1 bg-[oklch(0.7_0.15_160_/_0.18)] text-[oklch(0.35_0.12_160)] hover:bg-[oklch(0.7_0.15_160_/_0.18)]">
                    <CheckCircle2 className="size-3" />
                    {results.filter((r) => r.status === "created").length} dibuat
                  </Badge>
                  {results.some((r) => r.status === "skipped") && (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="size-3" />
                      {results.filter((r) => r.status === "skipped").length} dilewati
                    </Badge>
                  )}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Baris</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>{results ? "Hasil" : "Email Teknisi"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((r, i) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell>{r.rowNumber}</TableCell>
                        <TableCell>{r.siteId || "—"}</TableCell>
                        <TableCell>
                          {results ? (
                            r.status === "created" ? (
                              <Badge className="gap-1 bg-[oklch(0.7_0.15_160_/_0.18)] text-[oklch(0.35_0.12_160)] hover:bg-[oklch(0.7_0.15_160_/_0.18)]">
                                <CheckCircle2 className="size-3" /> Dibuat
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="size-3" /> {r.reason}
                              </Badge>
                            )
                          ) : (
                            rows[i]?.teknisiEmail || "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {results ? "Tutup" : "Batal"}
          </Button>
          {!results && (
            <Button onClick={() => void submit()} disabled={busy || rows.length === 0}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Memproses…" : `Buat ${rows.length || ""} Task`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
