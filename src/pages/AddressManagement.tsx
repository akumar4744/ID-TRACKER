// AddressManagement.tsx — FULL FILE (fixed CSV upload)

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import AddressWorkCard from "../components/AddressWorkCard";
import { useTheme } from "../lib/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddressRow {
  id:                      string;
  address:                 string;
  notes:                   string | null;
  is_assigned:             boolean;
  assigned_to:             string | null;
  assigned_at:             string | null;
  reassigned_count:        number;
  created_at:              string;
  assigned_employee_name:  string | null;
  assigned_employee_email: string | null;
}

interface AssignmentRow {
  id:            string;
  address_id:    string;
  address_text:  string;
  category:      string | null;
  cache:         string | null;
  keywords:      string | null;
  smartlink:     string | null;
  locked_meta:   boolean;
  status:        string;
  assigned_at:   string;
  updated_at:    string;
  employee_name: string | null;
}

interface Employee {
  id:        string;
  email:     string;
  full_name: string;
  status:    string;
}

// ── Resource picker types ─────────────────────────────────────────────────────
interface ResourcePickerItem {
  id:    string;
  value: string;
  notes: string | null;
}

type AssignStep =
  | "main"
  | "pick_cache"
  | "pick_keywords"
  | "pick_smartlink";

type FilterTab  = "all" | "unassigned" | "assigned";
type AddPanel   = "none" | "single" | "bulk";
type MainView   = "table" | "work";

// ── Robust CSV parser ─────────────────────────────────────────────────────────
// Handles: quoted fields, commas inside quotes, CRLF/LF, BOM, empty rows
function parseCSVFirstColumn(raw: string): string[] {
  // Strip BOM if present
  const text = raw.replace(/^\uFEFF/, "");

  const results: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip carriage returns
    if (text[i] === "\r") { i++; continue; }
    // Skip blank lines
    if (text[i] === "\n") { i++; continue; }

    let field = "";

    if (text[i] === '"') {
      // Quoted field — read until closing quote
      i++; // skip opening quote
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') {
          // Escaped quote inside field
          field += '"';
          i += 2;
        } else if (text[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += text[i++];
        }
      }
    } else {
      // Unquoted field — read until comma or newline
      while (i < text.length && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
        field += text[i++];
      }
    }

    const trimmed = field.trim();
    results.push(trimmed); // Push ALL values, even short/empty ones

    // Skip the rest of the line (other columns) until we hit a newline
    while (i < text.length && text[i] !== "\n") {
      i++;
    }
  }

  return results;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddressManagement() {
  const { T, theme } = useTheme();
  const isLight = theme === "light";

  // ── Table view state ──────────────────────────────────────────────────────
  const [addresses,   setAddresses]  = useState<AddressRow[]>([]);
  const [employees,   setEmployees]  = useState<Employee[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [filter,      setFilter]     = useState<FilterTab>("all");
  const [search,      setSearch]     = useState("");
  const [page,        setPage]       = useState(1);
  const [totalCount,  setTotalCount] = useState(0);
  const PAGE_SIZE = 2000;
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [addPanel,   setAddPanel]   = useState<AddPanel>("none");

  // ── Virtual scroll state ──────────────────────────────────────────────────
  const [virtualMode,   setVirtualMode]   = useState(false);
  const [allRows,       setAllRows]       = useState<AddressRow[]>([]);
  const [loadingAll,    setLoadingAll]    = useState(false);
  const [loadedCount,   setLoadedCount]   = useState(0);
  const [vsScrollTop,   setVsScrollTop]   = useState(0);
  const vsContainerRef  = useRef<HTMLDivElement>(null);
  const VS_ROW_H        = 50;
  const VS_OVERSCAN     = 25;
  const VS_H            = 'calc(100vh - 310px)';

  // Frontend-only hide for TABLE view (never touches DB)
  const [hiddenTableIds,     setHiddenTableIds]     = useState<Set<string>>(new Set());
  const [showingHiddenTable, setShowingHiddenTable] = useState(false);

  // Single add
  const [singleAddr,        setSingleAddr]        = useState("");
  const [singleNotes,       setSingleNotes]        = useState("");
  const [singleSaving,      setSingleSaving]       = useState(false);
  const [singleErr,         setSingleErr]          = useState("");
  const [singleBoundFp,     setSingleBoundFp]      = useState<string | null>(null);
  const [singleFpChecking,  setSingleFpChecking]   = useState(false);
  const singleCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk add
  const [bulkText,    setBulkText]    = useState("");
  const [bulkNotes,   setBulkNotes]   = useState("");
  const [bulkSaving,  setBulkSaving]  = useState(false);
  const [bulkResult,  setBulkResult]  = useState<{ total: number; inserted: number; skipped: number } | null>(null);
  const [bulkErr,     setBulkErr]     = useState("");
  const [csvStats,    setCsvStats]    = useState<{ raw: number; loaded: number } | null>(null);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  // Assign modal
  const [showAssign,    setShowAssign]    = useState(false);
  const [assignTo,        setAssignTo]        = useState("");
  const [assignCategory,  setAssignCategory]  = useState("");
  const [assignCache,     setAssignCache]     = useState("");    // confirmed cache value
  const [assignKeywords,  setAssignKeywords]  = useState("");    // confirmed keywords value
  const [assignSmartlink, setAssignSmartlink] = useState("");    // confirmed smartlink value
  const [assigning,       setAssigning]       = useState(false);
  const [assignMsg,       setAssignMsg]       = useState("");
  const [assignErr,       setAssignErr]       = useState("");

  // Stepped resource picker state
  const [assignStep,    setAssignStep]    = useState<AssignStep>("main");
  const [cachePool,     setCachePool]     = useState<ResourcePickerItem[]>([]);
  const [kwPool,        setKwPool]        = useState<ResourcePickerItem[]>([]);
  const [slPool,        setSlPool]        = useState<ResourcePickerItem[]>([]);
  const [resFetching,   setResFetching]   = useState(false);
  const [selCacheId,    setSelCacheId]    = useState("");   // locked resource item ID
  const [selKwId,       setSelKwId]       = useState("");
  const [selSlId,       setSelSlId]       = useState("");
  const [pickerSearch,  setPickerSearch]  = useState("");
  const [pickerTempId,  setPickerTempId]  = useState("");   // temp selection inside picker
  const [pickerTempVal, setPickerTempVal] = useState("");

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetIds,   setDeleteTargetIds]   = useState<string[]>([]);
  const [deleting,          setDeleting]          = useState(false);
  const [deleteMsg,         setDeleteMsg]         = useState("");
  const [deleteErr,         setDeleteErr]         = useState("");

  // Range select
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo,   setRangeTo]   = useState("");
  const [selectN,   setSelectN]   = useState("");

  // ── Work view state ───────────────────────────────────────────────────────
  const [mainView,     setMainView]     = useState<MainView>("table");
  const [assignments,  setAssignments]  = useState<AssignmentRow[]>([]);
  const [workLoading,  setWorkLoading]  = useState(false);
  const [hiddenIds,    setHiddenIds]    = useState<Set<string>>(new Set());
  const [workSearch,   setWorkSearch]   = useState("");
  const [workFilter,   setWorkFilter]   = useState<"all" | "Pending" | "Completed" | "Failed">("all");
  const [updatingId,   setUpdatingId]   = useState<string | null>(null);
  const [workMsg,      setWorkMsg]      = useState("");
  const [workErr,      setWorkErr]      = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  // ── Page cache — visited pages load instantly ─────────────────────────────
  const pageCache = useRef<Map<number, AddressRow[]>>(new Map());
  const employeesLoaded = useRef(false);
  const totalCountRef = useRef(0); // mirrors totalCount state — readable inside useCallback without dep

  // ── Fetch table (paginated + cached) ─────────────────────────────────────
  // PostgREST hard-caps at 1000 rows per request regardless of .range().
  // We fetch two batches of 1000 in parallel and merge → 2000 per page.
  const fetchAll = useCallback(async (targetPage = 1, bustCache = false) => {
    // Serve from cache instantly if available
    if (!bustCache && pageCache.current.has(targetPage)) {
      setAddresses(pageCache.current.get(targetPage)!);
      setLoading(false);
      if (totalCountRef.current === 0) {
        supabase.from("addresses_with_employee")
          .select("*", { count: "exact", head: true })
          .then(({ count }) => { if (count != null) setTotalCount(count); });
      }
      return;
    }

    setLoading(true);
    const base = (targetPage - 1) * PAGE_SIZE; // e.g. page 1 → 0, page 2 → 2000

    const orderOpts = { ascending: true  } as const;
    const orderDate = { ascending: false } as const;

    // Two parallel batches of 1000 + optional employees + count
    const batch1Promise = supabase.from("addresses_with_employee")
      .select("*", { count: "exact" })
      .order("is_assigned", orderOpts)
      .order("created_at", orderDate)
      .range(base, base + 999);

    const batch2Promise = supabase.from("addresses_with_employee")
      .select("*")
      .order("is_assigned", orderOpts)
      .order("created_at", orderDate)
      .range(base + 1000, base + 1999);

    const empPromise = !employeesLoaded.current
      ? supabase.from("profiles").select("id, email, full_name, status").eq("role", "employee").order("full_name")
      : Promise.resolve(null);

    const [batch1, batch2, empRes] = await Promise.all([batch1Promise, batch2Promise, empPromise]);

    const combined = [
      ...(batch1.data ?? []),
      ...(batch2.data ?? []),
    ] as AddressRow[];

    pageCache.current.set(targetPage, combined);
    setAddresses(combined);
    if (batch1.count != null) { setTotalCount(batch1.count); totalCountRef.current = batch1.count; }
    if (empRes?.data) {
      setEmployees(empRes.data as Employee[]);
      employeesLoaded.current = true;
    }
    setLoading(false);
  }, [PAGE_SIZE]);

  // ── Load ALL rows for virtual scroll ─────────────────────────────────────
  async function loadAllForVirtual() {
    setLoadingAll(true);
    setLoadedCount(0);
    setVsScrollTop(0);

    // Get total count first
    const { count } = await supabase
      .from("addresses_with_employee")
      .select("*", { count: "exact", head: true });
    const total = count ?? totalCount;
    if (!total) { setLoadingAll(false); return; }

    const BATCH = 1000;
    const numBatches = Math.ceil(total / BATCH);
    // Use a flat array; each row is placed at its absolute DB position (b * BATCH + i)
    // so a failed/empty batch leaves holes instead of corrupting all subsequent indices.
    const all: (AddressRow | undefined)[] = new Array(total);
    let filled = 0;

    // Fire 10 parallel batches at a time
    const GROUP = 10;
    for (let g = 0; g < numBatches; g += GROUP) {
      const batchIndices = Array.from(
        { length: Math.min(GROUP, numBatches - g) },
        (_, i) => g + i
      );
      const slice = batchIndices.map((b) =>
        supabase
          .from("addresses_with_employee")
          .select("*")
          .order("is_assigned", { ascending: true })
          .order("created_at",  { ascending: false })
          .range(b * BATCH, (b + 1) * BATCH - 1)
      );
      const results = await Promise.all(slice);
      // Place each row at its absolute position (b * BATCH + i) — safe against partial failures
      results.forEach((r, ri) => {
        const b = batchIndices[ri];
        if (r.data) {
          r.data.forEach((row, i) => { all[b * BATCH + i] = row as AddressRow; });
          filled += r.data.length;
        }
      });
      setLoadedCount(filled);
    }

    setAllRows(all.filter((r): r is AddressRow => r !== undefined));
    setTotalCount(total);
    setVirtualMode(true);
    setLoadingAll(false);
  }

  // ── Fetch work view ───────────────────────────────────────────────────────
  const fetchAssignments = useCallback(async () => {
    setWorkLoading(true);
    const { data, error } = await supabase
      .from("address_assignments")
      .select(`id, address_id, status, assigned_at, updated_at, category,
               cache, keywords, smartlink, locked_meta,
               addresses ( address ),
               profiles!employee_id ( full_name, email )`)
      .order("assigned_at", { ascending: false });

    if (!error && data) {
      const mapped: AssignmentRow[] = (data as any[]).map((r) => ({
        id:            r.id,
        address_id:    r.address_id,
        address_text:  r.addresses?.address ?? "—",
        category:      r.category      ?? null,
        cache:         r.cache         ?? null,
        keywords:      r.keywords      ?? null,
        smartlink:     r.smartlink     ?? null,
        locked_meta:   r.locked_meta   ?? false,
        status:        r.status,
        assigned_at:   r.assigned_at,
        updated_at:    r.updated_at,
        employee_name: r.profiles?.full_name || r.profiles?.email || null,
      }));
      setAssignments(mapped);
    }
    setWorkLoading(false);
  }, []);

  useEffect(() => { fetchAll(page); }, [fetchAll, page]);
  useEffect(() => {
    if (mainView === "work") fetchAssignments();
  }, [mainView, fetchAssignments]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel("admin-addr-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "addresses" }, () => {
        pageCache.current.clear();
        fetchAll(page, true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "address_assignments" }, () => {
        pageCache.current.clear();
        fetchAll(page, true);
        if (mainView === "work") fetchAssignments();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll, fetchAssignments, mainView]);

  // ── Status update ─────────────────────────────────────────────────────────
  async function handleStatusChange(assignmentId: string, newStatus: string) {
    setUpdatingId(assignmentId); setWorkMsg(""); setWorkErr("");
    const { data, error } = await supabase.rpc("update_address_status", {
      p_assignment_id: assignmentId, p_status: newStatus,
    });
    setUpdatingId(null);
    if (error) { setWorkErr(error.message); return; }
    const result = data as { ok: boolean; error?: string };
    if (!result.ok) { setWorkErr(result.error ?? "Update failed"); return; }
    setWorkMsg("Status updated.");
    setAssignments((prev) =>
      prev.map((a) => a.id === assignmentId ? { ...a, status: newStatus } : a)
    );
    setTimeout(() => setWorkMsg(""), 3000);
  }

  // ── Table hide/restore (frontend-only, never DB delete) ───────────────────
  function hideTableRow(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setHiddenTableIds((prev) => new Set([...prev, id]));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function hideSelectedTableRows() {
    setHiddenTableIds((prev) => new Set([...prev, ...selected]));
    setSelected(new Set());
  }

  function restoreAllTableRows() {
    setHiddenTableIds(new Set());
    setShowingHiddenTable(false);
  }

  // ── Work view hide/restore ────────────────────────────────────────────────
  function hideOne(id: string) {
    setHiddenIds((prev) => new Set([...prev, id]));
    setBulkSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function hideBulkSelected() {
    setHiddenIds((prev) => new Set([...prev, ...bulkSelected]));
    setBulkSelected(new Set());
  }

  function showAllWork() {
    setHiddenIds(new Set());
  }

  // ── Table selection helpers ───────────────────────────────────────────────
  function toggleOne(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    if (selected.size === displayedTable.length && displayedTable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayedTable.map((a) => a.id)));
    }
  }

  function selectAllInDB() {
    // In virtual mode all rows are loaded into allRows; use that for true "select all"
    const source = virtualMode ? allRows : addresses;
    setSelected(new Set(source.map((a) => a.id)));
  }

  function selectFirstN() {
    const n = parseInt(selectN, 10);
    if (isNaN(n) || n <= 0) return;
    setSelected(new Set(displayedTable.slice(0, n).map((a) => a.id)));
  }

  function selectRange() {
    const from = parseInt(rangeFrom, 10);
    const to   = parseInt(rangeTo, 10);
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) return;
    setSelected(new Set(displayedTable.slice(from - 1, to).map((a) => a.id)));
  }

  function clearSelection() { setSelected(new Set()); }

  // ── Single add IP → fingerprint binding check ─────────────────────────────
  function handleSingleAddrChange(val: string) {
    setSingleAddr(val);
    setSingleBoundFp(null);
    if (singleCheckTimer.current) clearTimeout(singleCheckTimer.current);
    const trimmed = val.trim();
    if (!trimmed) { setSingleFpChecking(false); return; }
    setSingleFpChecking(true);
    singleCheckTimer.current = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc("validate_ip_fingerprint", {
          p_unique_id:     trimmed,
          p_fingerprint:   null,
          p_assignment_id: "00000000-0000-0000-0000-000000000000",
          p_confirm:       false,
        });
        const result = data as { known_fingerprint?: string | null } | null;
        setSingleBoundFp(result?.known_fingerprint ?? null);
      } catch { /* silent */ }
      finally { setSingleFpChecking(false); }
    }, 500);
  }

  // ── Single add ────────────────────────────────────────────────────────────
  async function handleSingleAdd() {
    if (!singleAddr.trim()) { setSingleErr("Address is required."); return; }
    setSingleSaving(true); setSingleErr("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("addresses").insert({
      address: singleAddr.trim(), notes: singleNotes.trim() || null, created_by: user!.id,
    });
    setSingleSaving(false);
    if (error) { setSingleErr(error.message); return; }
    setSingleAddr(""); setSingleNotes(""); setSingleBoundFp(null); setAddPanel("none");
  }

  // ── Bulk add ──────────────────────────────────────────────────────────────
  // No filtering — send every non-blank line to the backend as-is
  function parseBulkText(raw: string): string[] {
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0); // only skip truly blank lines
  }

  async function handleBulkAdd() {
    const lines = parseBulkText(bulkText);
    if (lines.length === 0) { setBulkErr("No addresses found."); return; }
    if (lines.length > 50000) { setBulkErr("Maximum 50,000 addresses per import."); return; }
    setBulkSaving(true); setBulkErr(""); setBulkResult(null);
    const { data, error } = await supabase.rpc("bulk_insert_addresses", {
      p_addresses: lines, p_notes: bulkNotes.trim() || null,
    });
    setBulkSaving(false);
    if (error) { setBulkErr(error.message); return; }
    const result = data as { ok: boolean; error?: string; total: number; inserted: number; skipped: number };
    if (!result.ok) { setBulkErr(result.error ?? "Import failed"); return; }
    setBulkResult({ total: result.total, inserted: result.inserted, skipped: result.skipped });
    setBulkText(""); setBulkNotes(""); setCsvStats(null); pageCache.current.clear(); setPage(1); await fetchAll(1, true);
  }

  // ── CSV Upload — fully robust parser ─────────────────────────────────────
  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target?.result as string;

      // Use robust parser — gets first column of every row
      const allValues = parseCSVFirstColumn(raw);

      // Detect and skip a single header row if first value looks like a header word
      const headerWords = ["address", "addresses", "street", "location", "addr"];
      let rows = allValues;
      if (rows.length > 0 && headerWords.includes(rows[0].toLowerCase())) {
        rows = rows.slice(1);
      }

      // Only skip completely blank entries — keep everything else including short ones
      const valid = rows.filter((r) => r.length > 0);

      const rawCount   = allValues.length;
      const loadedCount = valid.length;

      setBulkText(valid.join("\n"));
      setBulkResult(null);
      setBulkErr("");
      setCsvStats({ raw: rawCount, loaded: loadedCount });
    };

    reader.onerror = () => {
      setBulkErr("Failed to read the CSV file. Please try again.");
    };

    reader.readAsText(file, "UTF-8");
    e.target.value = ""; // reset so same file can be re-uploaded
  }

  // ── Assign ────────────────────────────────────────────────────────────────
  async function handleAssign() {
    if (!assignTo) { setAssignErr("Select an employee."); return; }
    if (selected.size === 0) { setAssignErr("Select at least one address."); return; }
    setAssigning(true); setAssignErr(""); setAssignMsg("");
    const selectedIds = Array.from(selected);
    const { data, error } = await supabase.rpc("assign_addresses", {
      p_address_ids: selectedIds, p_employee_id: assignTo,
    });
    if (error) { setAssigning(false); setAssignErr(error.message); return; }
    const result = data as { ok: boolean; error?: string; assigned?: number };
    if (!result.ok) { setAssigning(false); setAssignErr(result.error ?? "Assignment failed"); return; }

    // Save category
    if (assignCategory.trim()) {
      const trimmed = assignCategory.trim();
      await supabase.from("address_assignments").update({ category: trimmed })
        .eq("employee_id", assignTo).in("address_id", selectedIds);
      await supabase.from("addresses").update({ notes: trimmed }).in("id", selectedIds);
    }

    // Save Cache / Keywords / Smartlink — locked to these IPs once set
    const hasExtra = assignCache.trim() || assignKeywords.trim() || assignSmartlink.trim();
    if (hasExtra) {
      await supabase.from("address_assignments").update({
        cache:       assignCache.trim()     || null,
        keywords:    assignKeywords.trim()  || null,
        smartlink:   assignSmartlink.trim() || null,
        locked_meta: true,
      }).eq("employee_id", assignTo).in("address_id", selectedIds);
    }

    // Lock selected resource items to these IPs (mark as assigned)
    const idsToLock = [selCacheId, selKwId, selSlId].filter(Boolean);
    if (idsToLock.length > 0) {
      const firstAddr = (virtualMode ? allRows : addresses)
        .find((a) => selectedIds.includes(a.id))?.address ?? null;
      await supabase.from("resource_items")
        .update({ is_assigned: true, assigned_ip: firstAddr, assigned_at: new Date().toISOString() })
        .in("id", idsToLock);
    }

    setAssigning(false);
    setAssignMsg(`✅ ${result.assigned} address${result.assigned !== 1 ? "es" : ""} assigned.`);
    setSelected(new Set()); setShowAssign(false);
    resetAssignState();
    // In virtual mode refresh allRows so assignment + category update immediately.
    // Use the `selectedIds` snapshot — `selected` was cleared above.
    if (virtualMode) {
      const freshRes = await supabase
        .from("addresses_with_employee")
        .select("*")
        .in("id", selectedIds);
      if (freshRes.data) {
        const updatedMap = new Map((freshRes.data as AddressRow[]).map((r) => [r.id, r]));
        setAllRows((prev) => prev.map((r) => updatedMap.get(r.id) ?? r));
      }
    }
    pageCache.current.clear(); await fetchAll(page, true);
  }

  // ── Fetch resource pools for picker ──────────────────────────────────────
  async function fetchResourceItems() {
    setResFetching(true);
    const [cR, kR, sR] = await Promise.all([
      supabase.from("resource_items")
        .select("id, value, notes")
        .eq("type", "cache")
        .eq("is_assigned", false)
        .order("created_at", { ascending: false }),
      supabase.from("resource_items")
        .select("id, value, notes")
        .eq("type", "keywords")
        .eq("is_assigned", false)
        .order("created_at", { ascending: false }),
      supabase.from("resource_items")
        .select("id, value, notes")
        .eq("type", "smartlink")
        .eq("is_assigned", false)
        .order("created_at", { ascending: false }),
    ]);
    setCachePool((cR.data ?? []) as ResourcePickerItem[]);
    setKwPool((kR.data   ?? []) as ResourcePickerItem[]);
    setSlPool((sR.data   ?? []) as ResourcePickerItem[]);
    setResFetching(false);
  }

  // ── Reset all assign modal state ──────────────────────────────────────────
  function resetAssignState() {
    setAssignTo(""); setAssignCategory("");
    setAssignCache(""); setAssignKeywords(""); setAssignSmartlink("");
    setAssignStep("main");
    setSelCacheId(""); setSelKwId(""); setSelSlId("");
    setPickerSearch(""); setPickerTempId(""); setPickerTempVal("");
    setAssignErr(""); setAssignMsg("");
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function openDeleteConfirm(ids: string[]) {
    setDeleteTargetIds(ids);
    setDeleteErr("");
    setShowDeleteConfirm(true);
  }

  async function handleDelete() {
    if (deleteTargetIds.length === 0) return;
    setDeleting(true); setDeleteErr("");

    // Use server-side RPC to avoid URL-length limits with large ID arrays
    const { data, error } = await supabase.rpc("bulk_delete_addresses", {
      p_address_ids: deleteTargetIds,
    });

    setDeleting(false);
    if (error) { setDeleteErr(error.message); return; }
    const result = data as { ok: boolean; error?: string };
    if (!result?.ok) { setDeleteErr(result?.error ?? "Delete failed"); return; }
    setDeleteMsg(`${deleteTargetIds.length} address${deleteTargetIds.length !== 1 ? "es" : ""} deleted.`);
    setSelected((prev) => {
      const n = new Set(prev);
      deleteTargetIds.forEach((id) => n.delete(id));
      return n;
    });
    setHiddenTableIds((prev) => {
      const n = new Set(prev);
      deleteTargetIds.forEach((id) => n.delete(id));
      return n;
    });
    setShowDeleteConfirm(false);
    setDeleteTargetIds([]);
    // Remove from virtual scroll immediately so no stale rows remain
    if (virtualMode) {
      setAllRows((prev) => prev.filter((r) => !deleteTargetIds.includes(r.id)));
    }
    pageCache.current.clear(); await fetchAll(page, true);
    setTimeout(() => setDeleteMsg(""), 4000);
  }

  // ── Derived lists ─────────────────────────────────────────────────────────
  // totalCount comes from DB (state) — reflects true total across all pages
  const pageCount       = addresses.length; // rows on current page
  const assignedCount   = addresses.filter((a) => a.is_assigned).length;
  const unassignedCount = pageCount - assignedCount;
  const totalPages      = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const allFiltered = addresses.filter((a) => {
    const matchFilter =
      filter === "all"        ? true :
      filter === "assigned"   ? a.is_assigned :
      filter === "unassigned" ? !a.is_assigned : true;
    const q = search.trim().toLowerCase();
    const matchSearch = q === "" ||
      a.address.toLowerCase().includes(q) ||
      (a.assigned_employee_name?.toLowerCase().includes(q) ?? false) ||
      (a.assigned_employee_email?.toLowerCase().includes(q) ?? false);
    return matchFilter && matchSearch;
  });

  const displayedTable = allFiltered.filter((a) =>
    showingHiddenTable ? hiddenTableIds.has(a.id) : !hiddenTableIds.has(a.id)
  );

  const workDisplayed = assignments.filter((a) => {
    if (hiddenIds.has(a.id)) return false;
    const matchFilter = workFilter === "all" || a.status === workFilter;
    const q = workSearch.trim().toLowerCase();
    const matchSearch = q === "" ||
      a.address_text.toLowerCase().includes(q) ||
      (a.employee_name?.toLowerCase().includes(q) ?? false);
    return matchFilter && matchSearch;
  });

  const workPending   = assignments.filter((a) => !hiddenIds.has(a.id) && a.status === "Pending").length;
  const workCompleted = assignments.filter((a) => !hiddenIds.has(a.id) && a.status === "Completed").length;
  const workFailed    = assignments.filter((a) => !hiddenIds.has(a.id) && a.status === "Failed").length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: 10 }}>
        <div>
          <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 20, fontWeight: 700 }}>
            Proxy Master List
          </h2>
          <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
            Bulk import, assign, and validate proxy IPs with fingerprint entries (48h cooldown).
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
          {/* View toggle */}
          <div style={{
            display: "flex", background: T.bgInput,
            border: `1px solid ${T.borderInput}`,
            borderRadius: 8, overflow: "hidden",
          }}>
            {(["table", "work"] as MainView[]).map((v) => (
              <button
                key={v}
                onClick={() => setMainView(v)}
                style={{
                  background: mainView === v ? "rgba(142,22,22,0.10)" : "transparent",
                  border: "none",
                  color: mainView === v ? "#8e1616" : T.textMuted,
                  padding: "7px 14px", fontSize: 12,
                  fontWeight: mainView === v ? 600 : 400,
                  cursor: "pointer", fontFamily: "inherit",
                  borderRight: v === "table" ? `1px solid ${T.dividerSolid}` : "none",
                  transition: "all 0.15s",
                }}
              >
                {v === "table" ? "Table" : "Work View"}
              </button>
            ))}
          </div>

          {mainView === "table" && (
            <>
              {selected.size > 0 && (
                <>
                  <button style={S.assignBtn} onClick={() => { resetAssignState(); setShowAssign(true); fetchResourceItems(); }}>
                    Assign {selected.size} →
                  </button>
                  <button style={S.hideSelectedBtn} onClick={hideSelectedTableRows} title="Remove from view only — stays in database">
                    👁 Remove from View ({selected.size})
                  </button>
                  <button style={S.deleteSelectedBtn} onClick={() => openDeleteConfirm(Array.from(selected))} title="Permanently delete from database — cannot be undone">
                    🗑 Delete from DB ({selected.size})
                  </button>
                </>
              )}
              {addresses.length > 0 && selected.size < addresses.length && (
                <button
                  style={{ ...S.hideSelectedBtn, background: "rgba(142,22,22,0.08)", borderColor: "rgba(142,22,22,0.28)", color: "#8e1616" }}
                  onClick={selectAllInDB}
                  title={`Select all ${addresses.length} proxies in database`}
                >
                  ☑ Select All ({addresses.length})
                </button>
              )}
              {hiddenTableIds.size > 0 && (
                <>
                  <button style={S.showHiddenBtn} onClick={() => setShowingHiddenTable((v) => !v)}>
                    {showingHiddenTable ? "Show visible" : `Show hidden (${hiddenTableIds.size})`}
                  </button>
                  <button style={S.restoreBtn} onClick={restoreAllTableRows}>
                    Restore all
                  </button>
                </>
              )}
              {/* Virtual scroll toggle */}
              {!virtualMode ? (
                <button
                  onClick={loadAllForVirtual}
                  disabled={loadingAll}
                  style={{
                    background: loadingAll ? "rgba(142,22,22,0.04)" : "rgba(142,22,22,0.08)",
                    border: "1px solid rgba(142,22,22,0.25)", borderRadius: 8,
                    color: loadingAll ? "#aaaaaa" : "#8e1616",
                    fontSize: 11, fontWeight: 600, padding: "6px 13px",
                    cursor: loadingAll ? "default" : "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {loadingAll
                    ? `Loading… ${loadedCount.toLocaleString()} / ${totalCount.toLocaleString()}`
                    : `Load All ${totalCount > 0 ? `(${totalCount.toLocaleString()})` : ""}`}
                </button>
              ) : (
                <button
                  onClick={() => { setVirtualMode(false); setAllRows([]); }}
                  style={{
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 8, color: "#f87171", fontSize: 11, fontWeight: 600,
                    padding: "6px 13px", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ✕ Exit Virtual View
                </button>
              )}
              <button
                style={addPanel !== "none" ? S.addBtnActive : S.addBtn}
                onClick={() => setAddPanel(addPanel === "none" ? "single" : "none")}
              >
                {addPanel !== "none" ? "✕ Close" : "+ Add Address"}
              </button>
            </>
          )}

          {mainView === "work" && bulkSelected.size > 0 && (
            <button style={S.hideSelectedBtn} onClick={hideBulkSelected}>
              Hide {bulkSelected.size} selected
            </button>
          )}
          {mainView === "work" && hiddenIds.size > 0 && (
            <button style={S.restoreBtn} onClick={showAllWork}>
              Show all ({hiddenIds.size} hidden)
            </button>
          )}
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
        <SummaryChip label="Total (DB)"  count={totalCount}      color="#8e1616" />
        <SummaryChip label="Unassigned" count={unassignedCount} color="#f59e0b" />
        <SummaryChip label="Assigned"   count={assignedCount}   color="#22c55e" />
        {hiddenTableIds.size > 0 && mainView === "table" && (
          <SummaryChip label="Hidden" count={hiddenTableIds.size} color="#4a5166" />
        )}
      </div>

      {assignMsg && <div style={S.successBox}>{assignMsg}</div>}
      {deleteMsg && <div style={S.successBox}>{deleteMsg}</div>}

      {/* ══════════════ TABLE VIEW ══════════════ */}
      {mainView === "table" && (
        <>
          {/* Add panel */}
          {addPanel !== "none" && (
            <div style={{ ...S.addPanelCard, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>
              <div style={{ ...S.panelTabs, borderBottom: `1px solid ${T.dividerSolid}` }}>
                {(["single", "bulk"] as const).map((p) => (
                  <button
                    key={p}
                    style={addPanel === p ? S.panelTabActive : { ...S.panelTab, color: T.textMuted }}
                    onClick={() => { setAddPanel(p); setBulkResult(null); setBulkErr(""); setSingleErr(""); setCsvStats(null); }}
                  >
                    {p === "single" ? "Single Add" : "Bulk Add / Import"}
                  </button>
                ))}
                <button style={{ ...S.panelClose, color: T.textMuted }} onClick={() => { setAddPanel("none"); setBulkResult(null); setCsvStats(null); }}>✕</button>
              </div>

              {addPanel === "single" && (
                <div style={S.panelBody}>
                  <label style={S.label}>Proxy IP <span style={{ color: "#ef4444" }}>*</span></label>
                  <div style={{ position: "relative" as const }}>
                    <input
                      style={{ ...S.input, width: "100%", boxSizing: "border-box" as const }}
                      value={singleAddr}
                      onChange={(e) => handleSingleAddrChange(e.target.value)}
                      placeholder="e.g. 192.168.1.1"
                    />
                    {singleFpChecking && (
                      <span style={{
                        position: "absolute" as const, right: 10, top: "50%", transform: "translateY(-50%)",
                        color: "#4a5166", fontSize: 10,
                      }}>checking…</span>
                    )}
                  </div>

                  {/* Bound fingerprint warning — shown regardless of cooldown */}
                  {singleBoundFp && (
                    <div style={{
                      display: "flex", flexDirection: "column" as const, gap: 6,
                      background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)",
                      borderRadius: 8, padding: "10px 12px",
                    }}>
                      <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>
                        ⚠ This IP is already bound with a fingerprint
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code style={{
                          flex: 1, color: "#fbbf24", fontSize: 11.5,
                          fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                          wordBreak: "break-all" as const,
                        }}>
                          {singleBoundFp}
                        </code>
                        <AddrCopyButton value={singleBoundFp} />
                      </div>
                    </div>
                  )}

                  <label style={S.label}>Category (optional)</label>
                  <input style={S.input} value={singleNotes} onChange={(e) => setSingleNotes(e.target.value)} placeholder="e.g. US Residential, Datacenter…" />
                  {singleErr && <div style={S.errorBox}>⚠ {singleErr}</div>}
                  <div style={S.panelActions}>
                    <button style={S.cancelBtn} onClick={() => { setAddPanel("none"); setSingleBoundFp(null); }}>Cancel</button>
                    <button style={singleSaving ? S.submitBtnDisabled : S.submitBtn} onClick={handleSingleAdd} disabled={singleSaving}>
                      {singleSaving ? "Saving…" : "Save Address"}
                    </button>
                  </div>
                </div>
              )}

              {addPanel === "bulk" && (
                <div style={S.panelBody}>
                  <label style={S.label}>Paste proxy IPs — one per line (up to 50,000)</label>
                  <textarea
                    style={S.textarea}
                    value={bulkText}
                    onChange={(e) => { setBulkText(e.target.value); setBulkResult(null); setCsvStats(null); }}
                    placeholder={"123 Main Street\n456 High Street\n789 Park Lane"}
                    rows={8}
                  />

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Category for all (optional)</label>
                      <input style={S.input} value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} placeholder="e.g. US Residential, Datacenter…" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={S.label}>Or upload CSV</label>
                      <button style={S.csvBtn} onClick={() => fileInputRef.current?.click()}>📄 Upload CSV</button>
                      <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleCSVUpload} />
                    </div>
                  </div>

                  {/* CSV load stats — shown after upload */}
                  {csvStats && (
                    <div style={S.csvStats}>
                      <span style={{ color: "#8e1616", fontSize: 12, fontWeight: 600 }}>📄 CSV loaded</span>
                      <span style={{ color: "#8b92a8", fontSize: 11 }}>
                        {csvStats.loaded} address{csvStats.loaded !== 1 ? "es" : ""} ready to import
                        {csvStats.raw !== csvStats.loaded
                          ? ` (${csvStats.raw - csvStats.loaded} blank/header rows skipped)`
                          : " — all rows included"}
                      </span>
                    </div>
                  )}

                  {bulkText.trim() && !csvStats && (
                    <div style={S.bulkPreview}>{parseBulkText(bulkText).length} proxy IPs detected</div>
                  )}

                  {bulkErr    && <div style={S.errorBox}>⚠ {bulkErr}</div>}
                  {bulkResult && (
                    <div style={S.bulkResult}>
                      <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>✅ Import Complete</span>
                      <div style={{ display: "flex", gap: 20 }}>
                        <ResultStat label="Total"    value={bulkResult.total}    color="#8b92a8" />
                        <ResultStat label="Imported" value={bulkResult.inserted} color="#22c55e" />
                        <ResultStat label="Skipped"  value={bulkResult.skipped}  color="#f59e0b" />
                      </div>
                      {bulkResult.skipped > 0 && (
                        <span style={{ color: "#4a5166", fontSize: 11 }}>
                          Skipped = exact duplicates already in the database.
                        </span>
                      )}
                    </div>
                  )}

                  <div style={S.panelActions}>
                    <button style={S.cancelBtn} onClick={() => { setAddPanel("none"); setBulkResult(null); setCsvStats(null); }}>Close</button>
                    <button
                      style={bulkSaving || parseBulkText(bulkText).length === 0 ? S.submitBtnDisabled : S.submitBtn}
                      onClick={handleBulkAdd}
                      disabled={bulkSaving || parseBulkText(bulkText).length === 0}
                    >
                      {bulkSaving ? "Importing…" : `Import ${parseBulkText(bulkText).length} Proxies`}
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
                  onClick={() => { setFilter(f); setSelected(new Set()); setPage(1); }}
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
              placeholder="Search address or employee…"
            />
          </div>

          {/* Selection tools */}
          {displayedTable.length > 0 && (
            <div style={{ ...S.selectionTools, background: T.bgInput, border: `1px solid ${T.borderInput}` }}>
              <div style={S.selToolGroup}>
                <span style={{ ...S.selToolLabel, color: T.textMuted }}>Select first N:</span>
                <input style={S.selInput} type="number" min={1} value={selectN} onChange={(e) => setSelectN(e.target.value)} placeholder="100" />
                <button style={S.selBtn} onClick={selectFirstN}>Select</button>
              </div>
              <div style={S.selToolGroup}>
                <span style={{ ...S.selToolLabel, color: T.textMuted }}>Range:</span>
                <input style={S.selInput} type="number" min={1} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="From" />
                <span style={{ color: T.textMuted, fontSize: 11 }}>–</span>
                <input style={S.selInput} type="number" min={1} value={rangeTo}   onChange={(e) => setRangeTo(e.target.value)}   placeholder="To" />
                <button style={S.selBtn} onClick={selectRange}>Select</button>
              </div>
              {selected.size > 0 && (
                <button style={S.clearSelBtn} onClick={clearSelection}>Clear ({selected.size})</button>
              )}
            </div>
          )}

          {/* Hidden rows status bar */}
          {(hiddenTableIds.size > 0 || showingHiddenTable) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: T.bgInput, border: `1px solid ${T.borderInput}`,
              borderRadius: 7, padding: "7px 12px",
            }}>
              <span style={{ color: T.textMuted, fontSize: 11 }}>
                {hiddenTableIds.size} row{hiddenTableIds.size !== 1 ? "s" : ""} hidden from view
                {showingHiddenTable ? " (showing hidden)" : ""}
              </span>
              <button
                onClick={() => setShowingHiddenTable((v) => !v)}
                style={{ background: T.bgBtn, border: `1px solid ${T.borderBtn}`, borderRadius: 5, color: T.textSecondary, fontSize: 11, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit" }}
              >
                {showingHiddenTable ? "← Back to visible" : "View hidden"}
              </button>
              <button
                onClick={restoreAllTableRows}
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 5, color: "#22c55e", fontSize: 11, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit" }}
              >
                Restore all
              </button>
            </div>
          )}

          {/* ── Virtual scroll table ─────────────────────────────────────── */}
          {virtualMode && (() => {
            const vsFiltered = allRows.filter((a) => {
              if (hiddenTableIds.has(a.id)) return false;
              const matchFilter =
                filter === "assigned"   ? a.is_assigned :
                filter === "unassigned" ? !a.is_assigned : true;
              const q = search.trim().toLowerCase();
              const matchSearch = q === "" ||
                a.address.toLowerCase().includes(q) ||
                (a.assigned_employee_name?.toLowerCase().includes(q) ?? false) ||
                (a.assigned_employee_email?.toLowerCase().includes(q) ?? false) ||
                (a.notes?.toLowerCase().includes(q) ?? false);
              return matchFilter && matchSearch;
            });
            const containerPxH = window.innerHeight - 310;
            const totalVsH     = vsFiltered.length * VS_ROW_H;
            const startIdx     = Math.max(0, Math.floor(vsScrollTop / VS_ROW_H) - VS_OVERSCAN);
            const endIdx       = Math.min(vsFiltered.length - 1,
              Math.floor((vsScrollTop + containerPxH) / VS_ROW_H) + VS_OVERSCAN);
            const visibleRows  = vsFiltered.slice(startIdx, endIdx + 1);

            const COL = { cb: 36, num: 36, addr: 260, notes: 120, status: 90, emp: 130, date: 90, re: 60, act: 80 };
            const hdStyle: React.CSSProperties = {
              padding: "8px 10px", fontSize: 10, fontWeight: 600,
              color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.8,
              borderBottom: `1px solid ${T.dividerSolid}`,
              background: T.bgTableHeader, textAlign: "left" as const,
              whiteSpace: "nowrap",
            };

            return (
              <div style={{ ...S.tableCard, padding: 0, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>
                {/* Sticky header */}
                <div style={{ display: "flex", background: T.bgTableHeader, borderBottom: `1px solid ${T.dividerSolid}`, flexShrink: 0 }}>
                  {[
                    { w: COL.cb,   label: <input type="checkbox" checked={selected.size === vsFiltered.length && vsFiltered.length > 0} onChange={() => { selected.size === vsFiltered.length ? setSelected(new Set()) : setSelected(new Set(vsFiltered.map(a => a.id))); }} style={{ cursor: "pointer" }} /> },
                    { w: COL.num,  label: "#" },
                    { w: COL.addr, label: "Proxy IP" },
                    { w: COL.notes,label: "Category" },
                    { w: COL.status,label:"Status" },
                    { w: COL.emp,  label: "Assigned To" },
                    { w: COL.date, label: "Assigned At" },
                    { w: COL.re,   label: "Re-assigned" },
                    { w: COL.act,  label: "" },
                  ].map((col, i) => (
                    <div key={i} style={{ ...hdStyle, width: col.w, flexShrink: 0 }}>{col.label}</div>
                  ))}
                </div>

                {/* Scrollable virtual body */}
                <div
                  ref={vsContainerRef}
                  onScroll={(e) => setVsScrollTop(e.currentTarget.scrollTop)}
                  style={{ height: VS_H, overflowY: "auto", position: "relative" }}
                >
                  {/* Spacer div — gives total scroll height */}
                  <div style={{ height: totalVsH, position: "relative" }}>
                    {visibleRows.map((addr, i) => {
                      const absIdx   = startIdx + i;
                      const isSel    = selected.has(addr.id);
                      const empName  = addr.is_assigned
                        ? (addr.assigned_employee_name || addr.assigned_employee_email || addr.assigned_to || "Unknown")
                        : null;
                      const cellStyle: React.CSSProperties = {
                        padding: "0 10px", fontSize: 12, color: T.textSecondary,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        display: "flex", alignItems: "center",
                      };
                      return (
                        <div key={addr.id} style={{
                          position: "absolute", top: absIdx * VS_ROW_H,
                          left: 0, right: 0, height: VS_ROW_H,
                          display: "flex", alignItems: "center",
                          background: isSel
                            ? T.bgTableRowSelected
                            : addr.is_assigned
                              ? (isLight ? "rgba(16,185,129,0.03)" : "#0d1a10")
                              : "transparent",
                          borderBottom: `1px solid ${T.borderTableRow}`,
                        }}>
                          <div style={{ ...cellStyle, width: COL.cb, flexShrink: 0 }}>
                            <input type="checkbox" checked={isSel} onChange={() => toggleOne(addr.id)} style={{ cursor: "pointer" }} />
                          </div>
                          <div style={{ ...cellStyle, width: COL.num, flexShrink: 0, color: T.textMuted, fontSize: 10 }}>{absIdx + 1}</div>
                          <div style={{ ...cellStyle, width: COL.addr, flexShrink: 0, color: T.textPrimary }}>{addr.address}</div>
                          <div style={{ ...cellStyle, width: COL.notes, flexShrink: 0, fontSize: 11, color: T.textMuted }}>{addr.notes || "—"}</div>
                          <div style={{ ...cellStyle, width: COL.status, flexShrink: 0 }}>
                            <span style={addr.is_assigned ? { ...S.badge, ...S.badgeAssigned } : { ...S.badge, ...S.badgeUnassigned }}>
                              {addr.is_assigned ? "Assigned" : "Unassigned"}
                            </span>
                          </div>
                          <div style={{ ...cellStyle, width: COL.emp, flexShrink: 0, fontSize: 11 }}>
                            {empName ? <span style={{ color: T.textSecondary }}>{empName}</span> : <span style={{ color: T.textMuted }}>—</span>}
                          </div>
                          <div style={{ ...cellStyle, width: COL.date, flexShrink: 0, fontSize: 11, color: T.textMuted }}>
                            {addr.assigned_at ? new Date(addr.assigned_at).toLocaleDateString() : "—"}
                          </div>
                          <div style={{ ...cellStyle, width: COL.re, flexShrink: 0, fontSize: 11, color: addr.reassigned_count > 0 ? "#f59e0b" : T.textMuted }}>
                            {addr.reassigned_count > 0 ? `${addr.reassigned_count}×` : "—"}
                          </div>
                          <div style={{ ...cellStyle, width: COL.act, flexShrink: 0, gap: 4 }}>
                            <button onClick={(e) => hideTableRow(addr.id, e)} title="Remove from view"
                              style={{ background: "none", border: `1px solid ${T.borderBtn}`, borderRadius: 4, color: T.textMuted, fontSize: 10, padding: "2px 5px", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                            <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm([addr.id]); }} title="Delete from DB"
                              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, color: "#ef4444", fontSize: 10, padding: "2px 5px", cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer count */}
                <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.dividerSolid}`, color: T.textMuted, fontSize: 11 }}>
                  Showing all <strong style={{ color: T.textSecondary }}>{vsFiltered.length.toLocaleString()}</strong> proxies
                  {selected.size > 0 && <span style={{ marginLeft: 12, color: "#8e1616" }}>{selected.size.toLocaleString()} selected</span>}
                </div>
              </div>
            );
          })()}

          {/* Table (paginated — shown when not in virtual mode) */}
          {!virtualMode && <div style={{ ...S.tableCard, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>
            {loading ? (
              <div style={S.msg}>Loading…</div>
            ) : displayedTable.length === 0 ? (
              <div style={S.msg}>
                {showingHiddenTable ? "No hidden rows." :
                 search ? `No proxies match "${search}"` :
                 filter === "unassigned" ? "No unassigned proxies." :
                 filter === "assigned"   ? "No assigned proxies yet." :
                 hiddenTableIds.size === allFiltered.length && allFiltered.length > 0
                   ? "All rows hidden. Click \"View hidden\" or \"Restore all\" to see them."
                   : "No proxies yet."}
              </div>
            ) : (
              <table style={{ ...S.table, color: T.textPrimary }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 36, background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>
                      <input
                        type="checkbox"
                        checked={selected.size === displayedTable.length && displayedTable.length > 0}
                        onChange={toggleAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ ...S.th, width: 28, background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>#</th>
                    {["Proxy IP", "Category", "Status", "Assigned To", "Assigned At", "Re-assigned", ""].map((h) => (
                      <th key={h} style={{ ...S.th, background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedTable.map((addr, idx) => {
                    const isSelected = selected.has(addr.id);
                    const employeeDisplay = addr.is_assigned
                      ? (addr.assigned_employee_name || addr.assigned_employee_email || addr.assigned_to || "Unknown")
                      : null;

                    return (
                      <tr key={addr.id} style={{
                        ...S.tr,
                        borderBottom: `1px solid ${T.borderTableRow}`,
                        background: isSelected
                          ? T.bgTableRowSelected
                          : addr.is_assigned
                            ? (isLight ? "rgba(16,185,129,0.03)" : "#0d1a10")
                            : undefined,
                        opacity: showingHiddenTable ? 0.7 : 1,
                      }}>
                        <td style={S.td}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleOne(addr.id)} style={{ cursor: "pointer" }} />
                        </td>
                        <td style={{ ...S.td, color: T.textMuted, fontSize: 10 }}>{idx + 1}</td>
                        <td style={{ ...S.td, color: T.textPrimary }}>{addr.address}</td>
                        <td style={{ ...S.td, color: T.textMuted, fontSize: 11 }}>{addr.notes || "—"}</td>
                        <td style={S.td}>
                          {addr.is_assigned
                            ? <span style={{ ...S.badge, ...S.badgeAssigned }}>Assigned</span>
                            : <span style={{ ...S.badge, ...S.badgeUnassigned }}>Unassigned</span>
                          }
                          {addr.reassigned_count > 0 && (
                            <span style={S.reassignedPill}>↺ {addr.reassigned_count}</span>
                          )}
                        </td>
                        <td style={S.td}>
                          {employeeDisplay
                            ? <span style={{ color: T.textSecondary, fontSize: 11 }}>{employeeDisplay}</span>
                            : <span style={{ color: T.textMuted, fontSize: 11 }}>—</span>}
                        </td>
                        <td style={{ ...S.td, color: T.textMuted, fontSize: 11 }}>
                          {addr.assigned_at ? new Date(addr.assigned_at).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ ...S.td, color: addr.reassigned_count > 0 ? "#f59e0b" : T.textMuted, fontSize: 11 }}>
                          {addr.reassigned_count > 0 ? `${addr.reassigned_count}×` : "—"}
                        </td>
                        <td style={{ ...S.td, width: 80 }}>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {!showingHiddenTable && (
                              <button
                                onClick={(e) => hideTableRow(addr.id, e)}
                                title="Hide row (does not delete data)"
                                style={{
                                  background: "none", border: `1px solid ${T.borderBtn}`,
                                  borderRadius: 4, color: T.textMuted, fontSize: 10,
                                  padding: "2px 6px", cursor: "pointer", fontFamily: "inherit",
                                }}
                              >
                                ✕
                              </button>
                            )}
                            {showingHiddenTable && (
                              <button
                                onClick={() => {
                                  setHiddenTableIds((prev) => {
                                    const n = new Set(prev); n.delete(addr.id); return n;
                                  });
                                }}
                                title="Restore this row"
                                style={{
                                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
                                  borderRadius: 4, color: "#22c55e", fontSize: 10,
                                  padding: "2px 6px", cursor: "pointer", fontFamily: "inherit",
                                }}
                              >
                                ↩
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); openDeleteConfirm([addr.id]); }}
                              title="Delete from DB permanently"
                              style={{
                                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                                borderRadius: 4, color: "#ef4444", fontSize: 10,
                                padding: "2px 6px", cursor: "pointer", fontFamily: "inherit",
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>}

          {/* ── Pagination (hidden in virtual mode) ── */}
          {!virtualMode && totalCount > PAGE_SIZE && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 14, padding: "14px 0 4px",
            }}>
              <button
                onClick={() => { const p = Math.max(1, page - 1); setPage(p); setSelected(new Set()); }}
                disabled={page === 1}
                style={{
                  background: page === 1 ? "transparent" : "rgba(142,22,22,0.08)",
                  border: "1px solid rgba(142,22,22,0.22)", borderRadius: 7,
                  color: page === 1 ? T.textMuted : "#8e1616", fontSize: 12, fontWeight: 600,
                  padding: "6px 16px", cursor: page === 1 ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                ← Prev
              </button>
              <span style={{ color: T.textSecondary, fontSize: 12 }}>
                Page <strong style={{ color: T.textPrimary }}>{page}</strong> of <strong style={{ color: T.textPrimary }}>{totalPages}</strong>
                <span style={{ color: T.textMuted, marginLeft: 8 }}>
                  ({((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()})
                </span>
              </span>
              <button
                onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); setSelected(new Set()); }}
                disabled={page === totalPages}
                style={{
                  background: page === totalPages ? "transparent" : "rgba(142,22,22,0.08)",
                  border: "1px solid rgba(142,22,22,0.22)", borderRadius: 7,
                  color: page === totalPages ? T.textMuted : "#8e1616", fontSize: 12, fontWeight: 600,
                  padding: "6px 16px", cursor: page === totalPages ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* ══════════════ WORK VIEW ══════════════ */}
      {mainView === "work" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
            <WorkStatCard label="Visible"   value={workDisplayed.length} color="#8e1616" />
            <WorkStatCard label="Pending"   value={workPending}          color="#f59e0b" />
            <WorkStatCard label="Completed" value={workCompleted}        color="#22c55e" />
            <WorkStatCard label="Failed"    value={workFailed}           color="#ef4444" />
          </div>

          {workMsg && <div style={S.successBox}>✅ {workMsg}</div>}
          {workErr && <div style={S.errorBox}>⚠ {workErr}</div>}

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["all", "Pending", "Completed", "Failed"] as const).map((f) => {
                const count =
                  f === "all"       ? workDisplayed.length :
                  f === "Pending"   ? workPending :
                  f === "Completed" ? workCompleted : workFailed;
                return (
                  <button
                    key={f}
                    style={workFilter === f ? S.filterTabActive : { ...S.filterTab, border: `1px solid ${T.borderBtn}`, color: T.textMuted }}
                    onClick={() => setWorkFilter(f)}
                  >
                    {f === "all" ? "All" : f}
                    <span style={{
                      background: workFilter === f ? "rgba(142,22,22,0.12)" : T.bgBtn,
                      color: workFilter === f ? "#8e1616" : T.textMuted,
                      borderRadius: 99, padding: "1px 6px", fontSize: 10, marginLeft: 4,
                    }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ position: "relative" as const, display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute" as const, left: 10, color: T.textMuted, fontSize: 14, pointerEvents: "none" as const }}>⌕</span>
              <input
                style={{ ...S.searchInput, paddingLeft: 30, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }}
                value={workSearch}
                onChange={(e) => setWorkSearch(e.target.value)}
                placeholder="Search address or employee…"
              />
            </div>
            {bulkSelected.size > 0 && (
              <span style={{ color: T.textMuted, fontSize: 11 }}>{bulkSelected.size} selected</span>
            )}
          </div>

          {workLoading ? (
            <LoadingSkeleton />
          ) : workDisplayed.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 12, padding: "50px 20px", color: T.textMuted, fontSize: 13, textAlign: "center" as const,
            }}>
              <span style={{ fontSize: 36 }}>
                {hiddenIds.size > 0 ? "👁" : workSearch ? "🔍" : "📭"}
              </span>
              <span>
                {hiddenIds.size > 0 && workDisplayed.length === 0
                  ? `All ${hiddenIds.size} items hidden. Click "Show all" to restore.`
                  : workSearch ? `No results for "${workSearch}"` : "No assigned proxies to show."}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {workDisplayed.map((a, i) => (
                <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={bulkSelected.has(a.id)}
                    onChange={() => {
                      setBulkSelected((prev) => {
                        const n = new Set(prev);
                        n.has(a.id) ? n.delete(a.id) : n.add(a.id);
                        return n;
                      });
                    }}
                    style={{ marginTop: 16, cursor: "pointer", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <AddressWorkCard
                      assignmentId={a.id}
                      addressText={a.address_text}
                      category={a.category}
                      status={a.status}
                      assignedAt={a.assigned_at}
                      employeeName={a.employee_name}
                      onHide={hideOne}
                      onStatusChange={handleStatusChange}
                      updatingId={updatingId}
                      animDelay={Math.min(i * 0.03, 0.2)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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
                ⚠ This will <strong>permanently delete</strong> {deleteTargetIds.length} address{deleteTargetIds.length !== 1 ? "es" : ""} from the database.
                This cannot be undone.
              </div>
              {deleteTargetIds.some((id) => (virtualMode ? allRows : addresses).find((a) => a.id === id)?.is_assigned) && (
                <div style={S.reassignWarn}>
                  ⚠ Some selected proxies are currently assigned. Deleting them will also remove their assignment records.
                </div>
              )}
              {deleteErr && <div style={S.errorBox}>⚠ {deleteErr}</div>}
            </div>
            <div style={{ ...S.modalFooter, borderTop: `1px solid ${T.dividerSolid}` }}>
              <button style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button
                style={deleting ? S.submitBtnDisabled : S.deleteBtnSolid}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : `Delete ${deleteTargetIds.length} Address${deleteTargetIds.length !== 1 ? "es" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Assign modal — stepped wizard ══════ */}
      {showAssign && (() => {
        // ── Picker helper ──────────────────────────────────────────────────
        const pickerMeta: Record<"pick_cache"|"pick_keywords"|"pick_smartlink", {
          title: string; pool: ResourcePickerItem[]; stateVal: string;
          onConfirm: (id: string, val: string) => void; onClear: () => void;
        }> = {
          pick_cache: {
            title: "Select Cache",
            pool:  cachePool,
            stateVal: assignCache,
            onConfirm: (id, val) => { setAssignCache(val); setSelCacheId(id); setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); },
            onClear:   ()       => { setAssignCache(""); setSelCacheId(""); setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); },
          },
          pick_keywords: {
            title: "Select Keywords",
            pool:  kwPool,
            stateVal: assignKeywords,
            onConfirm: (id, val) => { setAssignKeywords(val); setSelKwId(id); setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); },
            onClear:   ()       => { setAssignKeywords(""); setSelKwId(""); setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); },
          },
          pick_smartlink: {
            title: "Select Smartlink",
            pool:  slPool,
            stateVal: assignSmartlink,
            onConfirm: (id, val) => { setAssignSmartlink(val); setSelSlId(id); setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); },
            onClear:   ()       => { setAssignSmartlink(""); setSelSlId(""); setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); },
          },
        };

        const isPicker = assignStep !== "main";
        const pm = isPicker ? pickerMeta[assignStep as keyof typeof pickerMeta] : null;

        const filteredPool = pm
          ? pm.pool.filter((item) => {
              const q = pickerSearch.trim().toLowerCase();
              return q === "" || item.value.toLowerCase().includes(q) || (item.notes?.toLowerCase().includes(q) ?? false);
            })
          : [];

        return (
          <div style={S.modalOverlay}>
            <div style={{
              ...S.modal,
              background: T.bgCardAlt, border: `1px solid ${T.borderCard}`,
              maxWidth: 520,
              maxHeight: "88vh",
              display: "flex", flexDirection: "column",
            }}>

              {/* ── Modal header ── */}
              <div style={{ ...S.modalHeader, borderBottom: `1px solid ${T.dividerSolid}`, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isPicker && (
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, padding: "2px 6px 2px 0", fontSize: 14, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}
                      onClick={() => { setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); }}
                    >
                      ← Back
                    </button>
                  )}
                  <span style={{ ...S.modalTitle, color: T.textPrimary }}>
                    {isPicker ? pm!.title : `Assign ${selected.size} Proxy IP${selected.size !== 1 ? "s" : ""}`}
                  </span>
                </div>
                <button style={{ ...S.closeBtn, color: T.textMuted }} onClick={() => { setShowAssign(false); resetAssignState(); }}>✕</button>
              </div>

              {/* ══════ MAIN STEP ══════ */}
              {assignStep === "main" && (
                <>
                  <div style={{ ...S.modalBody, overflowY: "auto", flex: 1 }}>
                    {Array.from(selected).some((id) => (virtualMode ? allRows : addresses).find((a) => a.id === id)?.is_assigned) && (
                      <div style={S.reassignWarn}>
                        ⚠ Some selected proxies are already assigned. Confirming will <strong>reassign</strong> them.
                      </div>
                    )}

                    {/* IP count badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(142,22,22,0.05)", border: "1px solid rgba(142,22,22,0.18)", borderRadius: 8 }}>
                      <span style={{ color: "#8e1616", fontWeight: 700, fontSize: 13 }}>{selected.size}</span>
                      <span style={{ color: T.textMuted, fontSize: 12 }}>proxy IP{selected.size !== 1 ? "s" : ""} selected for assignment</span>
                    </div>

                    {/* Category */}
                    <div>
                      <label style={{ ...S.label, color: T.textMuted }}>Category (optional)</label>
                      <input
                        style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary, width: "100%", marginTop: 4 }}
                        value={assignCategory}
                        onChange={(e) => setAssignCategory(e.target.value)}
                        placeholder="e.g. US Residential, Datacenter…"
                        autoComplete="off"
                      />
                    </div>

                    {/* ── Resource selectors ── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      <div style={{ color: T.textMuted, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                        Linked Resources (optional — locked to IP once assigned)
                      </div>

                      {(["pick_cache", "pick_keywords", "pick_smartlink"] as const).map((stepKey) => {
                        const info = pickerMeta[stepKey];
                        const label = stepKey === "pick_cache" ? "Cache" : stepKey === "pick_keywords" ? "Keywords" : "Smartlink";
                        const pool  = stepKey === "pick_cache" ? cachePool : stepKey === "pick_keywords" ? kwPool : slPool;
                        const hasVal = !!info.stateVal.trim();

                        return (
                          <div key={stepKey} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 12px",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            background: hasVal ? "rgba(34,197,94,0.04)" : "transparent",
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600 }}>{label}</div>
                              {hasVal ? (
                                <div style={{ color: "#22c55e", fontSize: 11, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                  ✓ {info.stateVal}
                                </div>
                              ) : (
                                <div style={{ color: T.textMuted, fontSize: 10.5, marginTop: 1 }}>
                                  {resFetching ? "Loading pool…" : pool.length === 0 ? "No items available — upload first" : `${pool.length} item${pool.length !== 1 ? "s" : ""} available`}
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              {hasVal && (
                                <button
                                  onClick={info.onClear}
                                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 5, color: "#ef4444", fontSize: 10, padding: "4px 8px", cursor: "pointer", fontFamily: "inherit" }}
                                >
                                  ✕ Clear
                                </button>
                              )}
                              <button
                                disabled={resFetching || pool.length === 0}
                                onClick={() => {
                                  setPickerSearch("");
                                  setPickerTempId(
                                    stepKey === "pick_cache" ? selCacheId :
                                    stepKey === "pick_keywords" ? selKwId : selSlId
                                  );
                                  setPickerTempVal(info.stateVal);
                                  setAssignStep(stepKey);
                                }}
                                style={{
                                  background: resFetching || pool.length === 0 ? "transparent" : "rgba(142,22,22,0.08)",
                                  border: `1px solid ${resFetching || pool.length === 0 ? "rgba(0,0,0,0.10)" : "rgba(142,22,22,0.28)"}`,
                                  borderRadius: 5, color: resFetching || pool.length === 0 ? T.textMuted : "#8e1616",
                                  fontSize: 10, fontWeight: 600, padding: "4px 10px",
                                  cursor: resFetching || pool.length === 0 ? "not-allowed" : "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                {hasVal ? "Change →" : "Select →"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {(assignCache || assignKeywords || assignSmartlink) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(142,22,22,0.04)", border: "1px solid rgba(142,22,22,0.14)", borderRadius: 7, padding: "7px 10px", fontSize: 10.5, color: "#8e1616" }}>
                        Selected resources will be <strong>locked</strong> to these IPs — cannot be reused with any other IP.
                      </div>
                    )}

                    {/* Employee */}
                    <div>
                      <label style={{ ...S.label, color: T.textMuted, marginBottom: 4 }}>Assign to Employee</label>
                      <select
                        style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary, width: "100%", marginTop: 4 }}
                        value={assignTo}
                        onChange={(e) => setAssignTo(e.target.value)}
                      >
                        <option value="">— Select employee —</option>
                        {employees.filter((e) => e.status === "active").map((e) => (
                          <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
                        ))}
                      </select>
                    </div>

                    {assignErr && <div style={S.errorBox}>⚠ {assignErr}</div>}
                  </div>

                  <div style={{ ...S.modalFooter, borderTop: `1px solid ${T.dividerSolid}`, flexShrink: 0 }}>
                    <button style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => { setShowAssign(false); resetAssignState(); }}>Cancel</button>
                    <button style={assigning ? S.submitBtnDisabled : S.submitBtn} onClick={handleAssign} disabled={assigning}>
                      {assigning ? "Assigning…" : "Confirm Assign"}
                    </button>
                  </div>
                </>
              )}

              {/* ══════ PICKER STEP ══════ */}
              {isPicker && pm && (
                <>
                  {/* Search */}
                  <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.dividerSolid}`, flexShrink: 0 }}>
                    <input
                      autoFocus
                      style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary, width: "100%", boxSizing: "border-box" as const }}
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder={`Search ${pm.title.toLowerCase().replace("select ", "")}…`}
                    />
                  </div>

                  {/* Item list */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                    {filteredPool.length === 0 ? (
                      <div style={{ color: T.textMuted, padding: "24px 16px", textAlign: "center", fontSize: 12 }}>
                        {pickerSearch ? `No results for "${pickerSearch}"` : `No unassigned items found. Upload some from the ${pm.title.replace("Select ", "")} page first.`}
                      </div>
                    ) : (
                      filteredPool.map((item) => {
                        const isSel = pickerTempId === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => { setPickerTempId(item.id); setPickerTempVal(item.value); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              padding: "10px 16px", cursor: "pointer",
                              background: isSel
                                ? "rgba(142,22,22,0.06)"
                                : "transparent",
                              borderLeft: `3px solid ${isSel ? "#8e1616" : "transparent"}`,
                              transition: "background 0.12s ease",
                            }}
                            onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                            onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                          >
                            {/* Radio dot */}
                            <div style={{
                              width: 16, height: 16, borderRadius: "50%",
                              border: `2px solid ${isSel ? "#8e1616" : "rgba(0,0,0,0.20)"}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0, transition: "border-color 0.12s",
                            }}>
                              {isSel && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#8e1616" }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: T.textPrimary, fontSize: 12, fontWeight: isSel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                {item.value}
                              </div>
                              {item.notes && (
                                <div style={{ color: T.textMuted, fontSize: 10.5, marginTop: 1 }}>{item.notes}</div>
                              )}
                            </div>
                            {isSel && <span style={{ color: "#8e1616", fontSize: 13, flexShrink: 0 }}>✓</span>}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Picker footer */}
                  <div style={{ ...S.modalFooter, borderTop: `1px solid ${T.dividerSolid}`, flexShrink: 0 }}>
                    <div style={{ flex: 1, color: T.textMuted, fontSize: 11 }}>
                      {filteredPool.length} item{filteredPool.length !== 1 ? "s" : ""} available
                      {pickerTempId && <span style={{ color: "#8e1616", marginLeft: 8 }}>1 selected</span>}
                    </div>
                    <button
                      style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }}
                      onClick={() => { setAssignStep("main"); setPickerSearch(""); setPickerTempId(""); setPickerTempVal(""); }}
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!pickerTempId}
                      style={!pickerTempId ? S.submitBtnDisabled : S.submitBtn}
                      onClick={() => { if (pickerTempId && pickerTempVal) pm.onConfirm(pickerTempId, pickerTempVal); }}
                    >
                      Use Selected
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Utility sub-components ────────────────────────────────────────────────────

function AddrCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement("textarea");
        el.value = value; el.style.position = "fixed"; el.style.opacity = "0";
        document.body.appendChild(el); el.focus(); el.select();
        document.execCommand("copy"); document.body.removeChild(el);
      }
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* silent */ }
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy fingerprint"
      style={{
        flexShrink: 0,
        background: copied ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.1)",
        border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
        borderRadius: 6, color: copied ? "#22c55e" : "#f59e0b",
        fontSize: 10, fontWeight: 700, padding: "4px 10px",
        cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.2s",
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function SummaryChip({ label, count, color }: { label: string; count: number; color: string }) {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${color}33`,
      borderRadius: 10, padding: "8px 16px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 80,
    }}>
      <span style={{ color, fontSize: 20, fontWeight: 700 }}>{count}</span>
      <span style={{ color: T.textMuted, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
        {label}
      </span>
    </div>
  );
}

function WorkStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const { T } = useTheme();
  return (
    <div style={{
      flex: 1, minWidth: 80,
      background: T.bgCard, border: `1px solid ${T.borderCard}`,
      borderRadius: 10, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ color, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{value}</span>
      <span style={{ color: T.textMuted, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
        {label}
      </span>
    </div>
  );
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</span>
      <span style={{ color: T.textMuted, fontSize: 10 }}>{label}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          height: 60, borderRadius: 12,
          background: "#141826", border: "1px solid rgba(255,255,255,0.05)",
          backgroundImage: "linear-gradient(90deg, #141826 25%, #1a2035 50%, #141826 75%)",
          backgroundSize: "200% 100%",
          animation: `shimmer 1.5s infinite ${i * 0.15}s`,
        }} />
      ))}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  addBtn: {
    background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)", border: "none", color: "#fff",
    borderRadius: 7, padding: "9px 16px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(142,22,22,0.22)",
  },
  addBtnActive: {
    background: "rgba(142,22,22,0.08)", border: "1px solid rgba(142,22,22,0.28)", color: "#8e1616",
    borderRadius: 7, padding: "9px 16px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  assignBtn: {
    background: "rgba(142,22,22,0.08)", border: "1px solid rgba(142,22,22,0.28)", color: "#8e1616",
    borderRadius: 7, padding: "9px 14px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  hideSelectedBtn: {
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444",
    borderRadius: 7, padding: "7px 13px", fontSize: 12, fontWeight: 600,
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
  showHiddenBtn: {
    background: "transparent", border: "1px solid rgba(0,0,0,0.12)", color: "#444466",
    borderRadius: 7, padding: "7px 13px", fontSize: 12,
    cursor: "pointer", fontFamily: "inherit",
  },
  restoreBtn: {
    background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e",
    borderRadius: 7, padding: "7px 13px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  addPanelCard: {
    background: "#141826", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10, overflow: "hidden",
  },
  panelTabs: { display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  panelTab: {
    background: "none", border: "none", color: "#4a5166",
    padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
    borderBottom: "2px solid transparent",
  },
  panelTabActive: {
    background: "none", border: "none", color: "#8e1616",
    padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
    borderBottom: "2px solid #8e1616", fontWeight: 600,
  },
  panelClose: {
    background: "none", border: "none", color: "#4a5166",
    marginLeft: "auto", padding: "10px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  },
  panelBody:    { padding: "1.1rem", display: "flex", flexDirection: "column", gap: 8 },
  panelActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 },
  filterBar:    { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const },
  filterTabs:   { display: "flex", gap: 4 },
  filterTab: {
    display: "inline-flex", alignItems: "center",
    background: "none", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 8, color: "#4a5166", fontSize: 12,
    padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
  },
  filterTabActive: {
    display: "inline-flex", alignItems: "center",
    background: "rgba(142,22,22,0.08)", border: "1px solid rgba(142,22,22,0.28)",
    borderRadius: 8, color: "#8e1616", fontSize: 12, fontWeight: 600,
    padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
  },
  searchInput: {
    background: "#141826", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 8, color: "#f0f2f8", fontSize: 12,
    padding: "7px 12px", outline: "none", minWidth: 200, fontFamily: "inherit",
  },
  selectionTools: {
    display: "flex", gap: 14, flexWrap: "wrap" as const, alignItems: "center",
    background: "#0f1320", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8, padding: "8px 12px",
  },
  selToolGroup: { display: "flex", alignItems: "center", gap: 6 },
  selToolLabel: { color: "#4a5166", fontSize: 11 },
  selInput: {
    background: "#141826", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5,
    color: "#f0f2f8", padding: "4px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", width: 64,
  },
  selBtn: {
    background: "transparent", border: "1px solid rgba(142,22,22,0.22)", color: "#8e1616",
    borderRadius: 5, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
  },
  clearSelBtn: {
    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444",
    borderRadius: 5, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
  },
  tableCard: {
    background: "#141826", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10, overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse", fontFamily: "inherit", fontSize: 12 },
  th: {
    background: "#0f1320", color: "#4a5166", textAlign: "left",
    padding: "10px 12px", fontWeight: 600, fontSize: 10,
    letterSpacing: 1, textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  tr:   { borderBottom: "1px solid rgba(255,255,255,0.04)" },
  td:   { padding: "10px 12px", color: "#c9d1e0", verticalAlign: "middle" },
  badge: {
    display: "inline-block", padding: "2px 8px", borderRadius: 4,
    border: "1px solid", fontSize: 10, fontWeight: 600,
  },
  badgeAssigned:   { background: "rgba(34,197,94,0.1)",  color: "#22c55e", borderColor: "rgba(34,197,94,0.3)" },
  badgeUnassigned: { background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)" },
  reassignedPill: {
    marginLeft: 6, display: "inline-block",
    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
    color: "#f59e0b", borderRadius: 4, padding: "1px 6px", fontSize: 9,
  },
  label: { color: "#4a5166", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  input: {
    background: "#0f1320", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
    color: "#f0f2f8", padding: "9px 10px", fontSize: 13,
    fontFamily: "inherit", outline: "none",
  },
  textarea: {
    background: "#0f1320", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
    color: "#f0f2f8", padding: "9px 10px", fontSize: 12,
    fontFamily: "inherit", outline: "none", resize: "vertical",
    width: "100%", boxSizing: "border-box", lineHeight: 1.6,
  },
  cancelBtn: {
    background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#4a5166",
    borderRadius: 6, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  },
  submitBtn: {
    background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)", border: "none", color: "#fff",
    borderRadius: 6, padding: "8px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    boxShadow: "0 2px 8px rgba(142,22,22,0.22)",
  },
  submitBtnDisabled: {
    background: "rgba(255,255,255,0.04)", border: "none", color: "#2e3347",
    borderRadius: 6, padding: "8px 20px", fontSize: 12, fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit",
  },
  csvBtn: {
    background: "transparent", border: "1px solid rgba(142,22,22,0.22)", color: "#8e1616",
    borderRadius: 5, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  },
  csvStats: {
    background: "rgba(142,22,22,0.04)", border: "1px solid rgba(142,22,22,0.14)",
    borderRadius: 8, padding: "10px 14px",
    display: "flex", flexDirection: "column", gap: 4,
  },
  bulkPreview: {
    background: "rgba(142,22,22,0.04)", border: "1px solid rgba(142,22,22,0.12)",
    borderRadius: 5, padding: "6px 10px", color: "#8e1616", fontSize: 11,
  },
  bulkResult: {
    background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)",
    borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
  },
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, fontFamily: "inherit",
  },
  modal: {
    background: "#141826", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14,
    width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
    display: "flex", flexDirection: "column",
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "1rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  modalTitle: { color: "#f0f2f8", fontWeight: 700, fontSize: 14 },
  closeBtn:   { background: "none", border: "none", color: "#4a5166", cursor: "pointer", fontSize: 16 },
  modalBody:  { padding: "1.1rem", display: "flex", flexDirection: "column", gap: 10 },
  modalFooter: {
    display: "flex", justifyContent: "flex-end", gap: 10,
    padding: "1rem 1.25rem", borderTop: "1px solid rgba(255,255,255,0.07)",
  },
  reassignWarn: {
    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b",
    borderRadius: 6, padding: "8px 12px", fontSize: 12, lineHeight: 1.6,
  },
  successBox: {
    background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e",
    borderRadius: 8, padding: "10px 14px", fontSize: 13,
  },
  errorBox: {
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444",
    borderRadius: 8, padding: "10px 14px", fontSize: 13,
  },
  msg: { color: "#4a5166", padding: "2rem", textAlign: "center", fontSize: 13 },
};