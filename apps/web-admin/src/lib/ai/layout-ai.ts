import "server-only";
import type { FieldType, LayoutBlock, LayoutBlockType } from "@/lib/types";
import { DEFAULT_BORDER, DEFAULT_TEXT_STYLE } from "@/lib/types";

/**
 * Klien AI untuk Output Layout.
 *
 * Aplikasi tidak memanggil Claude langsung: permintaan dikirim ke workflow n8n
 * yang meneruskannya ke Claude Bridge di host (tempat credential berada).
 * Modul ini ditandai "server-only" agar tidak pernah ikut ter-bundle ke browser.
 */

/**
 * Kontrak minimal yang dibutuhkan modul ini: hanya identitas template dan
 * daftar field-nya. Sengaja tidak memakai TaskTemplate penuh agar bisa
 * menerima data langsung dari API tanpa memaksa field yang tak terpakai.
 */
export interface TemplateContext {
  id: string;
  name: string;
  fields: Array<{ id: string; label: string; fieldType: string }>;
}

export interface AiBlockSuggestion {
  type?: string;
  label?: string;
  sourceFieldLabel?: string;
  caption?: string;
  content?: string;
  pageHeaderLeft?: string;
  pageHeaderRight?: string;
  note?: string;
}

export interface LayoutAiResult {
  blocks: LayoutBlock[];
  notes: string;
  sessionId: string | null;
  skipped: number;
}

export function isAiConfigured(): boolean {
  return process.env.AI_ENABLED === "true" && Boolean(process.env.AI_N8N_WEBHOOK_URL);
}

const TYPE_ALIASES: Record<string, LayoutBlockType> = {
  text: "text",
  image: "image",
  field: "field",
  field_grid: "field-grid",
  "field-grid": "field-grid",
  table: "table",
  photo_page: "photo-page",
  "photo-page": "photo-page",
  attachment: "attachment",
  page_break: "page-break",
  "page-break": "page-break",
  header: "header",
  footer: "footer",
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `ai-${Date.now().toString(36)}-${counter}`;
}

/**
 * Mengubah usulan AI menjadi LayoutBlock yang valid.
 *
 * Keluaran model tidak pernah dipercaya mentah: tipe blok yang tidak dikenal
 * dibuang dan jumlahnya dilaporkan, dan referensi field dicocokkan ke field
 * yang benar-benar ada di template.
 */
export function normalizeBlocks(
  suggestions: AiBlockSuggestion[],
  template: TemplateContext,
): { blocks: LayoutBlock[]; skipped: number } {
  const byLabel = new Map(template.fields.map((f) => [f.label.toLowerCase().trim(), f]));
  const blocks: LayoutBlock[] = [];
  let skipped = 0;

  for (const s of suggestions) {
    const type = TYPE_ALIASES[String(s.type ?? "").toLowerCase()];
    if (!type) {
      skipped += 1;
      continue;
    }

    const field = s.sourceFieldLabel
      ? byLabel.get(s.sourceFieldLabel.toLowerCase().trim())
      : undefined;

    const block: LayoutBlock = {
      id: nextId(),
      type,
      label: s.label?.slice(0, 200) || field?.label || type,
    };

    switch (type) {
      case "text":
        block.content = (s.content ?? s.caption ?? "").slice(0, 2000);
        block.textStyle = { ...DEFAULT_TEXT_STYLE };
        break;

      case "photo-page": {
        // Blok halaman foto tanpa field foto yang cocok tidak ada gunanya.
        const photo = field?.fieldType === ("photo" as FieldType) ? field : undefined;
        if (!photo) {
          skipped += 1;
          continue;
        }
        block.sourceFieldId = photo.id;
        block.caption = (s.caption ?? photo.label).slice(0, 200);
        block.captionPosition = "below";
        block.border = { ...DEFAULT_BORDER };
        block.pageHeader = {
          show: Boolean(s.pageHeaderLeft || s.pageHeaderRight),
          leftText: (s.pageHeaderLeft ?? "").slice(0, 120),
          rightText: (s.pageHeaderRight ?? "").slice(0, 120),
        };
        if (s.note?.toUpperCase().includes("GEOTAGGING")) {
          block.noteText = "LAMPIRAN FOTO (WAJIB DENGAN GEOTAGGING)";
          block.notePosition = "above";
        }
        break;
      }

      case "attachment": {
        const signed =
          field?.fieldType === "signed_document"
            ? field
            : template.fields.find((f) => f.fieldType === "signed_document");
        if (!signed) {
          skipped += 1;
          continue;
        }
        block.sourceFieldId = signed.id;
        break;
      }

      case "field": {
        if (!field || field.fieldType === "section") {
          skipped += 1;
          continue;
        }
        block.sourceFieldId = field.id;
        block.displayStyle = "stacked";
        break;
      }

      case "table":
        block.tableMode = "static";
        block.columns = [];
        block.rows = [];
        block.border = { ...DEFAULT_BORDER };
        block.headerBgColor = "#1e3a5f";
        block.headerTextColor = "#ffffff";
        break;

      case "header":
        block.showLogo = true;
        block.companyName = "Born Citius";
        block.reportTitle = s.caption?.slice(0, 200) ?? template.name;
        break;

      case "footer":
        block.showPageNumber = true;
        block.footerNote = (s.content ?? "").slice(0, 300);
        break;

      default:
        break;
    }

    blocks.push(block);
  }

  return { blocks, skipped };
}

interface N8nResponse {
  ok?: boolean;
  error?: string;
  blocks?: AiBlockSuggestion[];
  notes?: string;
  sessionId?: string | null;
}

/** Memanggil workflow n8n; error dikembalikan apa adanya, tidak disamarkan. */
export async function callLayoutAi(payload: {
  mode: "chat" | "extract";
  instruction?: string;
  currentBlocks?: LayoutBlock[];
  filePath?: string;
  sessionId?: string | null;
  template: TemplateContext;
}): Promise<LayoutAiResult> {
  const url = process.env.AI_N8N_WEBHOOK_URL;
  if (!url) throw new Error("AI belum dikonfigurasi (AI_N8N_WEBHOOK_URL kosong).");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.AI_TIMEOUT_MS ?? 300_000),
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mode: payload.mode,
        instruction: payload.instruction,
        currentBlocks: payload.currentBlocks ?? [],
        filePath: payload.filePath,
        sessionId: payload.sessionId,
        templateFields: payload.template.fields.map((f) => ({
          label: f.label,
          fieldType: f.fieldType,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Workflow AI membalas HTTP ${res.status}.`);
    }

    const data = (await res.json()) as N8nResponse;
    if (data.ok === false || !Array.isArray(data.blocks)) {
      throw new Error(data.error ?? "Workflow AI tidak mengembalikan blok yang valid.");
    }

    const { blocks, skipped } = normalizeBlocks(data.blocks, payload.template);
    return { blocks, notes: data.notes ?? "", sessionId: data.sessionId ?? null, skipped };
  } finally {
    clearTimeout(timeout);
  }
}
