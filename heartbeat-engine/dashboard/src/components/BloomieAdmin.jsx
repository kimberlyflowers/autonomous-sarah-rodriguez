import { useState, useEffect, useRef, useCallback } from "react";
import ReferenceLibrary from "./ReferenceLibrary.jsx";
import { supabase } from "../supabase.js";

const BLOOMIE_API = "https://njfhzabmaxhfzekbzpzz.supabase.co/functions/v1/bloomie-chat";
const SUPABASE_URL = "https://njfhzabmaxhfzekbzpzz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZmh6YWJtYXhoZnpla2J6cHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjYwMjMsImV4cCI6MjA4ODQwMjAyM30.QPTQhnlfZtmfQVm75GqG0Oazmyb7USjYBdLEy_G-iqU";

const hdrs = { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function tenantHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) };
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

const priorityColors = { urgent: "#ea4335", high: "#E76F8B", medium: "#F4A261", low: "#34A853" };
const statusColors = { open: "#5B8FF9", in_progress: "#F4A261", resolved: "#34A853", closed: "#888" };
const modeLabels = { sales: "Sales", support: "Support" };

/* ═══════════════════════════════════════════════════════════════
   INBOX — All visitor conversations with respond-as-Bloomie
   ═══════════════════════════════════════════════════════════════ */
function Inbox({ c, mob }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [cannedAnswers, setCannedAnswers] = useState([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const fetchChats = useCallback(async () => {
    try {
      const r = await fetch(BLOOMIE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_chats", limit: 100 }),
      });
      const d = await r.json();
      setChats(d.chats || []);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChats();
    pollRef.current = setInterval(fetchChats, 8000);
    return () => clearInterval(pollRef.current);
  }, [fetchChats]);

  useEffect(() => {
    tenantHeaders()
      .then(headers => fetch('/api/bloomie-admin/support-answers', { headers }))
      .then(response => response.json())
      .then(payload => setCannedAnswers(payload.answers || []))
      .catch(() => setCannedAnswers([]));
  }, []);

  // When a chat is selected, refresh it for latest messages
  const openChat = async (chat) => {
    setSelected(chat);
    try {
      const r = await fetch(BLOOMIE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_chat", session_id: chat.session_id }),
      });
      const d = await r.json();
      if (d.chat) setSelected(d.chat);
    } catch { }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      const r = await fetch(BLOOMIE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin_reply", session_id: selected.session_id, message: reply.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        // Update local state
        const msgs = typeof d.messages === "string" ? JSON.parse(d.messages) : d.messages;
        setSelected((p) => ({ ...p, messages: msgs }));
        setReply("");
      }
    } catch { }
    setSending(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const messages = selected
    ? typeof selected.messages === "string"
      ? JSON.parse(selected.messages)
      : selected.messages || []
    : [];

  // Get last message preview for inbox list
  const getPreview = (chat) => {
    const msgs = typeof chat.messages === "string" ? JSON.parse(chat.messages) : chat.messages || [];
    if (msgs.length === 0) return "No messages";
    const last = msgs[msgs.length - 1];
    const text = last.text || last.content || "";
    return text.length > 80 ? text.slice(0, 80) + "..." : text;
  };

  const getMsgCount = (chat) => {
    const msgs = typeof chat.messages === "string" ? JSON.parse(chat.messages) : chat.messages || [];
    return msgs.length;
  };

  // Detail view
  if (selected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + c.ln, display: "flex", alignItems: "center", gap: 10, background: c.cd }}>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: c.ac, cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.tx }}>
              {selected.visitor_name || selected.session_id?.slice(0, 16) || "Visitor"}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
              <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: selected.mode === "sales" ? c.ac + "18" : c.a2 + "18", color: selected.mode === "sales" ? c.ac : c.a2 }}>
                {modeLabels[selected.mode] || selected.mode}
              </span>
              {selected.employee && (
                <span style={{ fontSize: 11, color: c.so }}>via {selected.employee}</span>
              )}
              <span style={{ fontSize: 11, color: c.so }}>{messages.length} messages</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: mob ? 10 : 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ maxWidth: "80%", position: "relative" }}>
                {m.admin && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: c.pu, marginBottom: 2, paddingLeft: 4 }}>You (as Bloomie)</div>
                )}
                <div style={{
                  padding: "9px 13px",
                  borderRadius: 12,
                  background: m.role === "user" ? c.ac + "15" : m.admin ? c.pu + "12" : c.sf,
                  border: m.admin ? "1px solid " + c.pu + "30" : m.role === "user" ? "1px solid " + c.ac + "25" : "1px solid " + c.ln,
                  color: c.tx,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}>
                  {m.text || m.content}
                </div>
                {m.source && (
                  <div style={{ fontSize: 10, color: c.so, marginTop: 2, paddingLeft: 4 }}>
                    {m.source === "kb" ? "KB match" : m.source === "llm" ? "Gemini" : m.source === "admin" ? "Admin" : m.source}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Reply as Bloomie */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid " + c.ln, background: c.cd }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: c.pu, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            Reply as Bloomie
          </div>
          {cannedAnswers.length > 0 && (
            <select defaultValue="" onChange={e => { const answer = cannedAnswers.find(item => item.id === e.target.value); if (answer) setReply(answer.answer); e.target.value = ""; }} style={{ width: "100%", marginBottom: 7, padding: "8px 10px", borderRadius: 8, border: "1px solid " + c.ln, background: c.inp, color: c.tx, fontSize: 12 }}>
              <option value="">Insert a support answer…</option>
              {cannedAnswers.map(answer => <option key={answer.id} value={answer.id}>{answer.question}</option>)}
            </select>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendReply(); }}
              placeholder="Type a response as Bloomie..."
              style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.inp, color: c.tx, fontSize: 13, outline: "none" }}
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: reply.trim() ? "linear-gradient(135deg,#A78BFA,#7C3AED)" : c.ln, color: "#fff", fontSize: 12, fontWeight: 600, cursor: reply.trim() ? "pointer" : "default", opacity: sending ? 0.6 : 1 }}
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inbox list
  return (
    <div style={{ padding: mob ? 12 : 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: c.so }}>{chats.length} conversation{chats.length !== 1 ? "s" : ""}</div>
        <button onClick={() => { setLoading(true); fetchChats(); }} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + c.ln, background: c.cd, color: c.so, fontSize: 11, cursor: "pointer" }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: c.so, fontSize: 13 }}>Loading conversations...</div>
      ) : chats.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#F4A261,#E76F8B)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.tx, marginBottom: 4 }}>No conversations yet</div>
          <div style={{ fontSize: 12, color: c.so, lineHeight: 1.6 }}>When visitors chat with Bloomie on your site, their conversations will appear here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {chats.map((ch) => (
            <div
              key={ch.id}
              onClick={() => openChat(ch)}
              style={{ padding: "12px 14px", borderRadius: 10, background: c.cd, border: "1px solid " + c.ln, cursor: "pointer", transition: "border-color .15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = c.ac + "50")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = c.ln)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: ch.mode === "sales" ? c.ac + "18" : c.a2 + "18", color: ch.mode === "sales" ? c.ac : c.a2 }}>
                  {modeLabels[ch.mode] || ch.mode}
                </span>
                {ch.employee && <span style={{ fontSize: 11, color: c.so }}>{ch.employee}</span>}
                <span style={{ fontSize: 11, color: c.so, marginLeft: "auto" }}>{getMsgCount(ch)} msgs</span>
                <span style={{ fontSize: 11, color: c.so }}>{timeAgo(ch.updated_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: c.tx, fontWeight: 500 }}>
                {ch.visitor_name || ch.session_id?.slice(0, 20) || "Visitor"}
              </div>
              <div style={{ fontSize: 12, color: c.so, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {getPreview(ch)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TICKET MANAGEMENT
   ═══════════════════════════════════════════════════════════════ */
function TicketManager({ c, mob }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};
      const url = `/api/bloomie-admin/tickets${filter !== "all" ? `?status=${encodeURIComponent(filter)}` : ""}`;
      const r = await fetch(url, { headers });
      const d = await r.json();
      setTickets(Array.isArray(d.tickets) ? d.tickets : []);
    } catch { setTickets([]); }
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, [filter]);

  const updateTicket = async (id, updates) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) };
    await fetch(`/api/bloomie-admin/tickets/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(updates),
    });
    fetchTickets();
    if (selected?.id === id) setSelected((p) => ({ ...p, ...updates }));
  };

  const filters = [
    { k: "all", l: "All" },
    { k: "open", l: "Open" },
    { k: "in_progress", l: "In Progress" },
    { k: "resolved", l: "Resolved" },
    { k: "closed", l: "Closed" },
  ];

  if (selected) {
    return (
      <div style={{ padding: mob ? 12 : 20 }}>
        <button onClick={() => setSelected(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: c.ac, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
          Back to tickets
        </button>

        <div style={{ padding: 20, borderRadius: 14, background: c.cd, border: "1px solid " + c.ln, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.so }}>#{selected.ticket_number}</span>
            <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: (statusColors[selected.status] || "#888") + "18", color: statusColors[selected.status] || "#888" }}>
              {selected.status?.replace("_", " ")}
            </span>
            <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: (priorityColors[selected.priority] || "#888") + "18", color: priorityColors[selected.priority] || "#888" }}>
              {selected.priority}
            </span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: c.tx, marginBottom: 8 }}>{selected.subject}</h2>
          <p style={{ fontSize: 13, color: c.so, lineHeight: 1.7, marginBottom: 16 }}>{selected.description}</p>
          {selected.reporter_name && (
            <div style={{ fontSize: 12, color: c.so, marginBottom: 4 }}>Reporter: <span style={{ color: c.tx, fontWeight: 600 }}>{selected.reporter_name}</span> {selected.reporter_email && `(${selected.reporter_email})`}</div>
          )}
          <div style={{ fontSize: 12, color: c.so }}>Created: {new Date(selected.created_at).toLocaleString()}</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {selected.status === "open" && (
            <button onClick={() => updateTicket(selected.id, { status: "in_progress" })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#F4A261", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Start Working</button>
          )}
          {(selected.status === "open" || selected.status === "in_progress") && (
            <button onClick={() => updateTicket(selected.id, { status: "resolved", resolution_notes: note || null })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#34A853", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Resolve</button>
          )}
          {selected.status !== "closed" && (
            <button onClick={() => updateTicket(selected.id, { status: "closed" })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: c.ln, color: c.tx, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Close</button>
          )}
          {selected.status === "closed" && (
            <button onClick={() => updateTicket(selected.id, { status: "open" })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#5B8FF9", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Reopen</button>
          )}
        </div>

        <div style={{ padding: 16, borderRadius: 14, background: c.cd, border: "1px solid " + c.ln }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 8 }}>Resolution Notes</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add notes about resolution..." rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.inp, color: c.tx, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
          <button onClick={() => updateTicket(selected.id, { resolution_notes: note })} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, border: "none", background: c.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save Notes</button>
        </div>

        {selected.chat_history && selected.chat_history.length > 0 && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: c.cd, border: "1px solid " + c.ln }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 12 }}>Chat History</div>
            {selected.chat_history.map((m, i) => (
              <div key={i} style={{ marginBottom: 8, padding: "8px 12px", borderRadius: 8, background: m.role === "user" ? c.ac + "10" : c.sf, fontSize: 12, color: c.tx, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: m.role === "user" ? c.ac : c.a2 }}>{m.role === "user" ? "User" : "Bloomie"}: </span>
                {m.content || m.text}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: mob ? 12 : 20 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {filters.map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + (filter === f.k ? c.ac + "30" : c.ln), cursor: "pointer", fontSize: 12, fontWeight: 600, background: filter === f.k ? c.ac + "18" : c.cd, color: filter === f.k ? c.ac : c.so }}>
            {f.l}
          </button>
        ))}
        <button onClick={fetchTickets} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.cd, color: c.so, fontSize: 12, cursor: "pointer" }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: c.so, fontSize: 13 }}>Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.tx, marginBottom: 4 }}>No tickets found</div>
          <div style={{ fontSize: 12, color: c.so }}>Tickets created via Bloomie support chat will appear here</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map((t) => (
            <div key={t.id} onClick={() => { setSelected(t); setNote(t.resolution_notes || ""); }}
              style={{ padding: "14px 16px", borderRadius: 12, background: c.cd, border: "1px solid " + c.ln, cursor: "pointer", transition: "border-color .15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = c.ac + "50")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = c.ln)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.so }}>#{t.ticket_number}</span>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: (statusColors[t.status] || "#888") + "18", color: statusColors[t.status] || "#888" }}>{t.status?.replace("_", " ")}</span>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: (priorityColors[t.priority] || "#888") + "18", color: priorityColors[t.priority] || "#888" }}>{t.priority}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: c.so }}>{timeAgo(t.created_at)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 3 }}>{t.subject}</div>
              {t.description && <div style={{ fontSize: 12, color: c.so, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KNOWLEDGE BASE MANAGER
   ═══════════════════════════════════════════════════════════════ */
function SupportAnswerManager({ c, mob }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ question: "", answer: "", category: "", keywords: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/bloomie-admin/support-answers', { headers: await tenantHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load support answers');
      setArticles(Array.isArray(d.answers) ? d.answers : []);
    } catch { setArticles([]); }
    setLoading(false);
  };

  useEffect(() => { fetchArticles(); }, []);

  const resetForm = () => { setForm({ question: "", answer: "", category: "", keywords: "" }); setEditing(null); };

  const saveArticle = async () => {
    if (!form.question.trim() || !form.answer.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      category: form.category.trim() || "general",
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
    };
    try {
      const r = await fetch(editing ? `/api/bloomie-admin/support-answers/${editing}` : '/api/bloomie-admin/support-answers', {
        method: editing ? "PATCH" : "POST",
        headers: await tenantHeaders(),
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save support answer');
      resetForm();
      await fetchArticles();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async (id) => {
    if (!confirm("Delete this KB article?")) return;
    await fetch(`/api/bloomie-admin/support-answers/${id}`, { method: "DELETE", headers: await tenantHeaders() });
    fetchArticles();
  };

  const startEdit = (a) => {
    setEditing(a.id);
    setForm({ question: a.question || "", answer: a.answer || "", category: a.category || "", keywords: (a.keywords || []).join(", ") });
  };

  const syncGhl = async article => {
    setError("");
    const r = await fetch(`/api/bloomie-admin/support-answers/${article.id}/sync-ghl`, { method: "POST", headers: await tenantHeaders(), body: '{}' });
    const d = await r.json();
    if (!r.ok) return setError(d.error || 'Could not sync this answer to GHL');
    setArticles(prev => prev.map(item => item.id === article.id ? d.answer : item));
  };

  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.inp, color: c.tx, fontSize: 13, outline: "none", fontFamily: "inherit" };

  return (
    <div style={{ padding: mob ? 12 : 20 }}>
      <div style={{ padding: "12px 14px", borderRadius: 12, background: c.ac + "10", border: "1px solid " + c.ac + "35", marginBottom: 14, color: c.so, fontSize: 12, lineHeight: 1.55 }}>
        Customer-facing answers used by the public Bloomie support assistant. Private client facts, policies, and files belong in <strong style={{ color: c.tx }}>Tenant Knowledge</strong>.
      </div>
      <div style={{ padding: 16, borderRadius: 14, background: c.cd, border: "1px solid " + c.ln, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.tx, marginBottom: 12 }}>Add Support Answer</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Question (e.g., How much does Bloomie cost?)" style={inputStyle} />
          <textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Answer..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 10 }}>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (e.g., pricing)" style={inputStyle} />
            <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="Keywords (comma-separated)" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveArticle} disabled={saving || !form.question.trim() || !form.answer.trim()}
              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: form.question.trim() && form.answer.trim() ? "linear-gradient(135deg,#F4A261,#E76F8B)" : c.ln, color: "#fff", fontSize: 12, fontWeight: 600, cursor: form.question.trim() && form.answer.trim() ? "pointer" : "default" }}>
              {saving ? "Saving…" : "Add Answer"}
            </button>
          </div>
        </div>
      </div>
      {error && <div role="alert" style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.tx }}>{articles.length} Articles</div>
        <button onClick={fetchArticles} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.cd, color: c.so, fontSize: 12, cursor: "pointer" }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: c.so, fontSize: 13 }}>Loading articles...</div>
      ) : articles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.tx, marginBottom: 4 }}>No KB articles yet</div>
          <div style={{ fontSize: 12, color: c.so }}>Add approved answers for the public support assistant.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {articles.map((a) => (
            <div key={a.id} style={{ padding: "14px 16px", borderRadius: 12, background: c.cd, border: "1px solid " + c.ln }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 4 }}>{a.question}</div>
                  <div style={{ fontSize: 12, color: c.so, lineHeight: 1.6, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.answer}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {a.category && <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: c.ac + "15", color: c.ac }}>{a.category}</span>}
                    <span style={{ fontSize: 10, color: c.so }}>{a.hit_count || 0} hits</span>
                    {(a.keywords || []).slice(0, 3).map((k, i) => <span key={i} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: c.sf, color: c.so }}>{k}</span>)}
                    {a.ghl_sync_status === "synced" && <span style={{ fontSize: 10, color: c.gr, fontWeight: 700 }}>GHL synced</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => syncGhl(a)} title="Sync to GHL Knowledge Base" style={{ minWidth: 30, height: 30, padding: "0 7px", borderRadius: 6, border: "1px solid " + c.ln, background: c.cd, color: a.ghl_sync_status === "synced" ? c.gr : c.ac, cursor: "pointer", fontSize: 10, fontWeight: 800 }}>GHL</button>
                  <button onClick={() => startEdit(a)} style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid " + c.ln, background: c.cd, color: c.so, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button onClick={() => deleteArticle(a.id)} style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid " + c.ln, background: c.cd, color: "#ea4335", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Edit support answer" style={{ position: "fixed", inset: 0, zIndex: 10050, background: "rgba(0,0,0,.58)", display: "grid", placeItems: "center", padding: 16 }} onMouseDown={e => e.target === e.currentTarget && resetForm()}>
          <div style={{ width: "min(620px,100%)", maxHeight: "88dvh", overflowY: "auto", padding: mob ? 16 : 20, borderRadius: 16, background: c.cd, border: "1px solid " + c.ln, boxShadow: "0 24px 70px rgba(0,0,0,.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div><div style={{ fontSize: 17, fontWeight: 800, color: c.tx }}>Edit Support Answer</div><div style={{ fontSize: 11, color: c.so, marginTop: 2 }}>Changes become available to Bloomie immediately; sync again to update GHL.</div></div>
              <button onClick={resetForm} aria-label="Close editor" style={{ border: "none", background: "transparent", color: c.so, fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="Question" style={inputStyle} autoFocus />
              <textarea value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} placeholder="Answer" rows={7} style={{ ...inputStyle, resize: "vertical" }} />
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 10 }}>
                <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Category" style={inputStyle} />
                <input value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder="Keywords" style={inputStyle} />
              </div>
              {error && <div role="alert" style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={resetForm} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid " + c.ln, background: c.cd, color: c.so, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveArticle} disabled={saving || !form.question.trim() || !form.answer.trim()} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#F4A261,#E76F8B)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{saving ? "Saving…" : "Save Changes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOOMIE ADMIN — Main container with sub-tabs
   ═══════════════════════════════════════════════════════════════ */
export default function BloomieAdmin({ c, mob, agentId = null, agentName = "this Bloomie", projectId = null, onOpenBrandKit = null }) {
  const [tab, setTab] = useState("inbox");

  const tabs = [
    { k: "inbox", l: "Inbox", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
    { k: "tickets", l: "Tickets", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6" },
    { k: "knowledge", l: "Tenant Knowledge", icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5a2 2 0 0 1 2-2h14v14H6.5A2.5 2.5 0 0 0 4 19.5z" },
    { k: "support", l: "Support Answers", icon: "M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a10.2 10.2 0 0 1-4-.8L3 20l1.3-3.5A7.2 7.2 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  ];

  return (
    <div style={{ height: "calc(100vh - 52px)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: mob ? "16px 12px 0" : "20px 20px 0", background: c.cd, borderBottom: "1px solid " + c.ln }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#F4A261,#E76F8B)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
              {[0, 72, 144, 216, 288].map((r, i) => (
                <ellipse key={i} cx="50" cy="38" rx="14" ry="20" fill="#fff" opacity={i % 2 === 0 ? 0.9 : 0.8} transform={`rotate(${r} 50 50)`} />
              ))}
              <circle cx="50" cy="50" r="10" fill="#FFE0C2" />
              <circle cx="50" cy="50" r="5" fill="#F4A261" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: mob ? 18 : 20, fontWeight: 700, color: c.tx, margin: 0 }}>Bloomie</h1>
            <p style={{ fontSize: 12, color: c.so, margin: 0 }}>Visitor support and private tenant knowledge</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} title={t.l} aria-label={t.l}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: tab === t.k ? c.bg : "transparent", color: tab === t.k ? c.tx : c.so, borderBottom: tab === t.k ? "2px solid " + c.ac : "2px solid transparent" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {!mob && t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: tab === "inbox" ? "hidden" : "auto", background: c.bg }}>
        {tab === "inbox" && <Inbox c={c} mob={mob} />}
        {tab === "tickets" && <TicketManager c={c} mob={mob} />}
        {tab === "knowledge" && <ReferenceLibrary
          c={c}
          mob={mob}
          agentId={agentId}
          agentName={agentName}
          projectId={projectId}
          onOpenBrandKit={onOpenBrandKit}
          defaultCategory="knowledge"
          defaultScope="organization"
          initialFilter="all"
          title="Tenant Knowledge"
          description="Private client policies, services, procedures, and source documents available to every Bloomie in this tenant."
        />}
        {tab === "support" && <SupportAnswerManager c={c} mob={mob} />}
      </div>
    </div>
  );
}
