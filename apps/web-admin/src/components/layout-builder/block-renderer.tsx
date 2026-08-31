"use client";

import { FileSignature, ImageIcon, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BorderStyle, LayoutBlock, TaskTemplate, TextStyle } from "@/lib/types";

// Render visual tiap tipe blok — dipakai sebagai kanvas WYSIWYG di builder.
// Sengaja memakai gaya "kertas" (latar putih, teks hitam) supaya mendekati
// hasil cetak PDF; bukan mengikuti tema aplikasi.

const FONT_SIZE_CLASS: Record<TextStyle["fontSize"], string> = {
  sm: "text-[10px]",
  base: "text-xs",
  lg: "text-sm",
  xl: "text-base",
  "2xl": "text-xl",
};

const ALIGN_CLASS: Record<TextStyle["align"], string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function textClass(style?: TextStyle) {
  if (!style) return "text-xs";
  return cn(
    FONT_SIZE_CLASS[style.fontSize],
    ALIGN_CLASS[style.align],
    style.bold && "font-bold",
    style.italic && "italic"
  );
}

function borderCss(border?: BorderStyle): React.CSSProperties {
  if (!border?.outer) return {};
  return {
    border: `${border.width}px solid ${border.color}`,
  };
}

function innerBorderCss(border?: BorderStyle): React.CSSProperties {
  if (!border?.inner) return {};
  return {
    border: `${border.width}px solid ${border.color}`,
  };
}

export function BlockRenderer({
  block,
  sourceTemplate,
}: {
  block: LayoutBlock;
  sourceTemplate: TaskTemplate;
}) {
  const field = block.sourceFieldId
    ? sourceTemplate.fields.find((f) => f.id === block.sourceFieldId)
    : undefined;
  const exampleValue = field ? `Contoh isian ${field.label}` : "—";

  switch (block.type) {
    case "header":
      return (
        <div className="flex flex-col gap-1 border-b border-gray-300 pb-3">
          {block.showLogo && (
            <div className="mb-1 flex h-8 w-16 items-center justify-center rounded bg-gray-100 text-[9px] font-medium text-gray-500">
              LOGO
            </div>
          )}
          <p className="text-sm font-semibold">{block.companyName || "Nama Perusahaan"}</p>
          <p className="text-xs text-gray-600">{block.reportTitle || "Judul Laporan"}</p>
          {block.showReferenceNumber && (
            <p className="text-[10px] text-gray-400">No. Ref: BC-2026-000123</p>
          )}
        </div>
      );

    case "footer":
      return (
        <div className="flex items-center justify-between border-t border-gray-300 pt-2 text-[10px] text-gray-400">
          <span>{block.footerNote}</span>
          {block.showPageNumber && <span>Halaman 1</span>}
        </div>
      );

    case "text":
      return (
        <p className={cn(textClass(block.textStyle), "whitespace-pre-wrap")} style={{ color: block.textStyle?.color }}>
          {block.content || "(teks kosong — klik untuk mengisi)"}
        </p>
      );

    case "image":
      return (
        <div className={cn("flex", ALIGN_CLASS[block.textStyle?.align ?? "left"] === "text-center" && "justify-center", ALIGN_CLASS[block.textStyle?.align ?? "left"] === "text-right" && "justify-end")}>
          {block.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.imageUrl}
              alt={block.label}
              style={{ width: block.imageWidth ?? 120 }}
              className="object-contain"
            />
          ) : (
            <div
              className="flex items-center justify-center gap-1.5 rounded border border-dashed border-gray-300 bg-gray-50 py-4 text-[10px] text-gray-400"
              style={{ width: block.imageWidth ?? 120 }}
            >
              <ImageIcon className="size-3" />
              Belum ada gambar
            </div>
          )}
        </div>
      );

    case "field": {
      if (block.displayStyle === "table-row") {
        return (
          <div className="flex justify-between border-b border-dashed border-gray-300 pb-1 text-xs">
            <span className="text-gray-500">{block.label}</span>
            <span className="font-medium">{exampleValue}</span>
          </div>
        );
      }
      if (block.displayStyle === "inline") {
        return (
          <p className="text-xs">
            <span className="text-gray-500">{block.label}: </span>
            <span className="font-medium">{exampleValue}</span>
          </p>
        );
      }
      return (
        <div className="flex flex-col text-xs">
          <span className="text-gray-500">{block.label}</span>
          <span className="font-medium">{exampleValue}</span>
        </div>
      );
    }

    case "field-grid": {
      const ids = block.fieldIds ?? [];
      const cols = block.gridColumns ?? 2;
      return (
        <div style={borderCss(block.border)}>
          <div className={cn("grid text-xs", cols === 2 ? "grid-cols-2" : "grid-cols-1")}>
            {ids.length === 0 && (
              <p className="p-2 text-[10px] text-gray-400">
                Belum ada field dipilih — atur di panel properti.
              </p>
            )}
            {ids.map((id) => {
              const f = sourceTemplate.fields.find((x) => x.id === id);
              return (
                <div key={id} className="flex gap-1 p-1.5" style={innerBorderCss(block.border)}>
                  <span className="shrink-0 text-gray-500">{f?.label ?? "—"}</span>
                  <span className="font-medium">: Contoh isian</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case "table": {
      const columns = block.columns ?? [];
      const rows = block.rows ?? [];
      const emptyRows = block.emptyRows ?? 0;
      return (
        <table className="w-full border-collapse text-[10px]" style={borderCss(block.border)}>
          <thead>
            <tr style={{ backgroundColor: block.headerBgColor ?? "#1e3a5f", color: block.headerTextColor ?? "#ffffff" }}>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="px-1.5 py-1 text-center font-semibold"
                  style={{ ...innerBorderCss(block.border), width: c.width ? `${c.width}%` : undefined }}
                >
                  {c.header}
                </th>
              ))}
              {columns.length === 0 && <th className="p-2 text-left font-normal">(tabel tanpa kolom)</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((c, ci) => (
                  <td key={c.id} className="px-1.5 py-1 align-top" style={innerBorderCss(block.border)}>
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {Array.from({ length: emptyRows }).map((_, ri) => (
              <tr key={`empty-${ri}`}>
                {columns.map((c) => (
                  <td key={c.id} className="px-1.5 py-2" style={innerBorderCss(block.border)}>
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case "photo-page": {
      const note = block.noteText && (
        <p className="text-center text-[10px] font-bold">{block.noteText}</p>
      );
      const caption = (
        <div className="px-2 py-1 text-center text-[11px] font-bold" style={innerBorderCss(block.border)}>
          {block.caption || field?.label || "Caption foto"}
        </div>
      );
      return (
        <div className="flex flex-col gap-2">
          {block.pageHeader?.show && (
            <div className="grid grid-cols-[1fr_2fr] text-[10px]" style={borderCss(block.border)}>
              <div className="px-2 py-3 text-center" style={innerBorderCss(block.border)}>
                <p className="font-semibold">{block.pageHeader.leftText || "Nama Store"}</p>
                <p className="mt-1 border-t border-gray-400 pt-1 text-gray-400">&nbsp;</p>
              </div>
              <div className="flex items-center justify-center px-2 py-3 font-bold" style={innerBorderCss(block.border)}>
                {block.pageHeader.rightText || "BERITA ACARA INSTALASI"}
              </div>
            </div>
          )}

          {block.notePosition === "above" && note}
          {block.captionPosition === "above" && caption}

          <div style={borderCss(block.border)} className="flex flex-col">
            <div className="flex aspect-[4/3] items-center justify-center bg-gray-100 text-[10px] text-gray-400">
              <div className="flex flex-col items-center gap-1">
                <ImageIcon className="size-6" />
                Foto dari field: {field?.label ?? "(belum dipilih)"}
              </div>
            </div>
            {block.captionPosition !== "above" && caption}
          </div>

          {block.notePosition === "below" && note}
        </div>
      );
    }

    case "attachment":
      return (
        <div className="flex items-center gap-2 rounded border border-dashed border-gray-400 bg-gray-50 px-3 py-4 text-[11px] text-gray-600">
          <FileSignature className="size-4 shrink-0" />
          <div className="flex flex-col">
            <span className="font-medium">{block.label}</span>
            <span className="text-gray-500">
              Halaman scan dari field &quot;{field?.label ?? "(belum dipilih)"}&quot; digabung otomatis di posisi ini.
            </span>
          </div>
        </div>
      );

    case "page-break":
      return (
        <div className="flex items-center gap-2 py-1 text-[10px] text-gray-400">
          <Scissors className="size-3 shrink-0" />
          <div className="h-px flex-1 border-t border-dashed border-gray-400" />
          <span>Pemisah Halaman</span>
          <div className="h-px flex-1 border-t border-dashed border-gray-400" />
        </div>
      );

    default:
      return null;
  }
}
