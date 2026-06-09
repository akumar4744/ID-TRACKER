// src/pages/ResourceManagement.tsx
// Upload + manage pools for Cache / Keywords / Smartlink items.
// Mirrors the AddressManagement upload UI exactly.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

export type ResType = "cache" | "keywords" | "smartlink";

const META: Record<ResType, { label: string; plural: string; placeholder: string; col: string }> = {
  cache:     { label: "Cache",     plural: "Cache Items",     placeholder: "e.g. https://cdn.example.com/cache/abc123", col: "Cache Value"    },
  keywords:  { label: "Keywords",  plural: "Keyword Sets",    placeholder: "e.g. buy shoes online, discount footwear",  col: "Keywords"       },
  smartlink: { label: "Smartlink", plural: "Smartlinks",      placeholder: "e.g. https://go.example.com/sl/xyz",        col: "Smartlink URL"  },
};

interface ResourceRow {
  id:          string;
  type:        ResType;
  value:       string;
  notes:       string | null;
  is_assigned: boolean;
  assigned_ip: string | null;
  assigned_at: string | null;
  created_at:  string;
}

type FilterTab = "all" | "unassigned" | "assigned";
type AddPanel  = "none" | "single" | "bulk";

// ── Robust CSV parser (first-column only) ─────────────────────────────────────
function parseCSVFirstColumn(raw: string): string[] {
  const text = raw.replace(/^﻿/, "");
  const results: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\r") { i++; continue; }
    if (text[i] === "\n") { i++; continue; }
    let field = "";
    if (text[i] === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
        else if (text[i] === '"')                   { i++; break; }
        else                                         { field += text[i++]; }
      }
    } else {
      while (i < text.length && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
        field += text[i++];
      }
    }
    const trimmed = field.trim();
    results.push(trimmed);
    while (i < text.length && text[i] !== "\n") i++;
  }
  return results;
}

interface ResourceManagementProps {
  resourceType: ResType;
}

export default function ResourceManagement({ resourceType }: ResourceManagementProps) {
  const { T, theme } = useTheme();
  const isLight = theme === "light";
  const meta = META[resourceType];

  // ── Table state ───────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState<ResourceRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<FilterTab>("all");
  const [search,     setSearch]     = useState("");
  const [page,       setPage]       = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 500;

  // ── Add panel ─────────────────────────────────────────────────────────────
  const [addPanel, setAddPanel] = useState<AddPanel>("none");

  // Single add
  const [singleVal,   setSingleVal]   = useState("");
  const [singleNotes, setSingleNotes] = useState("");
  const [singleSaving,setSingleSaving]= useState(false);
  const [singleErr,   setSingleErr]   = useState("");

  // Bulk add
  const [bulkText,   setBulkText]   = useState("");
  const [bulkNotes,  setBulkNotes]  = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ total: number; inserted: number; skipped: number } | null>(null);
  const [bulkErr,    setBulkErr]    = useState("");
  const [csvStats,   setCsvStats]   = useState<{ raw: number; loaded: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete
  const [selected,          setSelected]          = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetIds,   setDeleteTargetIds]   = useState<string[]>([]);
  const [deleting,          setDeleting]          = useState(false);
  const [deleteMsg,         setDeleteMsg]         = useState("");
  const [deleteErr,         setDeleteErr]         = useState("");

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async (targetPage = 1, bust = false) => {
    setLoading(true);
    const base = (targetPage - 1) * PAGE_SIZE;

    const [r1, r2, countRes] = await Promise.all([
      supabase.from("resource_items")
        .select("*")
        .eq("type", resourceType)
        .order("created_at", { ascending: false })
        .range(base, base + 499),
      supabase.from("resource_items")
        .select("*")
        .eq("type", resourceType)
        .order("created_at", { ascending: false })
        .range(base + 500, base + 999),
      bust || targetPage === 1
        ? supabase.from("resource_items")
            .select("*", { count: "exact", head: true })
            .eq("type", resourceType)
        : Promise.resolve(null),
    ]);

    const combined = [...(r1.data ?? []), ...(r2.data ?? [])] as ResourceRow[];
    setRows(combined);
    if (countRes && "count" in countRes && countRes.count != null) setTotalCount(countRes.count);
    setLoading(false);
  }, [resourceType, PAGE_SIZE]);

  useEffect(() => { fetchRows(page); }, [fetchRows, page]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`admin-res-${resourceType}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "resource_items" }, () => {
        fetchRows(page, true);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchRows, resourceType, page]);

  // ── Single add ────────────────────────────────────────────────────────────
  async function handleSingleAdd() {
    if (!singleVal.trim()) { setSingleErr("Value is required."); return; }
    setSingleSaving(true); setSingleErr("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("resource_items").insert({
      type:       resourceType,
      value:      singleVal.trim(),
      notes:      singleNotes.trim() || null,
      created_by: user!.id,
    });
    setSingleSaving(false);
    if (error) { setSingleErr(error.message.includes("unique") ? "This value already exists." : error.message); return; }
    setSingleVal(""); setSingleNotes(""); setAddPanel("none");
  }

  // ── Bulk add ──────────────────────────────────────────────────────────────
  function parseBulkText(raw: string): string[] {
    return raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  }

  async function handleBulkAdd() {
    const lines = parseBulkText(bulkText);
    if (lines.length === 0) { setBulkErr("No values found."); return; }
    if (lines.length > 50000) { setBulkErr("Maximum 50,000 items per import."); return; }
    setBulkSaving(true); setBulkErr(""); setBulkResult(null);
    const { data, error } = await supabase.rpc("bulk_insert_resources", {
      p_type:   resourceType,
      p_values: lines,
      p_notes:  bulkNotes.trim() || null,
    });
    setBulkSaving(false);
    if (error) { setBulkErr(error.message); return; }
    const result = data as { ok: boolean; error?: string; total: number; inserted: number; skipped: number };
    if (!result.ok) { setBulkErr(result.error ?? "Import failed"); return; }
    setBulkResult({ total: result.total, inserted: result.inserted, skipped: result.skipped });
    setBulkText(""); setBulkNotes(""); setCsvStats(null); setPage(1); fetchRows(1, true);
  }

  // ── CSV upload ────────────────────────────────────────────────────────────
  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target?.result as string;
      const allValues = parseCSVFirstColumn(raw);
      const headerWords = ["value", "cache", "keyword", "keywords", "smartlink", "url", "link"];
      let rowsData = allValues;
      if (rowsData.length > 0 && headerWords.includes(rowsData[0].toLowerCase())) rowsData = rowsData.slice(1);
      const valid = rowsData.filter((r) => r.length > 0);
      setBulkText(valid.join("\n"));
      setBulkResult(null); setBulkErr(""); setCsvStats({ raw: allValues.length, loaded: valid.length });
    };
    reader.onerror = () => setBulkErr("Failed to read the file.");
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function openDeleteConfirm(ids: string[]) {
    setDeleteTargetIds(ids); setDeleteErr(""); setShowDeleteConfirm(true);
  }

  async function handleDelete() {
    if (deleteTargetIds.length === 0) return;
    setDeleting(true); setDeleteErr("");
    const { error } = await supabase.from("resource_items").delete().in("id", deleteTargetIds);
    setDeleting(false);
    if (error) { setDeleteErr(error.message); return; }
    setDeleteMsg(`${deleteTargetIds.length} item${deleteTargetIds.length !== 1 ? "s" : ""} deleted.`);
    setSelected((prev) => { const n = new Set(prev); deleteTargetIds.forEach((id) => n.delete(id)); return n; });
    setShowDeleteConfirm(false); setDeleteTargetIds([]);
    fetchRows(page, true);
    setTimeout(() => setDeleteMsg(""), 4000);
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  function toggleOne(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === displayed.length && displayed.length > 0) setSelected(new Set());
    else setSelected(new Set(displayed.map((r) => r.id)));
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalPages      = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const assignedCount   = rows.filter((r) => r.is_assigned).length;
  const unassignedCount = rows.length - assignedCount;

  const displayed = rows.filter((r) => {
    const matchFilter =
      filter === "assigned"   ? r.is_assigned :
      filter === "unassigned" ? !r.is_assigned : true;
    const q = search.trim().toLowerCase();
    const matchSearch = q === "" || r.value.toLowerCase().includes(q) || (r.notes?.toLowerCase().includes(q) ?? false);
    return matchFilter && matchSearch;
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 22 }}>

      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: 10 }}>
        <div>
          <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 20, fontWeight: 700 }}>
            {meta.plural}
          </h2>
          <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
            Upload and manage your {meta.label.toLowerCase()} pool. Unassigned items are available for proxy assignment.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {selected.size > 0 && (
            <button
              style={S.deleteSelectedBtn}
              onClick={() => openDeleteConfirm(Array.from(selected))}
              title="Permanently delete selected items"
            >
              🗑 Delete ({selected.size})
            </button>
          )}
          <button
            style={addPanel !== "none" ? S.addBtnActive : S.addBtn}
            onClick={() => setAddPanel(addPanel === "none" ? "single" : "none")}
          >
            {addPanel !== "none" ? "✕ Close" : `+ Add ${meta.label}`}
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
        <ResChip label="Total"      count={totalCount}      color="#818cf8" T={T} />
        <ResChip label="Unassigned" count={unassignedCount} color="#f59e0b" T={T} />
        <ResChip label="Assigned"   count={assignedCount}   color="#22c55e" T={T} />
      </div>

      {deleteMsg && <div style={S.successBox}>{deleteMsg}</div>}

      {/* ── Add panel ── */}
      {addPanel !== "none" && (
        <div style={{ ...S.addPanelCard, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>
          {/* Tabs */}
          <div style={{ ...S.panelTabs, borderBottom: `1px solid ${T.dividerSolid}` }}>
            {(["single", "bulk"] as const).map((p) => (
              <button
                key={p}
                style={addPanel === p ? S.panelTabActive : { ...S.panelTab, color: T.textMuted }}
                onClick={() => { setAddPanel(p); setBulkResult(null); setBulkErr(""); setSingleErr(""); setCsvStats(null); }}
              >
                {p === "single" ? "Single Add" : "Bulk Add / CSV Import"}
              </button>
            ))}
            <button style={{ ...S.panelClose, color: T.textMuted }} onClick={() => { setAddPanel("none"); setBulkResult(null); setCsvStats(null); }}>✕</button>
          </div>

          {/* Single add */}
          {addPanel === "single" && (
            <div style={S.panelBody}>
              <label style={S.label}>{meta.col} <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }}
                value={singleVal}
                onChange={(e) => setSingleVal(e.target.value)}
                placeholder={meta.placeholder}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSingleAdd(); }}
              />
              <label style={S.label}>Category / Notes (optional)</label>
              <input
                style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }}
                value={singleNotes}
                onChange={(e) => setSingleNotes(e.target.value)}
                placeholder="e.g. US campaign, October batch…"
                onKeyDown={(e) => { if (e.key === "Enter") handleSingleAdd(); }}
              />
              {singleErr && <div style={S.errorBox}>⚠ {singleErr}</div>}
              <div style={S.panelActions}>
                <button style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => setAddPanel("none")}>Cancel</button>
                <button style={singleSaving ? S.submitBtnDisabled : S.submitBtn} onClick={handleSingleAdd} disabled={singleSaving}>
                  {singleSaving ? "Saving…" : `Save ${meta.label}`}
                </button>
              </div>
            </div>
          )}

          {/* Bulk add */}
          {addPanel === "bulk" && (
            <div style={S.panelBody}>
              <label style={S.label}>Paste values — one per line (up to 50,000)</label>
              <textarea
                style={{ ...S.textarea, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }}
                value={bulkText}
                onChange={(e) => { setBulkText(e.target.value); setBulkResult(null); setCsvStats(null); }}
                placeholder={`${meta.placeholder}\n${meta.placeholder}\n…`}
                rows={8}
              />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Category / Notes for all (optional)</label>
                  <input
                    style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }}
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    placeholder="e.g. Batch A, US market…"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={S.label}>Or upload CSV</label>
                  <button style={S.csvBtn} onClick={() => fileInputRef.current?.click()}>📄 Upload CSV</button>
                  <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleCSVUpload} />
                </div>
              </div>

              {csvStats && (
                <div style={S.csvStats}>
                  <span style={{ color: "#818cf8", fontSize: 12, fontWeight: 600 }}>📄 CSV loaded</span>
                  <span style={{ color: "#8b92a8", fontSize: 11 }}>
                    {csvStats.loaded} item{csvStats.loaded !== 1 ? "s" : ""} ready to import
                    {csvStats.raw !== csvStats.loaded ? ` (${csvStats.raw - csvStats.loaded} blank/header rows skipped)` : " — all rows included"}
                  </span>
                </div>
              )}

              {bulkText.trim() && !csvStats && (
                <div style={S.bulkPreview}>{parseBulkText(bulkText).length} {meta.label.toLowerCase()} items detected</div>
              )}

              {bulkErr && <div style={S.errorBox}>⚠ {bulkErr}</div>}
              {bulkResult && (
                <div style={S.bulkResult}>
                  <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>✅ Import Complete</span>
                  <div style={{ display: "flex", gap: 20 }}>
                    <ResStat label="Total"    value={bulkResult.total}    color="#8b92a8" />
                    <ResStat label="Imported" value={bulkResult.inserted} color="#22c55e" />
                    <ResStat label="Skipped"  value={bulkResult.skipped}  color="#f59e0b" />
                  </div>
                  {bulkResult.skipped > 0 && (
                    <span style={{ color: "#4a5166", fontSize: 11 }}>Skipped = exact duplicates already in the database.</span>
                  )}
                </div>
              )}

              <div style={S.panelActions}>
                <button style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => { setAddPanel("none"); setBulkResult(null); setCsvStats(null); }}>Close</button>
                <button
                  style={bulkSaving || parseBulkText(bulkText).length === 0 ? S.submitBtnDisabled : S.submitBtn}
                  onClick={handleBulkAdd}
                  disabled={bulkSaving || parseBulkText(bulkText).length === 0}
                >
                  {bulkSaving ? "Importing…" : `Import ${parseBulkText(bulkText).length} Items`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter + search */}
      <div style={S.filterBar}>
        <div style={S.filterTabs}>
          {(["all", "unassigned", "assigned"] as FilterTab[]).map((f) => (
            <button
              key={f}
              style={filter === f ? S.filterTabActive : { ...S.filterTab, border: `1px solid ${T.borderBtn}`, color: T.textMuted }}
              onClick={() => { setFilter(f); setSelected(new Set()); }}
            >
              {f === "all"        && `All (${totalCount})`}
              {f === "unassigned" && `Unassigned (${unassignedCount} on page)`}
              {f === "assigned"   && `Assigned (${assignedCount} on page)`}
            </button>
          ))}
        </div>
        <input
          style={{ ...S.searchInput, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${meta.label.toLowerCase()} values…`}
        />
      </div>

      {/* Table */}
      <div style={{ ...S.tableCard, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>
        {loading ? (
          <div style={S.msg}>Loading…</div>
        ) : displayed.length === 0 ? (
          <div style={S.msg}>
            {search
              ? `No ${meta.plural.toLowerCase()} match "${search}"`
              : filter === "unassigned" ? `No unassigned ${meta.plural.toLowerCase()} on this page.`
              : filter === "assigned"   ? `No assigned ${meta.plural.toLowerCase()} on this page.`
              : `No ${meta.plural.toLowerCase()} yet. Click "+ Add ${meta.label}" to upload some.`}
          </div>
        ) : (
          <table style={{ ...S.table, color: T.textPrimary }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 36, background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>
                  <input
                    type="checkbox"
                    checked={selected.size === displayed.length && displayed.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={{ ...S.th, width: 28, background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>#</th>
                {[meta.col, "Notes / Category", "Status", "Assigned IP", "Created", ""].map((h) => (
                  <th key={h} style={{ ...S.th, background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((row, idx) => {
                const isSel = selected.has(row.id);
                return (
                  <tr key={row.id} style={{
                    ...S.tr,
                    borderBottom: `1px solid ${T.borderTableRow}`,
                    background: isSel
                      ? T.bgTableRowSelected
                      : row.is_assigned
                        ? (isLight ? "rgba(16,185,129,0.03)" : "#0d1a10")
                        : undefined,
                  }}>
                    <td style={S.td}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleOne(row.id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ ...S.td, color: T.textMuted, fontSize: 10 }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td style={{ ...S.td, color: T.textPrimary, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {row.value}
                    </td>
                    <td style={{ ...S.td, color: T.textMuted, fontSize: 11 }}>{row.notes || "—"}</td>
                    <td style={S.td}>
                      {row.is_assigned
                        ? <span style={{ ...S.badge, ...S.badgeAssigned }}>Assigned</span>
                        : <span style={{ ...S.badge, ...S.badgeUnassigned }}>Unassigned</span>}
                    </td>
                    <td style={{ ...S.td, color: T.textMuted, fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {row.assigned_ip || "—"}
                    </td>
                    <td style={{ ...S.td, color: T.textMuted, fontSize: 11 }}>
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ ...S.td, width: 60 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); openDeleteConfirm([row.id]); }}
                        title="Delete permanently"
                        style={{
                          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                          borderRadius: 4, color: "#ef4444", fontSize: 10,
                          padding: "2px 6px", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 4 }}>
          <button
            onClick={() => { setPage(Math.max(1, page - 1)); setSelected(new Set()); }}
            disabled={page === 1}
            style={{
              background: page === 1 ? T.bgBtn : "rgba(124,108,248,0.12)",
              border: "1px solid rgba(124,108,248,0.25)", borderRadius: 7,
              color: page === 1 ? T.textMuted : "#a5a8ff", fontSize: 12, fontWeight: 600,
              padding: "6px 16px", cursor: page === 1 ? "default" : "pointer", fontFamily: "inherit",
            }}
          >← Prev</button>
          <span style={{ color: T.textSecondary, fontSize: 12 }}>
            Page <strong style={{ color: T.textPrimary }}>{page}</strong> of <strong style={{ color: T.textPrimary }}>{totalPages}</strong>
          </span>
          <button
            onClick={() => { setPage(Math.min(totalPages, page + 1)); setSelected(new Set()); }}
            disabled={page === totalPages}
            style={{
              background: page === totalPages ? T.bgBtn : "rgba(124,108,248,0.12)",
              border: "1px solid rgba(124,108,248,0.25)", borderRadius: 7,
              color: page === totalPages ? T.textMuted : "#a5a8ff", fontSize: 12, fontWeight: 600,
              padding: "6px 16px", cursor: page === totalPages ? "default" : "pointer", fontFamily: "inherit",
            }}
          >Next →</button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={S.modalOverlay}>
          <div style={{ ...S.modal, background: T.bgCardAlt, border: `1px solid ${T.borderCard}` }}>
            <div style={{ ...S.modalHeader, borderBottom: `1px solid ${T.dividerSolid}` }}>
              <span style={{ ...S.modalTitle, color: T.textPrimary }}>Confirm Delete</span>
              <button style={{ ...S.closeBtn, color: T.textMuted }} onClick={() => setShowDeleteConfirm(false)}>✕</button>
            </div>
            <div style={S.modalBody}>
              <div style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 8, padding: "12px 14px", color: "#ef4444", fontSize: 13, lineHeight: 1.6,
              }}>
                ⚠ This will <strong>permanently delete</strong> {deleteTargetIds.length} {meta.label.toLowerCase()} item{deleteTargetIds.length !== 1 ? "s" : ""}.
                This cannot be undone.
              </div>
              {deleteErr && <div style={S.errorBox}>⚠ {deleteErr}</div>}
            </div>
            <div style={{ ...S.modalFooter, borderTop: `1px solid ${T.dividerSolid}` }}>
              <button style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button style={deleting ? S.submitBtnDisabled : S.deleteBtnSolid} onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : `Delete ${deleteTargetIds.length} Item${deleteTargetIds.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ResChip({ label, count, color, T }: { label: string; count: number; color: string; T: any }) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${color}33`,
      borderRadius: 10, padding: "8px 16px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 80,
    }}>
      <span style={{ color, fontSize: 20, fontWeight: 700 }}>{count}</span>
      <span style={{ color: T.textMuted, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const }}>{label}</span>
    </div>
  );
}

function ResStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</span>
      <span style={{ color: "#8b92a8", fontSize: 10 }}>{label}</span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  addBtn: {
    background: "#4f46e5", border: "none", color: "#fff",
    borderRadius: 7, padding: "9px 16px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  addBtnActive: {
    background: "rgba(91,110,245,0.15)", border: "1px solid rgba(91,110,245,0.3)", color: "#818cf8",
    borderRadius: 7, padding: "9px 16px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  deleteSelectedBtn: {
    background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444",
    borderRadius: 7, padding: "7px 13px", fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  },
  deleteBtnSolid: {
    background: "#ef4444", border: "none", color: "#fff",
    borderRadius: 6, padding: "8px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  addPanelCard: {
    background: "#141826", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10, overflow: "hidden",
  },
  panelTabs:      { display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  panelTab:       { background: "none", border: "none", color: "#4a5166", padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", borderBottom: "2px solid transparent" },
  panelTabActive: { background: "none", border: "none", color: "#818cf8", padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", borderBottom: "2px solid #4f46e5", fontWeight: 600 },
  panelClose:     { background: "none", border: "none", color: "#4a5166", marginLeft: "auto", padding: "10px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  panelBody:      { padding: "1.1rem", display: "flex", flexDirection: "column", gap: 8 },
  panelActions:   { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 },
  filterBar:      { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const },
  filterTabs:     { display: "flex", gap: 4 },
  filterTab:      { display: "inline-flex", alignItems: "center", background: "none", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, color: "#4a5166", fontSize: 12, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" },
  filterTabActive:{ display: "inline-flex", alignItems: "center", background: "rgba(91,110,245,0.12)", border: "1px solid rgba(91,110,245,0.28)", borderRadius: 8, color: "#818cf8", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" },
  searchInput:    { background: "#141826", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, color: "#f0f2f8", fontSize: 12, padding: "7px 12px", outline: "none", minWidth: 220, fontFamily: "inherit" },
  tableCard:      { background: "#141826", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" },
  table:          { width: "100%", borderCollapse: "collapse", fontFamily: "inherit", fontSize: 12 },
  th:             { background: "#0f1320", color: "#4a5166", textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  tr:             { borderBottom: "1px solid rgba(255,255,255,0.04)" },
  td:             { padding: "10px 12px", color: "#c9d1e0", verticalAlign: "middle" },
  badge:          { display: "inline-block", padding: "2px 8px", borderRadius: 4, border: "1px solid", fontSize: 10, fontWeight: 600 },
  badgeAssigned:  { background: "rgba(34,197,94,0.1)",  color: "#22c55e", borderColor: "rgba(34,197,94,0.3)" },
  badgeUnassigned:{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)" },
  label:          { color: "#4a5166", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  input:          { background: "#0f1320", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#f0f2f8", padding: "9px 10px", fontSize: 13, fontFamily: "inherit", outline: "none" },
  textarea:       { background: "#0f1320", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#f0f2f8", padding: "9px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical", width: "100%", boxSizing: "border-box", lineHeight: 1.6 },
  cancelBtn:      { background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#4a5166", borderRadius: 6, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  submitBtn:      { background: "#4f46e5", border: "none", color: "#fff", borderRadius: 6, padding: "8px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  submitBtnDisabled: { background: "rgba(255,255,255,0.04)", border: "none", color: "#2e3347", borderRadius: 6, padding: "8px 20px", fontSize: 12, fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit" },
  csvBtn:         { background: "#1e293b", border: "1px solid rgba(255,255,255,0.07)", color: "#8b92a8", borderRadius: 5, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  csvStats:       { background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.18)", borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 },
  bulkPreview:    { background: "#0f1320", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 5, padding: "6px 10px", color: "#818cf8", fontSize: 11 },
  bulkResult:     { background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 },
  modalOverlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "inherit" },
  modal:          { background: "#141826", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column" },
  modalHeader:    { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  modalTitle:     { color: "#f0f2f8", fontWeight: 700, fontSize: 14 },
  closeBtn:       { background: "none", border: "none", color: "#4a5166", cursor: "pointer", fontSize: 16 },
  modalBody:      { padding: "1.1rem", display: "flex", flexDirection: "column", gap: 10 },
  modalFooter:    { display: "flex", justifyContent: "flex-end", gap: 10, padding: "1rem 1.25rem", borderTop: "1px solid rgba(255,255,255,0.07)" },
  successBox:     { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", borderRadius: 8, padding: "10px 14px", fontSize: 13 },
  errorBox:       { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: 8, padding: "10px 14px", fontSize: 13 },
  msg:            { color: "#4a5166", padding: "2rem", textAlign: "center", fontSize: 13 },
};
