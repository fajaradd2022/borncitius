"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Filter } from "lucide-react";

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

type Row = Record<string, string>;

/**
 * Editor tabel baris-berulang untuk TestCall SSV 5G.
 * - Tambah baris per scenario (tombol per grup scenario).
 * - Filter tampilan berdasarkan Sector/Cell.
 * - Kolom "remark" dihitung otomatis (Pass/Fail) dari DL Tput vs target scenario.
 * Nilai disimpan sebagai JSON string via onSave.
 */
export function RepeatTableField({
  label,
  columns,
  remarkRules,
  initialRows,
  locked,
  onSave,
}: {
  label: string;
  columns: TableColumn[];
  remarkRules: RemarkRule[];
  initialRows: Row[];
  locked?: boolean;
  onSave: (rows: Row[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [filter, setFilter] = useState<string>("");

  const editableCols = columns.filter((c) => c.key !== "remark");
  const scenarioCol = columns.find((c) => c.group);
  const scenarios = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => scenarioCol && r[scenarioCol.key] && set.add(r[scenarioCol.key]));
    return Array.from(set);
  }, [rows, scenarioCol]);

  const sectorValues = useMemo(() => {
    const filterCol = columns.find((c) => c.filter);
    if (!filterCol) return [];
    const set = new Set<string>();
    rows.forEach((r) => r[filterCol.key] && set.add(r[filterCol.key]));
    return Array.from(set);
  }, [rows, columns]);
  const filterCol = columns.find((c) => c.filter);

  function commit(next: Row[]) {
    setRows(next);
    onSave(next);
  }

  function updateCell(rowIdx: number, key: string, value: string) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [key]: value } : r));
    commit(next);
  }

  function addRow(scenario: string) {
    // Salin distance/target dari baris scenario yang sama bila ada.
    const sample = rows.find((r) => scenarioCol && r[scenarioCol.key] === scenario);
    const newRow: Row = {};
    editableCols.forEach((c) => {
      newRow[c.key] = c.group ? scenario : c.key === "distance" || c.key === "target" ? sample?.[c.key] ?? "" : "";
    });
    // Sisipkan setelah baris terakhir scenario itu.
    let insertAt = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (scenarioCol && rows[i][scenarioCol.key] === scenario) { insertAt = i + 1; break; }
    }
    const next = [...rows.slice(0, insertAt), newRow, ...rows.slice(insertAt)];
    commit(next);
  }

  function deleteRow(rowIdx: number) {
    commit(rows.filter((_, i) => i !== rowIdx));
  }

  function computeRemark(row: Row): string {
    const rule = remarkRules.find((r) => scenarioCol && r.scenario === row[scenarioCol.key]);
    const dl = Number(row.dlTput);
    if (!rule || !row.dlTput || !isFinite(dl)) return "-";
    return dl >= rule.minDl ? "Pass" : "Fail";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {filterCol && sectorValues.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-zinc-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
            >
              <option value="">Semua {filterCol.label}</option>
              {sectorValues.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {scenarios.map((scenario) => {
        const scenarioRows = rows
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => scenarioCol && r[scenarioCol.key] === scenario)
          .filter(({ r }) => !filter || (filterCol && r[filterCol.key] === filter));
        if (scenarioRows.length === 0 && filter) return null;
        return (
          <div key={scenario} className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
              <span className="text-xs font-semibold">{scenario}</span>
              {!locked && (
                <button
                  type="button"
                  onClick={() => addRow(scenario)}
                  className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white active:opacity-90"
                >
                  <Plus className="size-3.5" /> Tambah Baris
                </button>
              )}
            </div>
            <div className="flex flex-col divide-y">
              {scenarioRows.map(({ r, idx }) => (
                <div key={idx} className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-500">
                      {filterCol ? `${filterCol.label}: ${r[filterCol.key] || "—"}` : `Baris ${idx + 1}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <RemarkBadge remark={computeRemark(r)} />
                      {!locked && (
                        <button type="button" onClick={() => deleteRow(idx)} aria-label="Hapus baris" className="text-danger">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {editableCols
                      .filter((c) => !c.group)
                      .map((c) => (
                        <label key={c.key} className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-400">{c.label}</span>
                          {c.type === "dropdown" ? (
                            <select
                              value={r[c.key] ?? ""}
                              disabled={locked}
                              onChange={(e) => updateCell(idx, c.key, e.target.value)}
                              className="h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:bg-muted"
                            >
                              <option value="">—</option>
                              {(c.options ?? []).map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={c.type === "number" ? "number" : "text"}
                              inputMode={c.type === "number" ? "decimal" : undefined}
                              value={r[c.key] ?? ""}
                              disabled={locked}
                              onChange={(e) => updateCell(idx, c.key, e.target.value)}
                              className="h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary disabled:bg-muted"
                            />
                          )}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
              {scenarioRows.length === 0 && (
                <p className="p-3 text-xs text-zinc-400">Belum ada baris. Klik “Tambah Baris”.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RemarkBadge({ remark }: { remark: string }) {
  const cls =
    remark === "Pass"
      ? "bg-emerald-100 text-emerald-700"
      : remark === "Fail"
        ? "bg-red-100 text-red-700"
        : "bg-zinc-100 text-zinc-500";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{remark}</span>;
}
