// src/pages/WorkspacePage.tsx
// Admin's private workspace: personal notes + encrypted vault.
//   • Notes are stored in plaintext (RLS keeps them owner-only).
//   • Vault items are encrypted in the browser via Web Crypto (AES-GCM 256 + PBKDF2).
//     The master passphrase NEVER leaves the browser; the server only sees ciphertext.
//   • A "verification" sentinel item proves the passphrase is correct on unlock.
//
// IMPORTANT: if you forget your master passphrase the vault is unrecoverable.
// There is intentionally no reset path — anyone with reset power would also be
// able to read everything.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { encryptString, decryptString, VAULT_SENTINEL } from "../lib/crypto";

type Tab = "notes" | "vault";

interface Note {
  id:         string;
  user_id:    string;
  title:      string;
  content:    string | null;
  pinned:     boolean;
  created_at: string;
  updated_at: string;
}

interface VaultRow {
  id:             string;
  user_id:        string;
  folder:         string;
  name:           string;
  item_type:      string;
  encrypted_data: string;
  iv:             string;
  salt:           string;
  created_at:     string;
  updated_at:     string;
}

export default function WorkspacePage() {
  const { T } = useTheme();
  const [tab, setTab] = useState<Tab>("notes");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: T.textPrimary }}>
      <div>
        <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
          Workspace
        </h2>
        <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
          Your private space — personal notes and an encrypted vault. Only you can read what's here.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.dividerSolid}` }}>
        {([
          { id: "notes" as Tab, label: "📝 Notes" },
          { id: "vault" as Tab, label: "🔒 Encrypted Vault" },
        ]).map(({ id, label }) => (
          <button key={id}
            onClick={() => setTab(id)}
            style={{
              background: "none", border: "none",
              borderBottom: tab === id ? "2px solid #8e1616" : "2px solid transparent",
              color: tab === id ? "#8e1616" : T.textMuted,
              padding: "11px 16px 9px",
              fontSize: 12.5, fontWeight: tab === id ? 600 : 400,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "notes" && <NotesPanel />}
      {tab === "vault" && <VaultPanel />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  NOTES PANEL
// ═══════════════════════════════════════════════════════════════════════════

function NotesPanel() {
  const { T } = useTheme();
  const [notes, setNotes]     = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [search, setSearch]   = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (u?.user) {
      const { data } = await supabase
        .from("workspace_notes")
        .select("*")
        .eq("user_id", u.user.id)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (data) setNotes(data as Note[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function startNew() {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { data, error } = await supabase
      .from("workspace_notes")
      .insert({ user_id: u.user.id, title: "Untitled note", content: "" })
      .select()
      .single();
    if (!error && data) {
      setNotes((prev) => [data as Note, ...prev]);
      setEditing(data as Note);
    }
  }

  async function saveNote(n: Note) {
    const { error } = await supabase
      .from("workspace_notes")
      .update({ title: n.title, content: n.content, pinned: n.pinned, updated_at: new Date().toISOString() })
      .eq("id", n.id);
    if (!error) {
      setNotes((prev) => prev.map((x) => x.id === n.id ? n : x));
      setEditing(null);
    }
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    await supabase.from("workspace_notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((x) => x.id !== id));
    if (editing?.id === id) setEditing(null);
  }

  const filtered = notes.filter((n) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || (n.content?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          style={{ ...input(T), flex: "1 1 240px" }}
        />
        <button onClick={startNew} style={primaryBtn}>+ New Note</button>
      </div>

      {loading ? (
        <Empty T={T}>Loading…</Empty>
      ) : filtered.length === 0 ? (
        <Empty T={T}>{notes.length === 0 ? "No notes yet. Click '+ New Note' to start." : "No notes match your search."}</Empty>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {filtered.map((n) => (
            <div key={n.id} onClick={() => setEditing(n)}
              style={{
                background: T.bgCard, border: `1px solid ${T.borderCard}`,
                borderLeft: n.pinned ? "3px solid #f59e0b" : `1px solid ${T.borderCard}`,
                borderRadius: 10, padding: "12px 14px",
                cursor: "pointer", boxShadow: T.shadowCard,
                display: "flex", flexDirection: "column", gap: 6,
                minHeight: 110,
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {n.title || "Untitled"}
                </span>
                {n.pinned && <span style={{ color: "#f59e0b", fontSize: 11 }}>📌</span>}
              </div>
              <p style={{
                margin: 0, color: T.textMuted, fontSize: 11.5, lineHeight: 1.5,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              }}>
                {n.content || "(empty)"}
              </p>
              <span style={{ color: T.textTertiary, fontSize: 9.5, marginTop: "auto" }}>
                {new Date(n.updated_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && <NoteEditor note={editing} onSave={saveNote} onCancel={() => setEditing(null)} onDelete={deleteNote} />}
    </div>
  );
}

function NoteEditor({ note, onSave, onCancel, onDelete }: {
  note: Note;
  onSave:   (n: Note) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const { T } = useTheme();
  const [title, setTitle]   = useState(note.title);
  const [content, setContent] = useState(note.content ?? "");
  const [pinned, setPinned] = useState(note.pinned);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: T.bgCardAlt, border: `1px solid ${T.borderCard}`,
        borderRadius: 14, padding: 22, width: "100%", maxWidth: 640,
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            autoFocus
            style={{ ...input(T), fontSize: 15, fontWeight: 600 }}
          />
          <button onClick={() => setPinned((p) => !p)}
            title={pinned ? "Unpin" : "Pin"}
            style={{ background: pinned ? "rgba(245,158,11,0.15)" : T.bgBtn,
              border: `1px solid ${pinned ? "rgba(245,158,11,0.35)" : T.borderBtn}`,
              color: pinned ? "#f59e0b" : T.textMuted,
              borderRadius: 7, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
            📌
          </button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your note…"
          rows={14}
          style={{ ...input(T), resize: "vertical", fontFamily: "inherit", minHeight: 240, lineHeight: 1.6 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button onClick={() => onDelete(note.id)} style={dangerBtn}>🗑 Delete</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={secondaryBtn(T)}>Cancel</button>
            <button onClick={() => onSave({ ...note, title, content, pinned })} style={primaryBtn}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ENCRYPTED VAULT PANEL
// ═══════════════════════════════════════════════════════════════════════════

function VaultPanel() {
  const { T } = useTheme();
  const [loading, setLoading]     = useState(true);
  const [rows, setRows]           = useState<VaultRow[]>([]);
  const [hasSentinel, setHasSent] = useState<boolean | null>(null);

  // Unlocked state: holds the passphrase in memory until the user "locks"
  // or closes the page. Cleared when navigating away from the workspace.
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [pwInput, setPwInput]       = useState("");
  const [pwConfirm, setPwConfirm]   = useState("");
  const [unlocking, setUnlocking]   = useState(false);
  const [err, setErr]               = useState("");

  // Add/view item state
  const [showForm, setShowForm]     = useState(false);
  const [editing,  setEditing]      = useState<{ row: VaultRow; decrypted: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (u?.user) {
      const { data } = await supabase
        .from("workspace_vault_items")
        .select("*")
        .eq("user_id", u.user.id)
        .order("folder")
        .order("name");
      if (data) {
        setRows(data as VaultRow[]);
        setHasSent((data as VaultRow[]).some((r) => r.item_type === "verification"));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Clear passphrase on tab unmount (basic lock)
  useEffect(() => { return () => { setPassphrase(null); }; }, []);

  // ── First-time setup: create the sentinel item ──
  async function handleSetup() {
    setErr("");
    if (pwInput.length < 10) { setErr("Master passphrase must be at least 10 characters."); return; }
    if (pwInput !== pwConfirm) { setErr("Passphrases do not match."); return; }
    setUnlocking(true);
    try {
      const blob = await encryptString(VAULT_SENTINEL, pwInput);
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error("Not signed in.");
      const { error } = await supabase.from("workspace_vault_items").insert({
        user_id:        u.user.id,
        folder:         "_system",
        name:           "_verification",
        item_type:      "verification",
        encrypted_data: blob.ciphertext,
        iv:             blob.iv,
        salt:           blob.salt,
      });
      if (error) throw error;
      setPassphrase(pwInput);
      setPwInput(""); setPwConfirm("");
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Setup failed");
    } finally { setUnlocking(false); }
  }

  // ── Returning user: verify passphrase against sentinel ──
  async function handleUnlock() {
    setErr("");
    const sentinel = rows.find((r) => r.item_type === "verification");
    if (!sentinel) { setErr("No verification record. Recreate vault."); return; }
    setUnlocking(true);
    try {
      const text = await decryptString(
        { ciphertext: sentinel.encrypted_data, iv: sentinel.iv, salt: sentinel.salt },
        pwInput
      );
      if (text !== VAULT_SENTINEL) throw new Error("Wrong passphrase.");
      setPassphrase(pwInput);
      setPwInput("");
    } catch {
      setErr("Wrong passphrase.");
    } finally { setUnlocking(false); }
  }

  function lock() {
    setPassphrase(null);
    setEditing(null);
    setShowForm(false);
  }

  async function saveItem(item: {
    id?: string; folder: string; name: string; item_type: string; plaintext: string;
  }) {
    if (!passphrase) return;
    const blob = await encryptString(item.plaintext, passphrase);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    if (item.id) {
      await supabase.from("workspace_vault_items").update({
        folder: item.folder, name: item.name, item_type: item.item_type,
        encrypted_data: blob.ciphertext, iv: blob.iv, salt: blob.salt,
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
    } else {
      await supabase.from("workspace_vault_items").insert({
        user_id:        u.user.id,
        folder:         item.folder || "General",
        name:           item.name,
        item_type:      item.item_type,
        encrypted_data: blob.ciphertext, iv: blob.iv, salt: blob.salt,
      });
    }
    setShowForm(false); setEditing(null);
    await refresh();
  }

  async function openItem(row: VaultRow) {
    if (!passphrase) return;
    try {
      const text = await decryptString(
        { ciphertext: row.encrypted_data, iv: row.iv, salt: row.salt },
        passphrase
      );
      setEditing({ row, decrypted: text });
    } catch {
      alert("Failed to decrypt — passphrase may have changed mid-session.");
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    await supabase.from("workspace_vault_items").delete().eq("id", id);
    await refresh();
    setEditing(null);
  }

  if (loading) return <Empty T={T}>Loading vault…</Empty>;

  // ── NOT YET SET UP ──
  if (hasSentinel === false) {
    return (
      <VaultGate T={T} title="Create your vault"
        description="Set a master passphrase. It will encrypt every item with AES-GCM-256.
                     The passphrase NEVER leaves this device and CANNOT be recovered if forgotten."
        err={err}>
        <input type="password" autoFocus placeholder="Master passphrase (min 10 chars)"
          value={pwInput} onChange={(e) => setPwInput(e.target.value)}
          style={input(T)} />
        <input type="password" placeholder="Confirm passphrase"
          value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
          style={input(T)} />
        <button onClick={handleSetup} disabled={unlocking || !pwInput || pwInput !== pwConfirm}
          style={primaryBtn}>
          {unlocking ? "Creating…" : "🔒 Create vault"}
        </button>
      </VaultGate>
    );
  }

  // ── LOCKED ──
  if (!passphrase) {
    return (
      <VaultGate T={T} title="Unlock your vault"
        description="Enter your master passphrase to decrypt the items."
        err={err}>
        <input type="password" autoFocus placeholder="Master passphrase"
          value={pwInput} onChange={(e) => setPwInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleUnlock(); }}
          style={input(T)} />
        <button onClick={handleUnlock} disabled={unlocking || !pwInput} style={primaryBtn}>
          {unlocking ? "Verifying…" : "🔓 Unlock"}
        </button>
      </VaultGate>
    );
  }

  // ── UNLOCKED — show items ──
  const visible = rows.filter((r) => r.item_type !== "verification");
  const byFolder: Record<string, VaultRow[]> = {};
  visible.forEach((r) => { (byFolder[r.folder] ||= []).push(r); });
  const folders = Object.keys(byFolder).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 8,
      }}>
        <span style={{ color: T.textSecondary, fontSize: 12 }}>
          🔓 Vault unlocked · {visible.length} item{visible.length !== 1 ? "s" : ""} across {folders.length} folder{folders.length !== 1 ? "s" : ""}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={lock} style={secondaryBtn(T)}>🔒 Lock</button>
          <button onClick={() => { setShowForm(true); setEditing(null); }} style={primaryBtn}>+ Add Item</button>
        </div>
      </div>

      {showForm && (
        <VaultItemForm T={T}
          existingFolders={folders}
          onSave={(it) => saveItem(it)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editing && (
        <VaultItemForm T={T}
          existingFolders={folders}
          initial={{
            id:        editing.row.id,
            folder:    editing.row.folder,
            name:      editing.row.name,
            item_type: editing.row.item_type,
            plaintext: editing.decrypted,
          }}
          onSave={(it) => saveItem(it)}
          onCancel={() => setEditing(null)}
          onDelete={() => deleteItem(editing.row.id)}
        />
      )}

      {visible.length === 0 ? (
        <Empty T={T}>Your vault is empty. Click "+ Add Item" to store your first secret.</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {folders.map((folder) => (
            <div key={folder}>
              <div style={{
                color: T.textMuted, fontSize: 10, fontWeight: 700,
                letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6,
              }}>📁 {folder}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {byFolder[folder].map((r) => (
                  <button key={r.id} onClick={() => openItem(r)}
                    style={{
                      background: T.bgCard, border: `1px solid ${T.borderCard}`,
                      borderRadius: 10, padding: "12px 14px",
                      display: "flex", flexDirection: "column", gap: 4,
                      textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      boxShadow: T.shadowCard,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{typeIcon(r.item_type)}</span>
                      <span style={{ color: T.textPrimary, fontSize: 12.5, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.name}
                      </span>
                    </div>
                    <span style={{ color: T.textMuted, fontSize: 9.5 }}>
                      {r.item_type} · {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VaultGate({ T, title, description, err, children }: {
  T:           ReturnType<typeof useTheme>["T"];
  title:       string;
  description: string;
  err:         string;
  children:    React.ReactNode;
}) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.borderCard}`,
      borderRadius: 14, padding: "28px 26px",
      display: "flex", flexDirection: "column", gap: 14,
      maxWidth: 460, margin: "0 auto", boxShadow: T.shadowCard,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 24 }}>🔒</span>
        <h3 style={{ margin: 0, color: T.textPrimary, fontSize: 16, fontWeight: 700 }}>{title}</h3>
      </div>
      <p style={{ margin: 0, color: T.textSecondary, fontSize: 12.5, lineHeight: 1.6 }}>{description}</p>
      {children}
      {err && (
        <div style={{
          background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)",
          color: "#f43f5e", borderRadius: 8, padding: "9px 12px", fontSize: 12,
        }}>⚠ {err}</div>
      )}
    </div>
  );
}

function VaultItemForm({ T, existingFolders, initial, onSave, onCancel, onDelete }: {
  T: ReturnType<typeof useTheme>["T"];
  existingFolders: string[];
  initial?: { id: string; folder: string; name: string; item_type: string; plaintext: string };
  onSave: (it: { id?: string; folder: string; name: string; item_type: string; plaintext: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [folder, setFolder]     = useState(initial?.folder ?? "General");
  const [newFolder, setNewF]    = useState("");
  const [name, setName]         = useState(initial?.name ?? "");
  const [itemType, setItemType] = useState(initial?.item_type ?? "password");
  const [plaintext, setPlain]   = useState(initial?.plaintext ?? "");
  const [reveal, setReveal]     = useState(false);

  const finalFolder = newFolder.trim() || folder || "General";

  function save() {
    if (!name.trim() || !plaintext) return;
    onSave({
      id:        initial?.id,
      folder:    finalFolder,
      name:      name.trim(),
      item_type: itemType,
      plaintext: plaintext,
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      backdropFilter: "blur(8px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: T.bgCardAlt, border: `1px solid ${T.borderCard}`,
        borderRadius: 14, padding: 22, width: "100%", maxWidth: 520,
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <h3 style={{ margin: 0, color: T.textPrimary, fontSize: 15, fontWeight: 700 }}>
            {initial ? "Edit secure item" : "Add secure item"}
          </h3>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Folder" flex="1 1 160px">
            <select value={folder} onChange={(e) => setFolder(e.target.value)} style={input(T)}>
              {existingFolders.length === 0 && <option value="General">General</option>}
              {existingFolders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="…or new folder" flex="1 1 160px">
            <input value={newFolder} onChange={(e) => setNewF(e.target.value)}
              placeholder="Leave empty to use selected" style={input(T)} />
          </Field>
          <Field label="Type" flex="0 1 140px">
            <select value={itemType} onChange={(e) => setItemType(e.target.value)} style={input(T)}>
              <option value="password">🔑 Password</option>
              <option value="key">🔐 API key / token</option>
              <option value="card">💳 Card</option>
              <option value="note">📝 Secure note</option>
            </select>
          </Field>
        </div>

        <Field label="Name *" flex="1 1 100%">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={itemType === "password" ? "e.g. GitHub admin login" : "Item name"}
            style={input(T)} autoFocus />
        </Field>

        <Field label="Content *" flex="1 1 100%">
          <div style={{ position: "relative" }}>
            <textarea
              value={plaintext}
              onChange={(e) => setPlain(e.target.value)}
              placeholder={
                itemType === "password" ? "Password or full credential text…" :
                itemType === "key"      ? "Paste API key or token…"           :
                itemType === "card"     ? "Card number / details…"            :
                                          "Secure note content…"
              }
              rows={6}
              style={{
                ...input(T),
                resize: "vertical", fontFamily: "'JetBrains Mono', monospace",
                minHeight: 120, paddingRight: 60,
                WebkitTextSecurity: reveal ? "none" : "disc",
              } as React.CSSProperties}
            />
            <button type="button" onClick={() => setReveal((v) => !v)}
              style={{
                position: "absolute", top: 6, right: 6,
                background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
                color: T.textMuted, borderRadius: 5,
                padding: "2px 8px", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit",
              }}>
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          {onDelete && <button onClick={onDelete} style={dangerBtn}>🗑 Delete</button>}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={onCancel} style={secondaryBtn(T)}>Cancel</button>
            <button onClick={save} disabled={!name.trim() || !plaintext} style={primaryBtn}>
              {initial ? "Save changes" : "Encrypt & Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── shared atoms ────────────────────────────────────────────────────────────

function typeIcon(t: string): string {
  return t === "password" ? "🔑"
       : t === "key"      ? "🔐"
       : t === "card"     ? "💳"
       : t === "note"     ? "📝"
       :                    "❓";
}

function input(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return {
    background: T.bgInput, border: `1px solid ${T.borderInput}`,
    color: T.textPrimary, borderRadius: 8, padding: "10px 12px",
    fontSize: 12.5, fontFamily: "inherit", outline: "none",
    width: "100%", boxSizing: "border-box",
  };
}

function Field({ label, flex, children }: { label: string; flex: string; children: React.ReactNode }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex }}>
      <label style={{ color: T.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 0.7, textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Empty({ T, children }: { T: ReturnType<typeof useTheme>["T"]; children: React.ReactNode }) {
  return (
    <div style={{
      background: T.bgInput, border: `1px solid ${T.borderInput}`,
      borderRadius: 10, padding: 40, textAlign: "center" as const,
      color: T.textMuted, fontSize: 13,
    }}>{children}</div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
  border: "none", color: "#fff",
  borderRadius: 8, padding: "9px 18px",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 4px 16px rgba(142,22,22,0.28)",
};
function secondaryBtn(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return {
    background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
    color: T.textSecondary, borderRadius: 8, padding: "9px 16px",
    fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
  };
}
const dangerBtn: React.CSSProperties = {
  background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)",
  color: "#f43f5e", borderRadius: 8, padding: "9px 14px",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
