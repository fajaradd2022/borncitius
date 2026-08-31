import type { LayoutBlock, LayoutBlockType } from "@/lib/types";

/**
 * Penerjemah bentuk data layout antara API dan builder.
 *
 * Database menyimpan properti spesifik-tipe di kolom `config` (JSON) agar
 * skema tidak membengkak, sementara builder bekerja dengan objek datar.
 * Konversi dipusatkan di sini supaya tidak tersebar di banyak komponen.
 */

export interface ApiLayoutBlock {
  id: string;
  type: string;
  label: string;
  sourceFieldId: string | null;
  displayStyle: string | null;
  orderIndex: number;
  textStyle: Record<string, unknown> | null;
  border: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
}

export interface ApiLayout {
  id: string;
  name: string;
  isDefault: boolean;
  sourceTemplate: { id: string; name: string };
  blocks: ApiLayoutBlock[];
}

/** Kolom `type` di database memakai garis bawah; builder memakai tanda hubung. */
const TO_UI: Record<string, LayoutBlockType> = {
  field_grid: "field-grid",
  photo_page: "photo-page",
  page_break: "page-break",
};

/** Properti yang disimpan di dalam kolom `config`. */
const CONFIG_KEYS = [
  "content", "imageUrl", "imageWidth", "fieldIds", "gridColumns",
  "tableMode", "columns", "rows", "emptyRows", "headerBgColor", "headerTextColor",
  "caption", "captionPosition", "pageHeader", "noteText", "notePosition",
  "showLogo", "companyName", "reportTitle", "showReferenceNumber",
  "showPageNumber", "footerNote",
] as const;

export function toBuilderBlocks(blocks: ApiLayoutBlock[]): LayoutBlock[] {
  return [...blocks]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((b) => ({
      id: b.id,
      type: (TO_UI[b.type] ?? b.type) as LayoutBlockType,
      label: b.label,
      sourceFieldId: b.sourceFieldId ?? undefined,
      displayStyle: (b.displayStyle ?? undefined) as LayoutBlock["displayStyle"],
      textStyle: (b.textStyle ?? undefined) as LayoutBlock["textStyle"],
      border: (b.border ?? undefined) as LayoutBlock["border"],
      ...(b.config ?? {}),
    }));
}

export function toApiBlocks(blocks: LayoutBlock[]) {
  return blocks.map((b, index) => {
    const config: Record<string, unknown> = {};
    for (const key of CONFIG_KEYS) {
      const value = (b as unknown as Record<string, unknown>)[key];
      if (value !== undefined) config[key] = value;
    }

    return {
      type: b.type,
      label: b.label,
      // UUID field template; id sementara dari builder (mis. "ai-…") dibuang
      // agar tidak ditolak validasi UUID di server.
      sourceFieldId: /^[0-9a-f-]{36}$/i.test(b.sourceFieldId ?? "") ? b.sourceFieldId : undefined,
      displayStyle: b.displayStyle,
      orderIndex: index,
      textStyle: b.textStyle,
      border: b.border,
      config: Object.keys(config).length > 0 ? config : undefined,
    };
  });
}
