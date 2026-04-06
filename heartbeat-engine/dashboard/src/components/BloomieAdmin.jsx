import { useState, useEffect, useRef } from "react";

const BLOOMIE_API = "https://njfhzabmaxhfzekbzpzz.supabase.co/functions/v1/bloomie-chat";
const SUPABASE_URL = "https://njfhzabmaxhfzekbzpzz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZmh6YWJtYXhoZnpla2J6cHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjYwMjMsImV4cCI6MjA4ODQwMjAyM30.QPTQhnlfZtmfQVm75GqG0Oazmyb7USjYBdLEy_G-iqU";

const hdrs = { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

/* ─── Helpers ─── */
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

const priorityColors = { urgent: "#ea4335", high: "#E76F8B", medium: "#F4A261", low: "#34A853" };
const statusColors = { open: "#5B8FF9", in_progress: "#F4A261", resolved: "#34A853", closed: "#888" };

/* ═══════════════════════════════════════════════════════════════
   BLOOMIE SUPPORT CHAT
   ═══════════════════════════════════════════════════════════════ */
function BloomieChat({ c, mob }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => "admin-" + Date.now());
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const r = await fetch(BLOOMIE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "support", message: msg, session_id: sessionId }),
      });
      const d = await r.json();
      setMessages((p) => [...p, { role: "assistant", text: d.reply || d.error || "No response" }]);
    } catch (e) {
      setMessages((p) => [...p, { role: "assistant", text: "Connection error: " + e.message }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: mob ? 12 : 20 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#F4A261,#E76F8B)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
                {[0, 72, 144, 216, 288].map((r, i) => (
                  <ellipse key={i} cx="50" cy="38" rx="14" ry="20" fill="#fff" opacity={i % 2 === 0 ? 0.9 : 0.8} transform={`rotate(${r} 50 50)`} />
                ))}
                <circle cx="50" cy="50" r="10" fill="#FFE0C2" />
                <circle cx="50" cy="50" r="5" fill="#F4A261" />
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.tx, marginBottom: 6 }}>Bloomie Support</div>
            <div style={{ fontSize: 13, color: c.so, lineHeight: 1.6 }}>
              Ask Bloomie to help with technical issues, create tickets, manage KB articles, or troubleshoot problems.
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: 14,
                background: m.role === "user" ? "linear-gradient(135deg,#F4A261,#E76F8B)" : c.cd,
                color: m.role === "user" ? "#fff" : c.tx,
                border: m.role === "user" ? "none" : "1px solid " + c.ln,
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
            <div style={{ padding: "10px 14px", borderRadius: 14, background: c.cd, border: "1px solid " + c.ln, fontSize: 13, color: c.so }}>
              <span style={{ animation: "pulse 1.2s ease infinite" }}>Bloomie is thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: mob ? "8px 12px" : "12px 20px", borderTop: "1px solid " + c.ln, display: "flex", gap: 8, background: c.sf }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask Bloomie for support..."
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid " + c.ln,
            background: c.inp,
            color: c.tx,
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: input.trim() ? "linear-gradient(135deg,#F4A261,#E76F8B)" : c.ln,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: input.trim() ? "pointer" : "default",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Send
        </button>
      </div>
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
      let url = `${SUPABASE_URL}/rest/v1/bloomie_tickets?order=created_at.desc&limit=100`;
      if (filter !== "all") url += `&status=eq.${filter}`;
      const r = await fetch(url, { headers: hdrs });
      const d = await r.json();
      setTickets(Array.isArray(d) ? d : []);
    } catch { setTickets([]); }
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, [filter]);

  const updateTicket = async (id, updates) => {
    await fetch(`${SUPABASE_URL}/rest/v1/bloomie_tickets?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...hdrs, Prefer: "return=representation" },
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
        <button
          onClick={() => setSelected(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: c.ac, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, padding: 0 }}
        >
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

        {/* Status actions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {selected.status === "open" && (
            <button onClick={() => updateTicket(selected.id, { status: "in_progress" })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#F4A261", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Start Working
            </button>
          )}
          {(selected.status === "open" || selected.status === "in_progress") && (
            <button onClick={() => updateTicket(selected.id, { status: "resolved", resolution_notes: note || null })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#34A853", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Resolve
            </button>
          )}
          {selected.status !== "closed" && (
            <button onClick={() => updateTicket(selected.id, { status: "closed" })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: c.ln, color: c.tx, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Close
            </button>
          )}
          {selected.status === "closed" && (
            <button onClick={() => updateTicket(selected.id, { status: "open" })} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#5B8FF9", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Reopen
            </button>
          )}
        </div>

        {/* Resolution notes */}
        <div style={{ padding: 16, borderRadius: 14, background: c.cd, border: "1px solid " + c.ln }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 8 }}>Resolution Notes</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add notes about resolution..."
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.inp, color: c.tx, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit" }}
          />
          <button
            onClick={() => updateTicket(selected.id, { resolution_notes: note })}
            style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, border: "none", background: c.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Save Notes
          </button>
        </div>

        {/* Chat history if present */}
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
      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {filters.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background: filter === f.k ? c.ac + "18" : c.cd,
              color: filter === f.k ? c.ac : c.so,
              border: "1px solid " + (filter === f.k ? c.ac + "30" : c.ln),
            }}
          >
            {f.l}
          </button>
        ))}
        <button onClick={fetchTickets} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.cd, color: c.so, fontSize: 12, cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: c.so, fontSize: 13 }}>Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#x1F3AB;</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.tx, marginBottom: 4 }}>No tickets found</div>
          <div style={{ fontSize: 12, color: c.so }}>Tickets created via Bloomie support chat will appear here</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map((t) => (
            <div
              key={t.id}
              onClick={() => { setSelected(t); setNote(t.resolution_notes || ""); }}
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: c.cd,
                border: "1px solid " + c.ln,
                cursor: "pointer",
                transition: "border-color .15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = c.ac + "50")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = c.ln)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.so }}>#{t.ticket_number}</span>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: (statusColors[t.status] || "#888") + "18", color: statusColors[t.status] || "#888" }}>
                  {t.status?.replace("_", " ")}
                </span>
                <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: (priorityColors[t.priority] || "#888") + "18", color: priorityColors[t.priority] || "#888" }}>
                  {t.priority}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: c.so }}>{timeAgo(t.created_at)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 3 }}>{t.subject}</div>
              {t.description && (
                <div style={{ fontSize: 12, color: c.so, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.description}
                </div>
              )}
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
function KBManager({ c, mob }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ question: "", answer: "", category: "", keywords: "" });

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/bloomie_kb?order=hit_count.desc,created_at.desc&limit=200`, { headers: hdrs });
      const d = await r.json();
      setArticles(Array.isArray(d) ? d : []);
    } catch { setArticles([]); }
    setLoading(false);
  };

  useEffect(() => { fetchArticles(); }, []);

  const resetForm = () => { setForm({ question: "", answer: "", category: "", keywords: "" }); setEditing(null); };

  const saveArticle = async () => {
    if (!form.question.trim() || !form.answer.trim()) return;
    const payload = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      category: form.category.trim() || "general",
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
    };
    if (editing) {
      await fetch(`${SUPABASE_URL}/rest/v1/bloomie_kb?id=eq.${editing}`, {
        method: "PATCH",
        headers: { ...hdrs, Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/bloomie_kb`, {
        method: "POST",
        headers: { ...hdrs, Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
    }
    resetForm();
    fetchArticles();
  };

  const deleteArticle = async (id) => {
    if (!confirm("Delete this KB article?")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/bloomie_kb?id=eq.${id}`, { method: "DELETE", headers: hdrs });
    fetchArticles();
  };

  const startEdit = (a) => {
    setEditing(a.id);
    setForm({
      question: a.question || "",
      answer: a.answer || "",
      category: a.category || "",
      keywords: (a.keywords || []).join(", "),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid " + c.ln,
    background: c.inp,
    color: c.tx,
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div style={{ padding: mob ? 12 : 20 }}>
      {/* Add / Edit form */}
      <div style={{ padding: 16, borderRadius: 14, background: c.cd, border: "1px solid " + c.ln, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.tx, marginBottom: 12 }}>
          {editing ? "Edit Article" : "Add New KB Article"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Question (e.g., How much does Bloomie cost?)" style={inputStyle} />
          <textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Answer..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (e.g., pricing)" style={inputStyle} />
            <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="Keywords (comma-separated)" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={saveArticle}
              disabled={!form.question.trim() || !form.answer.trim()}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: form.question.trim() && form.answer.trim() ? "linear-gradient(135deg,#F4A261,#E76F8B)" : c.ln,
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: form.question.trim() && form.answer.trim() ? "pointer" : "default",
              }}
            >
              {editing ? "Update Article" : "Add Article"}
            </button>
            {editing && (
              <button onClick={resetForm} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + c.ln, background: c.cd, color: c.so, fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Articles list */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.tx }}>{articles.length} Articles</div>
        <button onClick={fetchArticles} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + c.ln, background: c.cd, color: c.so, fontSize: 12, cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: c.so, fontSize: 13 }}>Loading articles...</div>
      ) : articles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#x1F4DA;</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.tx, marginBottom: 4 }}>No KB articles yet</div>
          <div style={{ fontSize: 12, color: c.so }}>Add articles above to train Bloomie on your FAQs</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {articles.map((a) => (
            <div key={a.id} style={{ padding: "14px 16px", borderRadius: 12, background: c.cd, border: "1px solid " + c.ln }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 4 }}>{a.question}</div>
                  <div style={{ fontSize: 12, color: c.so, lineHeight: 1.6, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {a.answer}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {a.category && (
                      <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: c.ac + "15", color: c.ac }}>{a.category}</span>
                    )}
                    <span style={{ fontSize: 10, color: c.so }}>{a.hit_count || 0} hits</span>
                    {(a.keywords || []).slice(0, 3).map((k, i) => (
                      <span key={i} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: c.sf, color: c.so }}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => startEdit(a)}
                    style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid " + c.ln, background: c.cd, color: c.so, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button
                    onClick={() => deleteArticle(a.id)}
                    style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid " + c.ln, background: c.cd, color: "#ea4335", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BLOOMIE ADMIN — Main container with sub-tabs
   ═══════════════════════════════════════════════════════════════ */
export default function BloomieAdmin({ c, mob }) {
  const [tab, setTab] = useState("chat");

  const tabs = [
    { k: "chat", l: "Support Chat", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
    { k: "tickets", l: "Tickets", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6" },
    { k: "kb", l: "Knowledge Base", icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5a2 2 0 0 1 2-2h14v14H6.5A2.5 2.5 0 0 0 4 19.5z" },
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
            <h1 style={{ fontSize: mob ? 18 : 20, fontWeight: 700, color: c.tx, margin: 0 }}>Bloomie Admin</h1>
            <p style={{ fontSize: 12, color: c.so, margin: 0 }}>Support chat, ticket management & knowledge base</p>
          </div>
        </div>
        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                background: tab === t.k ? c.bg : "transparent",
                color: tab === t.k ? c.tx : c.so,
                borderBottom: tab === t.k ? "2px solid " + c.ac : "2px solid transparent",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {!mob && t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: tab === "chat" ? "hidden" : "auto", background: c.bg }}>
        {tab === "chat" && <BloomieChat c={c} mob={mob} />}
        {tab === "tickets" && <TicketManager c={c} mob={mob} />}
        {tab === "kb" && <KBManager c={c} mob={mob} />}
      </div>
    </div>
  );
}
