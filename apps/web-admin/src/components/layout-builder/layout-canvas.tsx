"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BLOCK_TYPE_LABEL, type LayoutBlock, type TaskTemplate } from "@/lib/types";
import { BlockRenderer } from "./block-renderer";
import { A4_HEIGHT_PX, A4_WIDTH_PX, usePagination } from "./use-pagination";

function SortableBlock({
  block,
  sourceTemplate,
  isSelected,
  onSelect,
  onDuplicate,
  onRemove,
  measureRef,
}: {
  block: LayoutBlock;
  sourceTemplate: TaskTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  measureRef: (el: HTMLElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        measureRef(el);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      data-testid={`block-${block.id}`}
      className={cn(
        "group relative cursor-pointer rounded-sm px-2 py-1.5 transition-colors",
        isSelected ? "ring-2 ring-primary" : "hover:bg-primary/5",
        isDragging && "z-10 opacity-70 shadow-lg"
      )}
    >
      {/* Drag handle + aksi blok — muncul saat hover atau terpilih */}
      <div
        className={cn(
          "absolute -left-8 top-1 flex flex-col gap-0.5 opacity-0 transition-opacity",
          "group-hover:opacity-100",
          isSelected && "opacity-100"
        )}
      >
        <button
          type="button"
          aria-label={`Geser blok ${block.label}`}
          className="flex size-6 cursor-grab items-center justify-center rounded border bg-background text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      <div
        className={cn(
          "absolute -top-2 right-1 z-10 flex gap-0.5 opacity-0 transition-opacity",
          "group-hover:opacity-100",
          isSelected && "opacity-100"
        )}
      >
        <Button
          variant="outline"
          size="icon"
          className="size-6 bg-background"
          aria-label={`Duplikat blok ${block.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy className="size-3" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-6 bg-background text-destructive hover:text-destructive"
          aria-label={`Hapus blok ${block.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {isSelected && (
        <span className="absolute -top-2 left-1 z-10 rounded bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
          {BLOCK_TYPE_LABEL[block.type]}
        </span>
      )}

      <BlockRenderer block={block} sourceTemplate={sourceTemplate} />
    </div>
  );
}

export function LayoutCanvas({
  blocks,
  sourceTemplate,
  selectedId,
  onSelect,
  onReorder,
  onDuplicate,
  onRemove,
}: {
  blocks: LayoutBlock[];
  sourceTemplate: TaskTemplate;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (blocks: LayoutBlock[]) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(blocks, oldIndex, newIndex));
  }

  const { pages, registerBlock } = usePagination(blocks);
  const [zoom, setZoom] = useState(0.55);

  return (
    <div className="flex flex-col items-center gap-4 overflow-x-auto py-2">
      <div className="flex items-center gap-2 self-end">
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          aria-label="Perkecil"
          onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <span className="w-12 text-center text-xs text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          aria-label="Perbesar"
          onClick={() => setZoom((z) => Math.min(1, Number((z + 0.1).toFixed(2))))}
        >
          <ZoomIn className="size-3.5" />
        </Button>
      </div>

      {/* id eksplisit: tanpa ini dnd-kit membuat id aksesibilitas dari counter
          global yang berbeda antara render server & klien -> hydration mismatch. */}
      <DndContext
        id="layout-canvas-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        {/* Satu SortableContext untuk semua halaman agar blok bisa digeser
            melintasi batas halaman. */}
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {pages.map((pageBlocks, pageIndex) => (
            <div key={`page-${pageIndex}`} className="flex flex-col items-center gap-1">
              <div
                data-testid={`page-${pageIndex + 1}`}
                className="shrink-0 origin-top rounded-md border bg-white p-8 pl-12 text-black shadow-md"
                style={{
                  width: A4_WIDTH_PX,
                  minHeight: A4_HEIGHT_PX,
                  transform: `scale(${zoom})`,
                  // Kompensasi ruang kosong akibat transform scale, yang tidak
                  // mengubah tinggi elemen di alur layout.
                  marginBottom: -A4_HEIGHT_PX * (1 - zoom),
                }}
                onClick={() => onSelect(null)}
              >
                <div className="flex flex-col gap-3">
                  {pageBlocks.map((block) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      sourceTemplate={sourceTemplate}
                      isSelected={selectedId === block.id}
                      onSelect={() => onSelect(block.id)}
                      onDuplicate={() => onDuplicate(block.id)}
                      onRemove={() => onRemove(block.id)}
                      measureRef={registerBlock(block.id)}
                    />
                  ))}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                Halaman {pageIndex + 1} dari {pages.length} &middot; A4
              </span>
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && (
        <div
          className="flex items-center justify-center rounded-md border bg-white text-black shadow-md"
          style={{ width: A4_WIDTH_PX, minHeight: A4_HEIGHT_PX }}
        >
          <p className="text-xs text-gray-400">
            Layout kosong &mdash; tambahkan blok dari toolbar &quot;Sisipkan&quot; di atas.
          </p>
        </div>
      )}
    </div>
  );
}
