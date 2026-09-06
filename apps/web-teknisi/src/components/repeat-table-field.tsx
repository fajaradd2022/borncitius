"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Filter, Camera, Upload, Loader2, X, MapPin } from "lucide-react";
import { toast } from "sonner";
import { AttachmentLightbox, type LightboxItem } from "./ui/attachment-lightbox";

export interface TableColumn {
  key: string;
  label: string;
  type: string; // text | number | dropdown | gps | auto
  options?: string[];
  group?: boolean;
  filter?: boolean;
}

export interface RemarkRule {
  scenario: string;
  minDl: number;
}

export interface PhotoSlot {
  key: string;
  label: string;
}

export interface RowAttachment {
  id: string;
  rowId: string;
  slot: number;
  url: string;
}

type Row = Record<string, string>;

let _uid = 0;
function newId(): string {
  // Stabil cukup untuk sesi ini; server tetap simpan _id di JSON.
  _uid += 1;
  return `r${Date.now().toString(36)}${_uid.toString(36)}`;
}

/**
 * Editor tabel baris-berulang TestCall 5G, dengan foto per baris.
 * - Tambah baris per scenario (auto-suffix Sector/Cell: 1/01 → 1/01a → 1/01b).
 * - Tiap baris punya slot foto (Speedtest/Youtube/Location) — upload/ambil foto.
 * - Filter Sector/Cell menyembunyikan baris + fotonya sekaligus.
 * - Remark otomatis Pass/Fail (DL Tput vs target scenario).
 */
export function RepeatTableField({
  label,
  columns,
  remarkRules,
  photoSlots,
  initialRows,
  attachments,
  locked,
  onSave,
  onUploadPhoto,
  onDeletePhoto,
  onGetLocation,
}: {
  label: string;
  columns: TableColumn[];
  remarkRules: RemarkRule[];
  photoSlots: PhotoSlot[];
  initialRows: Row[];
  attachments: RowAttachment[];
  locked?: boolean;
  onSave: (rows: Row[]) => void;
  onUploadPhoto: (rowId: string, slot: number, file: File) => Promise<void>;
  onDeletePhoto: (attachmentId: string) => Promise<void>;
  onGetLocation?: () => Promise<{ latitude: string; longitude: string } | null>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r) => ({ ...r, _id: r._id || newId() })),
  );
  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; startIndex: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ rowId: string; slot: number } | null>(null);

  const editableCols = columns.filter((c) => c.key !== "remark");
  const scenarioCol = columns.find((c) => c.group);
  const filterCol = columns.find((c) => c.filter);

  const scenarios = useMemo(() => {
    if (!scenarioCol) return ["__all__"]; // tabel tanpa kolom scenario: satu grup
    const set = new Set<string>();
    rows.forEach((r) => scenarioCol && r[scenarioCol.key] && set.add(r[scenarioCol.key]));
    return Array.from(set);
  }, [rows, scenarioCol]);

  const sectorValues = useMemo(() => {
    if (!filterCol) return [];
    return Array.from(new Set(rows.map((r) => r[filterCol.key]).filter(Boolean)));
  }, [rows, filterCol]);

  function commit(next: Row[]) {
    setRows(next);
    onSave(next);
  }

  function updateCell(rowId: string, key: string, value: string) {
    commit(rows.map((r) => (r._id === rowId ? { ...r, [key]: value } : r)));
  }

  // Auto-suffix Sector/Cell untuk baris tambahan: 1/01 → 1/01a → 1/01b …
  function nextSectorName(base: string, scenario: string): string {
    if (!base) return "";
    const existing = new Set(
      rows.filter((r) => scenarioCol && r[scenarioCol.key] === scenario).map((r) => (filterCol ? r[filterCol.key] : "")),
    );
    for (let i = 0; i < 26; i++) {
      const cand = `${base}${String.fromCharCode(97 + i)}`;
      if (!existing.has(cand)) return cand;
    }
    return `${base}_${Date.now().toString(36).slice(-3)}`;
  }

  function addRow(scenario: string) {
    const sample = rows.find((r) => scenarioCol && r[scenarioCol.key] === scenario);
    const baseSector = filterCol && sample ? sample[filterCol.key] ?? "" : "";
    const newRow: Row = { _id: newId() };
    editableCols.forEach((c) => {
      if (c.group) newRow[c.key] = scenario;
      else if (c.key === "distance" || c.key === "target") newRow[c.key] = sample?.[c.key] ?? "";
      else if (filterCol && c.key === filterCol.key) newRow[c.key] = nextSectorName(baseSector, scenario);
      else newRow[c.key] = "";
    });
    let insertAt = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (scenarioCol && rows[i][scenarioCol.key] === scenario) { insertAt = i + 1; break; }
    }
    commit([...rows.slice(0, insertAt), newRow, ...rows.slice(insertAt)]);
  }

  // Tambah baris untuk Sector/Cell yang SAMA (pengukuran ulang / titik tambahan
  // di sektor itu). Sector/Cell disalin PERSIS (tanpa suffix) agar tetap sama.
  function addRowForSector(sourceRow: Row) {
    const scenario = scenarioCol ? sourceRow[scenarioCol.key] : "";
    const newRow: Row = { _id: newId() };
    editableCols.forEach((c) => {
      if (c.group) newRow[c.key] = scenario;
      else if (c.key === "distance" || c.key === "target") newRow[c.key] = sourceRow[c.key] ?? "";
      else if (filterCol && c.key === filterCol.key) newRow[c.key] = sourceRow[c.key] ?? "";
      else newRow[c.key] = "";
    });
    const srcIdx = rows.findIndex((r) => r._id === sourceRow._id);
    const insertAt = srcIdx >= 0 ? srcIdx + 1 : rows.length;
    commit([...rows.slice(0, insertAt), newRow, ...rows.slice(insertAt)]);
  }

  async function fillLocation(rowId: string) {
    if (!onGetLocation) return;
    setBusy(`gps:${rowId}`);
    try {
      const loc = await onGetLocation();
      if (loc) {
        commit(rows.map((r) => (r._id === rowId ? { ...r, latitude: loc.latitude, longitude: loc.longitude } : r)));
        toast.success("Lokasi diperbarui.");
      } else {
        toast.error("Lokasi tidak tersedia.");
      }
    } finally {
      setBusy(null);
    }
  }

  function deleteRow(rowId: string) {
    if (!window.confirm("Hapus baris ini beserta fotonya?")) return;
    // Hapus foto baris tsb dulu (best-effort).
    attachments.filter((a) => a.rowId === rowId).forEach((a) => void onDeletePhoto(a.id));
    commit(rows.filter((r) => r._id !== rowId));
  }

  function computeRemark(row: Row): string {
    const rule = remarkRules.find((r) => scenarioCol && r.scenario === row[scenarioCol.key]);
    const dl = Number(row.dlTput);
    if (!rule || !row.dlTput || !isFinite(dl)) return "-";
    return dl >= rule.minDl ? "Pass" : "Fail";
  }

  function triggerUpload(rowId: string, slot: number, useCamera: boolean) {
    pending.current = { rowId, slot };
    (useCamera ? cameraRef : fileRef).current?.click();
  }

  async function handleFile(file: File) {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    setBusy(`${p.rowId}:${p.slot}`);
    try {
      await onUploadPhoto(p.rowId, p.slot, file);
    } catch {
      toast.error("Gagal mengunggah foto.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {filterCol && sectorValues.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-zinc-400" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs">
              <option value="">Semua {filterCol.label}</option>
              {sectorValues.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
        )}
      </div>

      {scenarios.map((scenario) => {
        const scenarioRows = rows
          .filter((r) => (!scenarioCol ? true : r[scenarioCol.key] === scenario))
          .filter((r) => !filter || (filterCol && r[filterCol.key] === filter));
        if (scenarioRows.length === 0 && filter) return null;
        return (
          <div key={scenario} className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
              <span className="text-xs font-semibold">{scenarioCol ? scenario : label}</span>
              {!locked && (
                <button type="button" onClick={() => addRow(scenario)} className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white active:opacity-90">
                  <Plus className="size-3.5" /> Tambah Baris
                </button>
              )}
            </div>
            <div className="flex flex-col divide-y">
              {scenarioRows.map((r) => {
                const rowId = r._id;
                return (
                  <div key={rowId} className="flex flex-col gap-3 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-500">
                        {filterCol ? `${filterCol.label}: ${r[filterCol.key] || "—"}` : rowId}
                      </span>
                      <div className="flex items-center gap-2">
                        <RemarkBadge remark={computeRemark(r)} />
                        {!locked && (
                          <>
                            <button type="button" onClick={() => addRowForSector(r)} aria-label="Tambah baris sektor ini" title="Tambah baris untuk Sector/Cell ini" className="flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              <Plus className="size-3" /> Sektor
                            </button>
                            <button type="button" onClick={() => deleteRow(rowId)} aria-label="Hapus baris" className="text-danger">
                              <Trash2 className="size-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {editableCols.filter((c) => !c.group).map((c) => (
                        <label key={c.key} className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-400">{c.label}</span>
                          {c.type === "dropdown" ? (
                            <select value={r[c.key] ?? ""} disabled={locked} onChange={(e) => updateCell(rowId, c.key, e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:bg-muted">
                              <option value="">—</option>
                              {(c.options ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
                            </select>
                          ) : c.type === "gps" ? (
                            <div className="flex gap-1">
                              <input value={r[c.key] ?? ""} disabled={locked} onChange={(e) => updateCell(rowId, c.key, e.target.value)} placeholder="—" className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary disabled:bg-muted" />
                              {!locked && onGetLocation && c.key === "latitude" && (
                                <button type="button" onClick={() => void fillLocation(rowId)} aria-label="Ambil lokasi" title="Ambil Latitude & Longitude" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                                  {busy === `gps:${rowId}` ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                                </button>
                              )}
                            </div>
                          ) : (
                            <input type={c.type === "number" ? "number" : "text"} inputMode={c.type === "number" ? "decimal" : undefined} value={r[c.key] ?? ""} disabled={locked} onChange={(e) => updateCell(rowId, c.key, e.target.value)} className="h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary disabled:bg-muted" />
                          )}
                        </label>
                      ))}
                    </div>

                    {/* Slot foto per baris */}
                    <div className={`grid gap-2 ${photoSlots.length >= 4 ? "grid-cols-4" : "grid-cols-3"}`}>
                      {photoSlots.map((ps, slot) => {
                        const isMulti = ps.key === "gearth"; // G-EARTH: bisa >1 foto
                        const isBusy = busy === `${rowId}:${slot}`;
                        if (isMulti) {
                          const items = attachments.filter((a) => a.rowId === rowId && a.slot === slot);
                          return (
                            <div key={ps.key} className="flex flex-col gap-1">
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">{ps.label}</span>
                              <div className="flex flex-col gap-1.5">
                                {items.map((att) => (
                                  <div key={att.id} className="relative">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const lb = items.map((a) => ({ id: a.id, url: a.url, alt: ps.label }));
                                        const startIndex = Math.max(0, lb.findIndex((it) => it.id === att.id));
                                        setLightbox({ items: lb, startIndex });
                                      }}
                                      className="block w-full"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={att.url} alt={ps.label} className="h-20 w-full cursor-zoom-in rounded-lg border object-cover transition active:opacity-80" />
                                    </button>
                                    {!locked && (
                                      <button type="button" onClick={() => void onDeletePhoto(att.id)} aria-label="Hapus foto" className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-danger text-white">
                                        <X className="size-3" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {!locked && (
                                  <div className="flex gap-1">
                                    {isBusy ? (
                                      <div className="flex h-9 w-full items-center justify-center rounded-md border border-dashed">
                                        <Loader2 className="size-4 animate-spin text-zinc-400" />
                                      </div>
                                    ) : (
                                      <>
                                        <button type="button" onClick={() => triggerUpload(rowId, slot, true)} aria-label="Ambil foto G-EARTH" className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-primary text-[10px] font-medium text-white">
                                          <Camera className="size-3.5" /> Ambil
                                        </button>
                                        <button type="button" onClick={() => triggerUpload(rowId, slot, false)} aria-label="Tambah foto G-EARTH" className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md border text-[10px] font-medium">
                                          <Plus className="size-3.5" /> Add
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                                {items.length === 0 && locked && (
                                  <div className="flex h-20 items-center justify-center rounded-lg border border-dashed text-[10px] text-zinc-400">—</div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        const att = attachments.find((a) => a.rowId === rowId && a.slot === slot);
                        return (
                          <div key={ps.key} className="flex flex-col gap-1">
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">{ps.label}</span>
                            {att ? (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Kumpulkan semua foto baris ini utk lightbox (slot tunggal saja).
                                    const rowPhotos = photoSlots
                                      .map((p, si) => {
                                        if (p.key === "gearth") return null;
                                        const a = attachments.find((x) => x.rowId === rowId && x.slot === si);
                                        return a ? { id: a.id, url: a.url, alt: p.label } : null;
                                      })
                                      .filter((x): x is LightboxItem => x !== null);
                                    const startIndex = Math.max(0, rowPhotos.findIndex((it) => it.id === att.id));
                                    setLightbox({ items: rowPhotos, startIndex });
                                  }}
                                  className="block w-full"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={att.url} alt={ps.label} className="h-24 w-full cursor-zoom-in rounded-lg border object-cover transition active:opacity-80" />
                                </button>
                                {!locked && (
                                  <button type="button" onClick={() => void onDeletePhoto(att.id)} aria-label="Hapus foto" className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-danger text-white">
                                    <X className="size-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed">
                                {isBusy ? (
                                  <Loader2 className="size-4 animate-spin text-zinc-400" />
                                ) : locked ? (
                                  <span className="text-[10px] text-zinc-400">—</span>
                                ) : (
                                  <div className="flex gap-1">
                                    <button type="button" onClick={() => triggerUpload(rowId, slot, true)} aria-label="Ambil foto" className="flex size-7 items-center justify-center rounded-md bg-primary text-white">
                                      <Camera className="size-3.5" />
                                    </button>
                                    <button type="button" onClick={() => triggerUpload(rowId, slot, false)} aria-label="Upload foto" className="flex size-7 items-center justify-center rounded-md border">
                                      <Upload className="size-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {scenarioRows.length === 0 && (<p className="p-3 text-xs text-zinc-400">Belum ada baris.</p>)}
            </div>
          </div>
        );
      })}
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

function RemarkBadge({ remark }: { remark: string }) {
  const cls = remark === "Pass" ? "bg-emerald-100 text-emerald-700" : remark === "Fail" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{remark}</span>;
}
