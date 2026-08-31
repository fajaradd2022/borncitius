"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Check, Loader2, Send, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { LayoutBlock, TaskTemplate } from "@/lib/types";
import { BLOCK_TYPE_LABEL } from "@/lib/types";

interface Suggestion {
  blocks: LayoutBlock[];
  notes: string;
  skipped: number;
  source: "chat" | "extract";
}

/**
 * Panel AI untuk menyusun layout.
 *
 * Hasil AI tidak pernah langsung mengubah kanvas — selalu ditampilkan sebagai
 * usulan yang harus disetujui admin, dan bisa dibatalkan setelah diterapkan.
 */
export function LayoutAiPanel({
  sourceTemplate,
  currentBlocks,
  onApply,
  onUndo,
  canUndo,
}: {
  sourceTemplate: TaskTemplate;
  currentBlocks: LayoutBlock[];
  onApply: (blocks: LayoutBlock[]) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "chat" | "extract">(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readError(res: Response): Promise<string> {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? `Permintaan gagal (HTTP ${res.status}).`;
  }

  async function sendChat() {
    const text = instruction.trim();
    if (!text) {
      toast.error("Tulis instruksi terlebih dahulu.");
      return;
    }

    setBusy("chat");
    try {
      const res = await fetch("/api/layout-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: sourceTemplate.id,
          instruction: text,
          currentBlocks,
          sessionId,
        }),
      });

      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }

      const data = (await res.json()) as {
        blocks: LayoutBlock[];
        notes: string;
        skipped: number;
        sessionId: string | null;
      };
      setSessionId(data.sessionId);
      setSuggestion({ ...data, source: "chat" });
      setInstruction("");
    } catch {
      toast.error("Tidak bisa menghubungi layanan AI.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadExample(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy("extract");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("templateId", sourceTemplate.id);

      const res = await fetch("/api/layout-ai/extract", { method: "POST", body });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }

      const data = (await res.json()) as { blocks: LayoutBlock[]; notes: string; skipped: number };
      setSuggestion({ ...data, source: "extract" });
    } catch {
      toast.error("Tidak bisa menghubungi layanan AI.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    onApply(suggestion.blocks);
    toast.success(`${suggestion.blocks.length} blok diterapkan ke kanvas.`);
    setSuggestion(null);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <span className="text-sm font-medium">Asisten Layout</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Impor dari Contoh Customer</Label>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {busy === "extract" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {busy === "extract" ? "Menganalisis dokumen…" : "Upload PDF / Gambar"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={uploadExample}
          />
          <p className="text-xs text-muted-foreground">
            AI membaca struktur halaman contoh laporan, lalu menyusunnya jadi blok layout.
            Analisis dokumen panjang bisa memakan waktu hingga satu menit.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 border-t pt-4">
          <Label className="text-xs text-muted-foreground">Instruksi</Label>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="mis. taruh lampiran scan di paling depan, lalu buat halaman foto untuk tiap field foto"
            className="min-h-20 text-sm"
            disabled={busy !== null}
          />
          <Button size="sm" onClick={sendChat} disabled={busy !== null}>
            {busy === "chat" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {busy === "chat" ? "Memproses…" : "Kirim"}
          </Button>
        </div>

        {suggestion && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Usulan AI</span>
              <Badge variant="secondary">{suggestion.blocks.length} blok</Badge>
            </div>

            {suggestion.skipped > 0 && (
              <p className="text-xs text-destructive">
                {suggestion.skipped} usulan dilewati karena tidak cocok dengan field template.
              </p>
            )}

            <ul className="max-h-48 overflow-y-auto text-xs text-muted-foreground">
              {suggestion.blocks.map((b, i) => (
                <li key={b.id} className="truncate py-0.5">
                  {i + 1}. [{BLOCK_TYPE_LABEL[b.type]}] {b.caption ?? b.label}
                </li>
              ))}
            </ul>

            {suggestion.notes && (
              <p className="border-t pt-2 text-xs text-muted-foreground">{suggestion.notes}</p>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={applySuggestion}>
                <Check className="size-4" />
                Terapkan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                <X className="size-4" />
                Abaikan
              </Button>
            </div>
          </div>
        )}

        {canUndo && (
          <Button size="sm" variant="outline" onClick={onUndo}>
            Batalkan Perubahan Terakhir
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
