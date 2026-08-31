"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  FileSignature,
  Grid2x2,
  Image as ImageIcon,
  Italic,
  Rows3,
  Scissors,
  Square,
  SquareDashed,
  Table2,
  Type,
  PanelBottom,
  PanelTop,
  TextCursorInput,
  ImagePlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TEXT_STYLE,
  type LayoutBlock,
  type LayoutBlockType,
  type TextStyle,
} from "@/lib/types";

const INSERT_ITEMS: { type: LayoutBlockType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Teks", icon: Type },
  { type: "image", label: "Gambar", icon: ImagePlus },
  { type: "field", label: "Field", icon: TextCursorInput },
  { type: "field-grid", label: "Grid Field", icon: Grid2x2 },
  { type: "table", label: "Tabel", icon: Table2 },
  { type: "photo-page", label: "Halaman Foto", icon: ImageIcon },
  { type: "attachment", label: "Lampiran Scan", icon: FileSignature },
  { type: "page-break", label: "Pemisah", icon: Scissors },
  { type: "header", label: "Header", icon: PanelTop },
  { type: "footer", label: "Footer", icon: PanelBottom },
];

function RibbonGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-3">
      <div className="flex items-center gap-1">{children}</div>
      <span className="text-center text-[10px] text-muted-foreground">{title}</span>
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Type;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={cn("size-8", active && "ring-1 ring-primary")}
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function LayoutRibbon({
  selected,
  onInsert,
  onUpdateSelected,
  onTableOp,
}: {
  selected: LayoutBlock | null;
  onInsert: (type: LayoutBlockType) => void;
  onUpdateSelected: (patch: Partial<LayoutBlock>) => void;
  onTableOp: (op: "add-row" | "remove-row" | "add-col" | "remove-col") => void;
}) {
  const style = selected?.textStyle ?? DEFAULT_TEXT_STYLE;
  const canFormat = !!selected && ["text", "image", "field"].includes(selected.type);
  const isTable = selected?.type === "table";
  const hasBorder = !!selected && ["table", "field-grid", "photo-page"].includes(selected.type);

  function setStyle(patch: Partial<TextStyle>) {
    onUpdateSelected({ textStyle: { ...style, ...patch } });
  }

  return (
    <div className="sticky top-16 z-10 flex items-stretch gap-0 overflow-x-auto border-b bg-background/95 py-2 backdrop-blur">
      {/* Sisipkan */}
      <RibbonGroup title="Sisipkan">
        {INSERT_ITEMS.map((item) => (
          <IconButton
            key={item.type}
            label={item.label}
            icon={item.icon}
            onClick={() => onInsert(item.type)}
          />
        ))}
      </RibbonGroup>

      <Separator orientation="vertical" className="h-auto" />

      {/* Format */}
      <RibbonGroup title="Format">
        <Select
          value={style.fontSize}
          onValueChange={(v) => setStyle({ fontSize: v as TextStyle["fontSize"] })}
          disabled={!canFormat}
        >
          <SelectTrigger className="h-8 w-24" aria-label="Ukuran teks">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Kecil</SelectItem>
            <SelectItem value="base">Normal</SelectItem>
            <SelectItem value="lg">Besar</SelectItem>
            <SelectItem value="xl">Judul</SelectItem>
            <SelectItem value="2xl">Judul XL</SelectItem>
          </SelectContent>
        </Select>
        <IconButton
          label="Tebal"
          icon={Bold}
          active={style.bold}
          disabled={!canFormat}
          onClick={() => setStyle({ bold: !style.bold })}
        />
        <IconButton
          label="Miring"
          icon={Italic}
          active={style.italic}
          disabled={!canFormat}
          onClick={() => setStyle({ italic: !style.italic })}
        />
        <IconButton
          label="Rata kiri"
          icon={AlignLeft}
          active={style.align === "left"}
          disabled={!canFormat}
          onClick={() => setStyle({ align: "left" })}
        />
        <IconButton
          label="Rata tengah"
          icon={AlignCenter}
          active={style.align === "center"}
          disabled={!canFormat}
          onClick={() => setStyle({ align: "center" })}
        />
        <IconButton
          label="Rata kanan"
          icon={AlignRight}
          active={style.align === "right"}
          disabled={!canFormat}
          onClick={() => setStyle({ align: "right" })}
        />
      </RibbonGroup>

      <Separator orientation="vertical" className="h-auto" />

      {/* Tabel & Border */}
      <RibbonGroup title="Tabel & Border">
        <IconButton
          label="Tambah baris"
          icon={Rows3}
          disabled={!isTable}
          onClick={() => onTableOp("add-row")}
        />
        <IconButton
          label="Tambah kolom"
          icon={Columns3}
          disabled={!isTable}
          onClick={() => onTableOp("add-col")}
        />
        <Select
          value={
            !hasBorder
              ? ""
              : !selected?.border
                ? "none"
                : selected.border.outer && selected.border.inner
                  ? "all"
                  : selected.border.outer
                    ? "outer"
                    : selected.border.inner
                      ? "inner"
                      : "none"
          }
          onValueChange={(v) =>
            onUpdateSelected({
              border: {
                outer: v === "all" || v === "outer",
                inner: v === "all" || v === "inner",
                width: selected?.border?.width ?? 1,
                color: selected?.border?.color ?? "#000000",
              },
            })
          }
          disabled={!hasBorder}
        >
          <SelectTrigger className="h-8 w-32" aria-label="Gaya border">
            <SelectValue placeholder="Border" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua garis</SelectItem>
            <SelectItem value="outer">Garis luar</SelectItem>
            <SelectItem value="inner">Garis dalam</SelectItem>
            <SelectItem value="none">Tanpa garis</SelectItem>
          </SelectContent>
        </Select>
        <IconButton
          label="Garis tebal"
          icon={Square}
          active={selected?.border?.width === 2}
          disabled={!hasBorder}
          onClick={() =>
            onUpdateSelected({
              border: {
                outer: selected?.border?.outer ?? true,
                inner: selected?.border?.inner ?? true,
                width: selected?.border?.width === 2 ? 1 : 2,
                color: selected?.border?.color ?? "#000000",
              },
            })
          }
        />
        <IconButton
          label="Hapus baris terakhir"
          icon={SquareDashed}
          disabled={!isTable}
          onClick={() => onTableOp("remove-row")}
        />
      </RibbonGroup>
    </div>
  );
}
