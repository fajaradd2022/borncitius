"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { BLOCK_TYPE_LABEL, type LayoutBlock, type TaskTemplate } from "@/lib/types";

const ATTACHMENT_TYPES = ["photo", "file", "signed_document"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function BlockPropertiesPanel({
  block,
  sourceTemplate,
  onUpdate,
}: {
  block: LayoutBlock | null;
  sourceTemplate: TaskTemplate;
  onUpdate: (patch: Partial<LayoutBlock>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!block) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Klik salah satu blok di kanvas untuk mengatur propertinya, atau tambahkan blok baru
            dari toolbar &quot;Sisipkan&quot;.
          </p>
        </CardContent>
      </Card>
    );
  }

  const dataFields = sourceTemplate.fields.filter(
    (f) => f.fieldType !== "section" && !ATTACHMENT_TYPES.includes(f.fieldType)
  );
  const photoFields = sourceTemplate.fields.filter((f) => f.fieldType === "photo");
  const signedFields = sourceTemplate.fields.filter((f) => f.fieldType === "signed_document");

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpdate({ imageUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{BLOCK_TYPE_LABEL[block.type]}</span>
        </div>

        <Row label="Nama Blok (internal)">
          <Input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} />
        </Row>

        {block.type === "text" && (
          <Row label="Isi Teks">
            <Textarea
              value={block.content ?? ""}
              onChange={(e) => onUpdate({ content: e.target.value })}
              className="min-h-24"
              placeholder="Ketik teks yang muncul di dokumen…"
            />
          </Row>
        )}

        {block.type === "image" && (
          <>
            <Row label="Gambar / Logo">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4" />
                  Upload Gambar
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            </Row>
            <Row label="Lebar (px)">
              <Input
                type="number"
                value={block.imageWidth ?? 120}
                onChange={(e) => onUpdate({ imageWidth: Number(e.target.value) })}
              />
            </Row>
          </>
        )}

        {block.type === "field" && (
          <>
            <Row label="Sumber Field">
              <Select
                value={block.sourceFieldId ?? ""}
                onValueChange={(v) => {
                  const f = sourceTemplate.fields.find((x) => x.id === v);
                  onUpdate({ sourceFieldId: v, label: f?.label ?? block.label });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih field…" />
                </SelectTrigger>
                <SelectContent>
                  {dataFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Gaya Tampilan">
              <Select
                value={block.displayStyle ?? "stacked"}
                onValueChange={(v) => onUpdate({ displayStyle: v as LayoutBlock["displayStyle"] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stacked">Bertumpuk (label di atas)</SelectItem>
                  <SelectItem value="table-row">Baris tabel (label kiri, nilai kanan)</SelectItem>
                  <SelectItem value="inline">Sebaris (label: nilai)</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </>
        )}

        {block.type === "field-grid" && (
          <>
            <Row label="Jumlah Kolom">
              <Select
                value={String(block.gridColumns ?? 2)}
                onValueChange={(v) => onUpdate({ gridColumns: Number(v) as 1 | 2 })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 kolom</SelectItem>
                  <SelectItem value="2">2 kolom</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Field yang Ditampilkan">
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border p-2">
                {dataFields.map((f) => {
                  const checked = (block.fieldIds ?? []).includes(f.id);
                  return (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const current = block.fieldIds ?? [];
                          onUpdate({
                            fieldIds: v ? [...current, f.id] : current.filter((x) => x !== f.id),
                          });
                        }}
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </Row>
          </>
        )}

        {block.type === "table" && (
          <>
            <Row label="Header Kolom (pisahkan dengan koma)">
              <Textarea
                value={(block.columns ?? []).map((c) => c.header).join(", ")}
                onChange={(e) => {
                  const headers = e.target.value.split(",").map((s) => s.trim());
                  onUpdate({
                    columns: headers.map((h, i) => ({
                      id: block.columns?.[i]?.id ?? `col-${i}-${Date.now()}`,
                      header: h,
                      width: block.columns?.[i]?.width,
                    })),
                  });
                }}
                className="min-h-16"
                placeholder="No, Nama Barang, Merk, Jumlah, Serial No."
              />
            </Row>
            <Row label="Baris Kosong Tambahan">
              <Input
                type="number"
                min={0}
                value={block.emptyRows ?? 0}
                onChange={(e) => onUpdate({ emptyRows: Number(e.target.value) })}
              />
            </Row>
            <div className="flex gap-2">
              <Row label="Warna Header">
                <Input
                  type="color"
                  value={block.headerBgColor ?? "#1e3a5f"}
                  onChange={(e) => onUpdate({ headerBgColor: e.target.value })}
                  className="h-9 w-20 p-1"
                />
              </Row>
              <Row label="Warna Teks Header">
                <Input
                  type="color"
                  value={block.headerTextColor ?? "#ffffff"}
                  onChange={(e) => onUpdate({ headerTextColor: e.target.value })}
                  className="h-9 w-20 p-1"
                />
              </Row>
            </div>
          </>
        )}

        {block.type === "photo-page" && (
          <>
            <Row label="Sumber Foto">
              <Select
                value={block.sourceFieldId ?? ""}
                onValueChange={(v) => {
                  const f = sourceTemplate.fields.find((x) => x.id === v);
                  onUpdate({ sourceFieldId: v, caption: block.caption || f?.label });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih field foto…" />
                </SelectTrigger>
                <SelectContent>
                  {photoFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Caption Foto">
              <Input
                value={block.caption ?? ""}
                onChange={(e) => onUpdate({ caption: e.target.value })}
                placeholder="mis. Posisi Perangkat Fortigate FG40F"
              />
            </Row>
            <Row label="Posisi Caption">
              <Select
                value={block.captionPosition ?? "below"}
                onValueChange={(v) => onUpdate({ captionPosition: v as "above" | "below" })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="below">Di bawah foto</SelectItem>
                  <SelectItem value="above">Di atas foto</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Tampilkan Header Halaman</Label>
              <Switch
                checked={block.pageHeader?.show ?? false}
                onCheckedChange={(v) =>
                  onUpdate({
                    pageHeader: {
                      show: v,
                      leftText: block.pageHeader?.leftText ?? "Nama Store / Kode Store",
                      rightText: block.pageHeader?.rightText ?? "BERITA ACARA INSTALASI",
                    },
                  })
                }
              />
            </div>
            {block.pageHeader?.show && (
              <>
                <Row label="Header Kiri">
                  <Input
                    value={block.pageHeader.leftText}
                    onChange={(e) =>
                      onUpdate({ pageHeader: { ...block.pageHeader!, leftText: e.target.value } })
                    }
                  />
                </Row>
                <Row label="Header Kanan">
                  <Input
                    value={block.pageHeader.rightText}
                    onChange={(e) =>
                      onUpdate({ pageHeader: { ...block.pageHeader!, rightText: e.target.value } })
                    }
                  />
                </Row>
              </>
            )}

            <Row label="Catatan Halaman (opsional)">
              <Input
                value={block.noteText ?? ""}
                onChange={(e) => onUpdate({ noteText: e.target.value })}
                placeholder="mis. LAMPIRAN FOTO (WAJIB DENGAN GEOTAGGING)"
              />
            </Row>
            {block.noteText && (
              <Row label="Posisi Catatan">
                <Select
                  value={block.notePosition ?? "above"}
                  onValueChange={(v) => onUpdate({ notePosition: v as "above" | "below" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Di atas foto</SelectItem>
                    <SelectItem value="below">Di bawah foto</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            )}
          </>
        )}

        {block.type === "attachment" && (
          <>
            <Row label="Sumber Dokumen Scan">
              <Select
                value={block.sourceFieldId ?? ""}
                onValueChange={(v) => onUpdate({ sourceFieldId: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih field dokumen…" />
                </SelectTrigger>
                <SelectContent>
                  {signedFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <p className="text-xs text-muted-foreground">
              Halaman hasil scan yang di-upload teknisi akan digabung (merge) tepat di posisi blok
              ini. Geser blok ke paling atas bila dokumen customer harus jadi halaman pertama.
            </p>
          </>
        )}

        {block.type === "header" && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Tampilkan Logo</Label>
              <Switch
                checked={block.showLogo ?? false}
                onCheckedChange={(v) => onUpdate({ showLogo: v })}
              />
            </div>
            <Row label="Nama Perusahaan">
              <Input
                value={block.companyName ?? ""}
                onChange={(e) => onUpdate({ companyName: e.target.value })}
              />
            </Row>
            <Row label="Judul Laporan">
              <Input
                value={block.reportTitle ?? ""}
                onChange={(e) => onUpdate({ reportTitle: e.target.value })}
              />
            </Row>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Tampilkan Nomor Referensi</Label>
              <Switch
                checked={block.showReferenceNumber ?? false}
                onCheckedChange={(v) => onUpdate({ showReferenceNumber: v })}
              />
            </div>
          </>
        )}

        {block.type === "footer" && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Tampilkan Nomor Halaman</Label>
              <Switch
                checked={block.showPageNumber ?? false}
                onCheckedChange={(v) => onUpdate({ showPageNumber: v })}
              />
            </div>
            <Row label="Catatan Footer">
              <Textarea
                value={block.footerNote ?? ""}
                onChange={(e) => onUpdate({ footerNote: e.target.value })}
                className="min-h-16"
              />
            </Row>
          </>
        )}

        {block.type === "page-break" && (
          <p className="text-xs text-muted-foreground">
            Blok ini memaksa konten setelahnya dimulai di halaman baru saat dokumen di-generate.
            Tidak ada properti yang perlu diatur.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
