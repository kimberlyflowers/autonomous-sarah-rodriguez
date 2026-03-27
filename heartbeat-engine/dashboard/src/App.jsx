import { useState, useEffect, useRef, Component } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "./supabase.js";
import QRCode from 'qrcode';
import PageEditor from "./PageEditor.jsx";

// Get auth headers for API calls
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { "Content-Type": "application/json" };
  return { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` };
}

async function withAuth(opts = {}) {
  const headers = await getAuthHeaders();
  return { ...opts, headers: { ...headers, ...(opts.headers || {}) } };
}

// Error boundary — prevents white screen crashes
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('UI crash caught:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:40,textAlign:"center",color:"#ccc",fontFamily:"system-ui"}}>
          <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>Something went wrong</div>
          <div style={{fontSize:13,color:"#888",marginBottom:20}}>{this.state.error?.message || "An unexpected error occurred"}</div>
          <button onClick={()=>{ this.setState({hasError:false,error:null}); window.location.reload(); }} 
            style={{padding:"10px 24px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════════════════════════
   THEME — exact copy from Jaden's dashboard
   ═══════════════════════════════════════════════════════════════ */
function mk(d) {
  return d
    ? { bg:"#1a1a1a",sf:"#212121",cd:"#262626",ac:"#F4A261",a2:"#E76F8B",
        gr:"#34A853",gf:"#1a2b1a",tx:"#d4d4d4",so:"#a0a0a0",fa:"#5c5c5c",
        ln:"#353535",bl:"#5B8FF9",pu:"#A78BFA",inp:"#212121",hv:"#2f2f2f",
        gradient:"linear-gradient(135deg,#F4A261,#E76F8B)",err:"#ea4335",warn:"#FBBC04" }
    : { bg:"#F7F8FA",sf:"#EDEEF2",cd:"#FFFFFF",ac:"#F4A261",a2:"#E76F8B",
        gr:"#34A853",gf:"#F0FAF0",tx:"#111827",so:"#6B7280",fa:"#D1D5DB",
        ln:"#E5E7EB",bl:"#3B6FD4",pu:"#7C3AED",inp:"#F4F5F7",hv:"#F0F1F3",
        gradient:"linear-gradient(135deg,#F4A261,#E76F8B)",err:"#ea4335",warn:"#FBBC04" };
}

/* ═══════════════════════════════════════════════════════════════
   MODERN ICON LIBRARY
   ═══════════════════════════════════════════════════════════════ */
const Icon={File:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,Document:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,Spreadsheet:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,Image:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,Folder:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,Mail:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,Phone:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,MessageSquare:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,Camera:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,Check:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,CheckCircle:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,Zap:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,Settings:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m5.196-14.196L13.732 8.268m-3.464 3.464-3.464 3.464m0-11.928 3.464 3.464m3.464 3.464 3.464 3.464"/></svg>,Building:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>,BarChart:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,Search:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,Link:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,Code:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,Globe:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,Paperclip:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,Edit:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,AlertCircle:({sz=16,color})=><svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>};

function useW() {
  const [w,setW] = useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{
    const f=()=>setW(window.innerWidth);
    window.addEventListener("resize",f);
    return ()=>window.removeEventListener("resize",f);
  },[]);
  return w;
}

/* ═══════════════════════════════════════════════════════════════
   BLOOM + FACE — exact copy from Jaden
   ═══════════════════════════════════════════════════════════════ */
function Face({sz,agent,onClick,style:extraStyle}) {
  const s=sz||30;
  const ag=agent||{nm:"Sarah",img:null,grad:"linear-gradient(135deg,#F4A261,#E76F8B)"};
  if(ag.img) return(
    <div onClick={onClick} style={{width:s,height:s,flexShrink:0,...(extraStyle||{})}}>
      <div style={{width:s,height:s,borderRadius:s*0.3,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
        <img src={ag.img} alt={ag.nm} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      </div>
    </div>
  );
  const ini=ag.nm.split(" ").map(w=>w[0]).join("").slice(0,2);
  return(
    <div onClick={onClick} style={{width:s,height:s,flexShrink:0,...(extraStyle||{})}}>
      <div style={{width:s,height:s,borderRadius:s*0.3,background:ag.grad,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
        <span style={{fontSize:s*0.38,fontWeight:700,color:"#fff"}}>{ini}</span>
      </div>
    </div>
  );
}

function Bloom({sz,glow}) {
  const s=sz||36;
  return(
    <div style={{position:"relative",width:s,height:s,flexShrink:0}}>
      {glow&&<div style={{position:"absolute",inset:-4,borderRadius:s*0.28+4,background:"radial-gradient(circle,#F4A26140 0%,#E76F8B20 50%,transparent 70%)",animation:"bloomGlow 2.5s ease-in-out infinite"}}/>}
      <div style={{width:s,height:s,borderRadius:s*0.28,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 12px #E76F8B40",position:"relative",zIndex:1}}>
        <svg width={s*0.65} height={s*0.65} viewBox="0 0 100 100" fill="none">
          {[0,72,144,216,288].map((r,i)=>(
            <ellipse key={i} cx="50" cy="38" rx="14" ry="20" fill="#fff" opacity={i%2===0?0.9:0.8} transform={`rotate(${r} 50 50)`}/>
          ))}
          <circle cx="50" cy="50" r="10" fill="#FFE0C2"/>
          <circle cx="50" cy="50" r="5" fill="#F4A261"/>
        </svg>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SSE — Sarah's real-time connection
   ═══════════════════════════════════════════════════════════════ */
function useSSE() {
  const [sseOk,setSseOk] = useState(false);
  const cbs = useRef(new Map());

  useEffect(()=>{
    let es;
    const connect=()=>{
      try {
        es = new EventSource("/api/events/dashboard"); // correct SSE path
        es.onopen=()=>setSseOk(true);
        es.onmessage=(e)=>{
          try{const d=JSON.parse(e.data);cbs.current.forEach(cb=>cb(d));}catch{}
        };
        es.onerror=()=>{ setSseOk(false); es.close(); setTimeout(connect,5000); };
      } catch { setTimeout(connect,5000); }
    };
    connect();
    return ()=>{ try{es&&es.close();}catch{} };
  },[]);

  const register=(key,cb)=>{ cbs.current.set(key,cb); return ()=>cbs.current.delete(key); };
  return {sseOk,register};
}

/* Poll /api/chat/health — true online/offline for Sarah's API */
function useAgentOnline() {
  const [online,setOnline] = useState(false);
  useEffect(()=>{
    const check=async()=>{
      try{
        const r=await fetch("/api/chat/health",{signal:AbortSignal.timeout(4000)});
        setOnline(r.ok);
      }catch{ setOnline(false); }
    };
    check();
    const t=setInterval(check,12000);
    return()=>clearInterval(t);
  },[]);
  return online;
}

/* ═══════════════════════════════════════════════════════════════
   CHAT — Sarah's API
   ═══════════════════════════════════════════════════════════════ */
// Generate instant acknowledgment based on user's request
function generateAck(text) {
  const lower = text.toLowerCase();
  
  // Research/analysis — match FIRST because it can contain any other keyword
  if (/research|find out|look up|analyze|dig into|investigate/i.test(lower)) {
    return "Let me dig into that for you. 🔍";
  }
  // CRM/contacts
  if (/contact|lead|crm|ghl|pipeline/i.test(lower)) {
    return "Pulling that up now. 📋";
  }
  // Browser/navigation
  if (/go to|navigate|visit|check.*website|browse|\.com|\.org/i.test(lower)) {
    return "On my way there now. 🌐";
  }
  // Website/landing page — only if they're asking to BUILD one
  if (/(?:build|create|make|design|draft).*(?:website|landing page|web page|site|funnel)/i.test(lower)) {
    return "On it — designing now. 🔥";
  }
  // Blog/article
  if (/(?:write|create|draft).*(?:blog|article|post)/i.test(lower)) {
    return "Drafting that now. ✍️";
  }
  // Email
  if (/email|sequence|newsletter|campaign/i.test(lower)) {
    return "Writing that up now. 📧";
  }
  // Social media
  if (/social|instagram|tiktok|facebook|linkedin|caption/i.test(lower)) {
    return "Creating that now. 📱";
  }
  // Document/report
  if (/report|document|proposal|memo|letter|sop/i.test(lower)) {
    return "Putting that together now. 📄";
  }
  // Generic work task
  return "On it. 💪";
}

function useSarahChat() {
  const [messages,setMessages] = useState([]);
  const [loading,setLoading] = useState(false);
  const [workingStatus,setWorkingStatus] = useState("");
  const [sessions,setSessions] = useState([]);
  const [currentSessionId,setCurrentSessionId] = useState(null);
  const sid = useRef(null);
  // Multi-agent support
  const [agents,setAgents] = useState([]);
  const [currentAgentId,setCurrentAgentId] = useState(null);
  const [currentAgent,setCurrentAgent] = useState(null);
  const agentIdRef = useRef(null); // Always-current agent ID for use in closures/intervals

  // Load available agents (multi-tenant: sends JWT so backend resolves org)
  const fetchAgents = async () => {
    try {
      const headers = await getAuthHeaders();
      const r = await fetch("/api/agent/list", { headers });
      const d = await r.json();
      const list = d.agents || [];
      setAgents(list);
      // Default to first agent if none selected
      if(list.length > 0 && !currentAgentId) {
        setCurrentAgentId(list[0].id);
        setCurrentAgent(list[0]);
        agentIdRef.current = list[0].id;
      }
    } catch {}
  };

  // Switch to a different agent
  const switchAgent = (agentId) => {
    const a = agents.find(x => x.id === agentId);
    if(a) {
      agentIdRef.current = agentId; // Update ref FIRST so intervals/callbacks use new agent immediately
      setCurrentAgentId(agentId);
      setCurrentAgent(a);
      // Clear everything immediately — no stale data from previous agent
      sid.current = null;
      setCurrentSessionId(null);
      setMessages([]);
      setSessions([]);
      fetchSessions(agentId);
    }
  };

  // Load session list on mount — uses agentIdRef to avoid stale closures in intervals/callbacks
  const fetchSessions = async (agentId) => {
    try {
      const aid = agentId || agentIdRef.current || currentAgentId;
      if(!aid) return; // Don't fetch without an agent ID — would return all agents' sessions
      const url = `/api/chat/sessions?agentId=${aid}`;
      const headers = await getAuthHeaders();
      const r = await fetch(url, { headers });
      const d = await r.json();
      const list = d.sessions || [];
      setSessions(list);
    } catch {}
  };

  useEffect(()=>{ fetchAgents(); },[]);
  useEffect(()=>{ if(currentAgentId) fetchSessions(currentAgentId); },[currentAgentId]);

  // Start a fresh session
  const newSession = () => {
    const id = "session-"+Date.now();
    sid.current = id;
    setCurrentSessionId(id);
    setMessages([]);
  };

  // Load an existing session
  const loadSession = async (sessionId) => {
    sid.current = sessionId;
    setCurrentSessionId(sessionId);
    try {
      const r = await fetch("/api/chat/sessions/"+sessionId);
      const d = await r.json();
      const msgs = (d.messages||[]).map(m=>({
        id: m.id,
        b: m.role==="assistant",
        t: m.content,
        tm: new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),
        files: m.files ? (typeof m.files==="string" ? JSON.parse(m.files) : m.files) : undefined
      }));
      setMessages(msgs);
    } catch { setMessages([]); }
  };

  // Delete session
  const deleteSession = async (sessionId) => {
    await fetch("/api/chat/sessions/"+sessionId, {method:"DELETE"});
    setSessions(p=>p.filter(s=>s.id!==sessionId));
    if(sid.current===sessionId) { sid.current=null; setCurrentSessionId(null); setMessages([]); }
  };

  const abortRef = useRef(null);

  const stopSarah = () => {
    if(abortRef.current) { abortRef.current.abort(); abortRef.current=null; }
    setLoading(false);
    setWorkingStatus("");
  };

  const send = async (text) => {
    if(!text.trim()) return false;
    if(!sid.current) { const id="session-"+Date.now(); sid.current=id; setCurrentSessionId(id); }
    const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    const userMsgId = Date.now();
    setMessages(p=>[...p,{id:userMsgId,b:false,t:text,tm:ts}]);
    setLoading(true);

    // Detect if this is a WORK task or just casual chat
    // Direct work keywords
    const hasWorkVerbs = /\b(write|create|build|make|draft|design|generate|research|check|find|search|send|schedule|update|look up|go to|navigate|analyze|summarize|review|edit|fix|compile|prepare|pull|set up|book|cancel|redo|retry|try again|do it|do that|go ahead|start|finish|continue|proceed|run|execute|launch|publish)\b/i.test(text);
    const hasWorkNouns = /\b(blog|email|post|website|landing page|report|document|contact|lead|campaign|sequence|flyer|graphic|proposal|invoice|spreadsheet|calendar|appointment|site|page|sop|newsletter|funnel|book|chapter)\b/i.test(text);
    // Continuation signals — short messages that reference ongoing work
    const isContinuation = /^(ok|yes|yeah|yep|sure|do it|go|go ahead|try again|retry|redo|proceed|continue|start|finish it|yes please|ok do it|go for it|let's go|make it|ship it)\b/i.test(text.trim());
    // Check if recent messages suggest we're in a work context
    const recentMsgs = messages.slice(-6);
    const hasRecentWork = recentMsgs.some(m => m.b && (m.isAck || m.skill || m.hasArtifact || /working on|deliverable|created|building|generating/i.test(m.t)));

    const isWorkTask = hasWorkVerbs || hasWorkNouns || (isContinuation && hasRecentWork);

    // For work tasks: show instant acknowledgment
    // IMPORTANT: ackId must be different from userMsgId to prevent filter(m=>m.id!==ackId) from also removing the user message
    let ackId = null;
    if(isWorkTask){
      const ackText = generateAck(text);
      ackId = userMsgId + 1; // Guaranteed different from user message ID
      setMessages(p=>[...p,{id:ackId,b:true,t:ackText,tm:ts,isAck:true}]);
    }
    
    // Progress indicator
    // Work tasks: agent "is working" with elapsed time
    // Casual chat: "Thinking..." with dots (NOT bare dots)
    const startTime = Date.now();
    let progressInterval = null;
    const fn=(currentAgent?.name||"Sarah").split(" ")[0];
    if(isWorkTask){
      setWorkingStatus(`Sending to ${fn}...`);
      progressInterval = setInterval(()=>{
        const elapsed = Math.round((Date.now()-startTime)/1000);
        if(elapsed < 3) setWorkingStatus(`${fn} is reading your request...`);
        else if(elapsed < 8) setWorkingStatus(`${fn} is working on this...`);
        else if(elapsed < 15) setWorkingStatus(`Still working... (${elapsed}s)`);
        else if(elapsed < 30) setWorkingStatus(`This is a bigger task — hang tight... (${elapsed}s)`);
        else if(elapsed < 60) setWorkingStatus(`Deep work in progress... (${elapsed}s)`);
        else setWorkingStatus(`Complex task in progress... (${Math.round(elapsed/60)}m ${elapsed%60}s)`);
      }, 1000);
    } else {
      setWorkingStatus("Thinking..."); // casual chat gets gentle "Thinking..." label
    }
    
    // Abortable fetch
    const controller = new AbortController();
    abortRef.current = controller;
    // Auto-timeout after 8 minutes (website + image generation can take 5-6 min)
    const timeoutId = setTimeout(()=>controller.abort(), 480000); // 8 min timeout
    
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/chat/message",{
        method:"POST",
        headers:authHeaders,
        body:JSON.stringify({message:text,sessionId:sid.current,agentId:currentAgentId}),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if(progressInterval)clearInterval(progressInterval);
      abortRef.current = null;
      const data = await res.json();
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      const responseText = (data.response||data.message||"Done.").replace(/\s*\[Session context[\s\S]*$/,'').replace(/\s*\[Tool:.*?\]\s*/g,'').trim();
      const msgObj = {id:Date.now(),b:true,t:responseText,tm:ts2,skills:data.skillsUsed||[],hasArtifact:!!responseText.match(/Created "|I've created|I created|saved as|saved it to|in your Files tab|saved to.*Files/i)};
      // Attach clarification data for bloom_clarify popup buttons
      if(data.clarification) msgObj.clarification = data.clarification;

      if(ackId){
        setMessages(p=>p.filter(m=>m.id!==ackId).concat([msgObj]));
      } else {
        setMessages(p=>[...p,msgObj]);
      }
      fetchSessions();
      setTimeout(fetchSessions, 3000);
      return true;
    } catch(err) {
      clearTimeout(timeoutId);
      if(progressInterval)clearInterval(progressInterval);
      abortRef.current = null;
      if(err.name === 'AbortError'){
        const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
        if(ackId) setMessages(p=>p.filter(m=>m.id!==ackId));
        const elapsed = Math.round((Date.now()-startTime)/1000);
        const msg = elapsed >= 470 
          ? `${fn} took too long to respond (timed out after 8 minutes). Try again or simplify the request.`
          : "Stopped. What would you like me to do instead?";
        setMessages(p=>[...p,{id:Date.now(),b:true,t:msg,tm:ts2,isSystem:true}]);
        return false;
      }
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:"Connection issue — please try again.",tm:ts2}]);
      return false;
    } finally { setLoading(false); setWorkingStatus(""); }
  };

  const sendFiles = async (files, text='') => {
    const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    setLoading(true);
    try {
      // Read files as base64 AND keep dataURL for preview
      const encoded = await Promise.all(files.map(f=>new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=()=>res({name:f.name,type:f.type,data:r.result.split(',')[1],dataUrl:r.result});
        r.onerror=rej;
        r.readAsDataURL(f);
      })));
      // Show outgoing message with file previews
      const msgId = Date.now();
      setMessages(p=>[...p,{id:msgId,b:false,t:text||'',tm:ts,files:encoded}]);
      if(!sid.current){ const id="session-"+Date.now(); sid.current=id; setCurrentSessionId(id); }
      const uploadHeaders = await getAuthHeaders();
      const resp = await fetch("/api/chat/upload",{method:"POST",headers:uploadHeaders,body:JSON.stringify({message:text,sessionId:sid.current,agentId:currentAgentId,files:encoded})});
      const data = await resp.json();
      // Replace blob/dataUrl previews with stable server URLs so images work on any computer
      if(data.uploadedFiles?.length) {
        setMessages(p=>p.map(m=>{
          if(m.id!==msgId||!m.files) return m;
          const updated=m.files.map(f=>{
            const match=data.uploadedFiles.find(u=>u.name===f.name);
            return match ? {...f, dataUrl: match.previewUrl, preview: match.previewUrl} : f;
          });
          return {...m,files:updated};
        }));
      }
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:data.response||data.message||"Got it.",tm:ts2}]);
      fetchSessions();
      return true;
    } catch {
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:"Couldn't process that file. Please try again.",tm:ts2}]);
      return false;
    } finally { setLoading(false); }
  };

  // sendFilesEncoded — same as sendFiles but skips FileReader (base64 already encoded, e.g. screenshots)
  const sendFilesEncoded = async (encoded, text='') => {
    const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    setLoading(true);
    try {
      const msgId2 = Date.now();
      setMessages(p=>[...p,{id:msgId2,b:false,t:text||'',tm:ts,files:encoded}]);
      if(!sid.current){ const id="session-"+Date.now(); sid.current=id; setCurrentSessionId(id); }
      const uploadHeaders = await getAuthHeaders();
      const resp = await fetch("/api/chat/upload",{method:"POST",headers:uploadHeaders,body:JSON.stringify({message:text,sessionId:sid.current,agentId:currentAgentId,files:encoded})});
      const data = await resp.json();
      // Replace blob/dataUrl previews with stable server URLs
      if(data.uploadedFiles?.length) {
        setMessages(p=>p.map(m=>{
          if(m.id!==msgId2||!m.files) return m;
          const updated=m.files.map(f=>{
            const match=data.uploadedFiles.find(u=>u.name===f.name);
            return match ? {...f, dataUrl: match.previewUrl, preview: match.previewUrl} : f;
          });
          return {...m,files:updated};
        }));
      }
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:data.response||data.message||"Got it.",tm:ts2}]);
      fetchSessions();
      return true;
    } catch {
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:"Couldn't process that file. Please try again.",tm:ts2}]);
      return false;
    } finally { setLoading(false); }
  };

  return {messages,setMessages,send,sendFiles,sendFilesEncoded,loading,workingStatus,sessions,currentSessionId,newSession,loadSession,deleteSession,fetchSessions,stopSarah,sid,agents,currentAgentId,currentAgent,switchAgent};
}


/* Fetch BLOOM CRM link from backend */
function useCRMLink() {
  const [crmUrl,setCrmUrl] = useState('https://app.gohighlevel.com');
  const [contactsUrl,setContactsUrl] = useState('https://app.gohighlevel.com');
  useEffect(()=>{
    fetch("/api/chat/crm-link").then(r=>r.json()).then(d=>{
      if(d.url) setCrmUrl(d.url);
      if(d.contactsUrl) setContactsUrl(d.contactsUrl);
    }).catch(()=>{});
  },[]);
  return {crmUrl,contactsUrl};
}

/* ═══════════════════════════════════════════════════════════════
   SARAH'S FUNCTIONAL CARDS — Jaden's visual style applied
   ═══════════════════════════════════════════════════════════════ */

// SVG Icons for Monitor Cards
const HealthIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);

const LockIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const BoltIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const RobotIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/>
    <circle cx="12" cy="5" r="2"/>
    <path d="M12 7v4"/>
    <line x1="8" y1="16" x2="8" y2="16"/>
    <line x1="16" y1="16" x2="16" y2="16"/>
  </svg>
);

const WrenchIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

const BrainIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
);

const PhoneIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

const TaskListIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/>
    <line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/>
    <line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

const ClipboardIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
  </svg>
);

const HandshakeIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
    <polyline points="10 17 15 12 10 7"/>
    <line x1="15" y1="12" x2="3" y2="12"/>
  </svg>
);

const XCircleIcon = ({c,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);

// Shared card shell that matches Jaden's card aesthetic exactly
function Card({c,title,subtitle,children,action,noPad,icon}) {
  return(
    <div style={{borderRadius:16,background:c.cd,border:"1px solid "+c.ln,overflow:"hidden"}}>
      <div style={{padding:"13px 16px",borderBottom:"1px solid "+c.ln,background:c.sf,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {icon}
          <div>
            <div style={{fontSize:13,fontWeight:700,color:c.tx}}>{title}</div>
            {subtitle&&<div style={{fontSize:10,color:c.so,marginTop:1}}>{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
      <div style={noPad?{}:{padding:16}}>{children}</div>
    </div>
  );
}

function Pill({c,status,label}) {
  const map={healthy:c.gr,warning:"#F59E0B",critical:"#EF4444",online:c.gr,offline:c.fa,active:c.bl,paused:c.so};
  const col=map[status]||c.fa;
  const lbl=label||status;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:20,background:col+"18",fontSize:10,fontWeight:700,color:col}}>
      <span style={{width:5,height:5,borderRadius:"50%",background:col,animation:status==="online"||status==="healthy"?"pulse 1.5s ease infinite":"none"}}/>
      {lbl}
    </span>
  );
}

function Stat({c,label,value,accent}) {
  return(
    <div style={{padding:"10px 12px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln,textAlign:"center"}}>
      <div style={{fontSize:18,fontWeight:700,color:accent||c.ac}}>{value}</div>
      <div style={{fontSize:9,color:c.so,marginTop:2}}>{label}</div>
    </div>
  );
}

// ── SYSTEM HEALTH
function SystemHealth({c,sse}) {
  const [data,setData] = useState(null);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/health", await withAuth()); if(r.ok) setData(await r.json()); }catch{} };
    go();
    const clean=sse?.register("health",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const overall=data?.overall||"unknown";
  const components=data?.components||[];
  const colMap={healthy:c.gr,warning:"#F59E0B",critical:"#EF4444"};

  return(
    <Card c={c} title="System Health" action={<Pill c={c} status={overall}/>} icon={<HealthIcon c={c} size={16}/>}>
      {!data
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>Loading…</div>
        : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {(components.length?components:[{name:"Database",status:"unknown"},{name:"Claude API",status:"unknown"},{name:"BLOOM CRM API",status:"unknown"},{name:"Memory",status:"unknown"}]).map((comp,i)=>(
              <div key={i} style={{padding:"10px 12px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:colMap[comp.status]||c.fa,flexShrink:0}}/>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:c.tx}}>{comp.name}</div>
                  <div style={{fontSize:9,color:c.so}}>{comp.message||comp.status}</div>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  );
}

// ── TRUST GATE
function TrustGate({c,sse}) {
  const [data,setData] = useState(null);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/trust-gate", await withAuth()); if(r.ok) setData(await r.json()); }catch{} };
    go();
    const clean=sse?.register("trust",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const names={1:"Assistant",2:"Partner",3:"Operator",4:"Admin"};
  const lvl=data?.autonomyLevel||1;
  const used=data?.usage?.total||0;
  const limit=data?.limits?.total||500;
  const pct=Math.min(100,(used/limit)*100);

  return(
    <Card c={c} title="Trust Gate" subtitle="Authorization & daily limits" icon={<LockIcon c={c} size={16}/>}>
      {!data
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>Loading…</div>
        : <>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 13px",borderRadius:12,background:c.sf,border:"1px solid "+c.ln,marginBottom:12}}>
              <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",flexShrink:0}}>{lvl}</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:c.tx}}>Level {lvl} — {names[lvl]||"Unknown"}</div>
                <div style={{fontSize:10,color:c.so}}>Current autonomy level</div>
              </div>
              <Pill c={c} status={data?.violations>0?"critical":"healthy"} label={data?.violations>0?"Violations":"Clean"}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:11,color:c.so}}>Daily actions</span>
                <span style={{fontSize:11,fontWeight:700,color:pct>80?"#EF4444":c.ac}}>{used}/{limit}</span>
              </div>
              <div style={{height:6,borderRadius:3,background:c.ln}}>
                <div style={{height:"100%",borderRadius:3,width:pct+"%",background:pct>80?"#EF4444":pct>60?"#F59E0B":c.gr,transition:"width .5s"}}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <Stat c={c} label="Communication" value={data?.usage?.communication||0}/>
              <Stat c={c} label="Modifications" value={data?.usage?.data_modification||0}/>
              <Stat c={c} label="Violations" value={data?.violations||0} accent={data?.violations>0?"#EF4444":c.ac}/>
            </div>
          </>
      }
    </Card>
  );
}

// ── AGENTIC EXECUTIONS
function AgenticExecutions({c,sse}) {
  const [execs,setExecs] = useState([]);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/agentic-executions?limit=5", await withAuth()); if(r.ok){ const d=await r.json(); setExecs(d.executions||d||[]); } }catch{} };
    go();
    const clean=sse?.register("executions",go);
    if(!clean){ const t=setInterval(go,15000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const statusColors={completed:c.gr,running:c.bl,failed:"#EF4444",pending:"#F59E0B"};

  return(
    <Card c={c} title="Agentic Executions" subtitle="Multi-turn task runs" icon={<BoltIcon c={c} size={16}/>}>
      {execs.length===0
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>No executions yet</div>
        : execs.map((ex,i)=>(
            <div key={i} style={{padding:"10px 12px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln,marginBottom:i<execs.length-1?8:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                <div style={{fontSize:12,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,paddingRight:8}}>{ex.task||ex.objective||"Task"}</div>
                <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:8,background:(statusColors[ex.status]||c.fa)+"18",color:statusColors[ex.status]||c.fa,flexShrink:0}}>{ex.status}</span>
              </div>
              <div style={{display:"flex",gap:12}}>
                <span style={{fontSize:10,color:c.so}}>{ex.turns||0} turns</span>
                <span style={{fontSize:10,color:c.so}}>{ex.toolCalls||0} tools</span>
                {ex.duration&&<span style={{fontSize:10,color:c.so}}>{ex.duration}ms</span>}
              </div>
            </div>
          ))
      }
    </Card>
  );
}

// ── SUB-AGENTS
function SubAgents({c,sse}) {
  const [agents,setAgents] = useState([]);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/sub-agents", await withAuth()); if(r.ok){ const d=await r.json(); setAgents(d.agents||d||[]); } }catch{} };
    go();
    const clean=sse?.register("subagents",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  return(
    <Card c={c} title="Sub-Agent Network" subtitle="5 domain specialists" icon={<RobotIcon c={c} size={16}/>}>
      {agents.length===0
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>No sub-agents active</div>
        : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {agents.map((a,i)=>(
              <div key={i} style={{padding:"10px 12px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{a.name?.charAt(0)||"A"}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                    <div style={{fontSize:9,color:c.so}}>{(a.expertise||[]).slice(0,2).join(", ")}</div>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:9,color:c.so}}>{a.taskCount||0} tasks</span>
                  <Pill c={c} status={a.status||"active"}/>
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  );
}

// ── TOOL PERFORMANCE
function ToolPerformance({c,sse}) {
  const [data,setData] = useState(null);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/tool-performance", await withAuth()); if(r.ok) setData(await r.json()); }catch{} };
    go();
    const clean=sse?.register("tools",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const tools=data?.topTools||data?.tools||[];

  return(
    <Card c={c} title="Tool Performance" subtitle="60 BLOOM CRM tools + internal" icon={<WrenchIcon c={c} size={16}/>}>
      {!data
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>Loading…</div>
        : <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
              <Stat c={c} label="Total Calls" value={data.totalCalls||0}/>
              <Stat c={c} label="Success Rate" value={((data.successRate||0)*100).toFixed(0)+"%"}/>
              <Stat c={c} label="Avg Time" value={(data.avgExecutionTime||0).toFixed(0)+"ms"}/>
            </div>
            <div style={{maxHeight:180,overflowY:"auto"}}>
              {tools.slice(0,8).map((t,i)=>{
                const rate=t.successRate||(t.calls>0?t.success/t.calls:0);
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:i<Math.min(tools.length,8)-1?"1px solid "+c.ln+"50":"none"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div>
                      <div style={{height:3,borderRadius:2,background:c.ln,marginTop:3}}>
                        <div style={{height:"100%",borderRadius:2,width:(rate*100)+"%",background:rate>0.9?c.gr:rate>0.7?"#F59E0B":"#EF4444"}}/>
                      </div>
                    </div>
                    <span style={{fontSize:9,color:c.so,flexShrink:0}}>{t.calls||0}</span>
                  </div>
                );
              })}
            </div>
          </>
      }
    </Card>
  );
}

// ── CONTEXT ANALYTICS
function ContextAnalytics({c,sse}) {
  const [data,setData] = useState(null);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/context-analytics", await withAuth()); if(r.ok) setData(await r.json()); }catch{} };
    go();
    const clean=sse?.register("context",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const pct=data?.utilizationPercent||0;
  const barColor=pct>80?"#EF4444":pct>60?"#F59E0B":c.gr;

  return(
    <Card c={c} title="Context Analytics" subtitle="Token usage & compression" icon={<BrainIcon c={c} size={16}/>}>
      {!data
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>Loading…</div>
        : <>
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:11,color:c.so}}>Context utilization</span>
                <span style={{fontSize:11,fontWeight:700,color:barColor}}>{pct.toFixed(0)}%</span>
              </div>
              <div style={{height:8,borderRadius:4,background:c.ln}}>
                <div style={{height:"100%",borderRadius:4,width:pct+"%",background:barColor,transition:"width .5s"}}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <Stat c={c} label="Used Tokens" value={(data.usedTokens||0).toLocaleString()}/>
              <Stat c={c} label="Max Tokens" value={(data.maxTokens||0).toLocaleString()}/>
              <Stat c={c} label="Compressions" value={data.compressionCount||0}/>
            </div>
          </>
      }
    </Card>
  );
}

// ── ACTION LOG
function ActionLog({c,sse}) {
  const [actions,setActions] = useState([]);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/action-log?limit=20", await withAuth()); if(r.ok){ const d=await r.json(); setActions(d.actions||d||[]); } }catch{} };
    go();
    const clean=sse?.register("actions",go);
    if(!clean){ const t=setInterval(go,15000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const catColors={communication:c.bl,data_modification:"#F59E0B",data_creation:c.gr,read:c.fa,logging:c.pu};

  return(
    <Card c={c} title="Action Log" subtitle="Live activity feed" icon={<ClipboardIcon c={c} size={16}/>}>
      <div style={{maxHeight:260,overflowY:"auto"}}>
        {actions.length===0
          ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>No actions yet</div>
          : actions.map((a,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:i<actions.length-1?"1px solid "+c.ln+"50":"none"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:catColors[a.category]||c.fa,marginTop:5,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.action_type||a.type}</div>
                  <div style={{fontSize:10,color:c.so,marginTop:1}}>{a.description||a.message}</div>
                </div>
                <div style={{fontSize:9,color:c.fa,flexShrink:0}}>{a.time||new Date(a.timestamp).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>
              </div>
            ))
        }
      </div>
    </Card>
  );
}

// ── INTERNAL TASKS
function InternalTasks({c,sse,aFN="Sarah"}) {
  const [tasks,setTasks] = useState([]);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/internal-tasks", await withAuth()); if(r.ok){ const d=await r.json(); setTasks(d.tasks||d||[]); } }catch{} };
    go();
    const clean=sse?.register("tasks",go);
    if(!clean){ const t=setInterval(go,20000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const statusColors={pending:"#F59E0B",in_progress:c.bl,completed:c.gr,failed:"#EF4444"};

  return(
    <Card c={c} title="Internal Tasks" subtitle={`${aFN}'s active work queue`} icon={<TaskListIcon c={c} size={16}/>}>
      <div style={{maxHeight:240,overflowY:"auto"}}>
        {tasks.length===0
          ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>No active tasks</div>
          : tasks.map((task,i)=>(
              <div key={i} style={{padding:"8px 0",borderBottom:i<tasks.length-1?"1px solid "+c.ln+"50":"none"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                  <div style={{fontSize:12,fontWeight:600,color:c.tx,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
                  <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8,background:(statusColors[task.status]||c.fa)+"18",color:statusColors[task.status]||c.fa,flexShrink:0,marginLeft:8}}>{task.status}</span>
                </div>
                <div style={{fontSize:10,color:c.so}}>{task.description||task.body}</div>
              </div>
            ))
        }
      </div>
    </Card>
  );
}

// ── TASK RUN TIMELINE — visual bar chart of recent task executions
function TaskRunTimeline({c, agentId}) {
  const [runs,setRuns] = useState([]);
  useEffect(()=>{
    const go=async()=>{
      try{
        const qs = agentId ? `?agentId=${agentId}` : '';
        const r=await fetch(`/api/agent/tasks/runs${qs}`, await withAuth());
        if(r.ok){ const d=await r.json(); setRuns((d.runs||d||[]).slice(0,24)); }
      }catch{}
    };
    go();
    const t=setInterval(go,30000);
    return()=>clearInterval(t);
  },[agentId]);

  const completed=runs.filter(r=>r.status==="completed").length;
  const failed=runs.filter(r=>r.status==="failed").length;
  const total=runs.length;
  const rate=total>0?((completed/total)*100).toFixed(0):"—";

  return(
    <Card c={c} title="Task Run Timeline" subtitle={`Last ${total} runs · ${rate}% success`} icon={<BoltIcon c={c} size={16}/>}>
      {runs.length===0
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>No task runs yet</div>
        : <>
            {/* Summary stats row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>
              <Stat c={c} label="Total Runs" value={total}/>
              <Stat c={c} label="Completed" value={completed} accent={c.gr}/>
              <Stat c={c} label="Failed" value={failed} accent={failed>0?"#EF4444":c.gr}/>
              <Stat c={c} label="Success %" value={rate+"%"} accent={parseInt(rate)>80?c.gr:parseInt(rate)>50?"#F59E0B":"#EF4444"}/>
            </div>
            {/* Visual bar chart */}
            <div style={{display:"flex",gap:3,alignItems:"flex-end",height:60,marginBottom:10}}>
              {runs.slice().reverse().map((r,i)=>{
                const dur=r.executionTime||r.duration||5000;
                const maxDur=Math.max(...runs.map(x=>x.executionTime||x.duration||5000),1);
                const h=Math.max(8,Math.round((dur/maxDur)*56));
                const bg=r.status==="completed"?c.gr:r.status==="failed"?"#EF4444":"#F59E0B";
                return <div key={i} title={`${r.taskName||"Task"}\n${r.status} · ${Math.round(dur/1000)}s`} style={{flex:1,height:h,borderRadius:3,background:bg+"90",cursor:"default",transition:"height .3s",minWidth:0}}/>;
              })}
            </div>
            {/* Legend */}
            <div style={{display:"flex",gap:14,justifyContent:"center"}}>
              {[{label:"Completed",color:c.gr},{label:"Failed",color:"#EF4444"},{label:"Pending",color:"#F59E0B"}].map(l=>(
                <div key={l.label} style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:8,height:8,borderRadius:2,background:l.color+"90"}}/>
                  <span style={{fontSize:10,color:c.so}}>{l.label}</span>
                </div>
              ))}
            </div>
            {/* Recent runs list */}
            <div style={{marginTop:12,maxHeight:160,overflowY:"auto"}}>
              {runs.slice(0,8).map((r,i)=>{
                const sc=r.status==="completed"?c.gr:r.status==="failed"?"#EF4444":"#F59E0B";
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:i<7?"1px solid "+c.ln+"40":"none"}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:sc,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.taskName||"Unknown Task"}</div>
                    </div>
                    <span style={{fontSize:9,color:c.so,flexShrink:0}}>{r.executionTime?Math.round(r.executionTime/1000)+"s":""}</span>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:8,background:sc+"18",color:sc,flexShrink:0}}>{r.status}</span>
                  </div>
                );
              })}
            </div>
          </>
      }
    </Card>
  );
}

// ── ESCALATIONS + REJECTIONS (tabbed)
function EscalationPanel({c,sse,agentId}) {
  const [handoffs,setHandoffs] = useState([]);
  const [rejections,setRejections] = useState([]);
  const [tab,setTab] = useState("handoffs");

  useEffect(()=>{
    const qs = agentId ? `&agentId=${agentId}` : '';
    const fetchH=async()=>{ try{ const r=await fetch(`/api/dashboard/handoff-log?limit=10${qs}`, await withAuth()); if(r.ok){ const d=await r.json(); setHandoffs(d.handoffs||d||[]); } }catch{} };
    const fetchR=async()=>{ try{ const r=await fetch(`/api/dashboard/rejection-log?limit=10${qs}`, await withAuth()); if(r.ok){ const d=await r.json(); setRejections(d.rejections||d||[]); } }catch{} };
    fetchH(); fetchR();
    if(sse){
      const c1=sse.register("handoffs",fetchH);
      const c2=sse.register("rejections",fetchR);
      return()=>{ c1(); c2(); };
    }
    const t=setInterval(()=>{ fetchH(); fetchR(); },20000);
    return()=>clearInterval(t);
  },[sse,agentId]);

  const items=tab==="handoffs"?handoffs:rejections;
  const tabs=[
    {k:"handoffs",l:<><HandshakeIcon c={c} size={14}/> <span style={{marginLeft:4}}>Escalations</span></>,ct:handoffs.length},
    {k:"rejections",l:<><XCircleIcon c={c} size={14}/> <span style={{marginLeft:4}}>Rejections</span></>,ct:rejections.length}
  ];

  return(
    <Card c={c} title="Escalations & Rejections" action={
      <div style={{display:"flex",gap:3,background:c.sf,padding:3,borderRadius:8}}>
        {tabs.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:tab===t.k?c.cd:"transparent",color:tab===t.k?c.tx:c.so}}>
            {t.l} ({t.ct})
          </button>
        ))}
      </div>
    }>
      <div style={{maxHeight:220,overflowY:"auto"}}>
        {items.length===0
          ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>{tab==="handoffs"?"No escalations":"No rejections"}</div>
          : items.map((item,i)=>(
              <div key={i} style={{padding:"8px 0",borderBottom:i<items.length-1?"1px solid "+c.ln+"50":"none"}}>
                <div style={{fontSize:12,fontWeight:600,color:c.tx,marginBottom:2}}>{item.issue||item.action||item.reason}</div>
                <div style={{fontSize:10,color:c.so}}>{item.recommendation||item.code} {item.urgency||item.risk?"· "+(item.urgency||item.risk):""}</div>
              </div>
            ))
        }
      </div>
    </Card>
  );
}

// ── RESIZABLE PANEL — drag left edge to resize screen viewer
function ResizablePanel({c,defaultWidth,minWidth,maxWidth,children}) {
  const [width,setWidth] = useState(defaultWidth||480);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = (e) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(()=>{
    const onMove = (e) => {
      if(!dragging.current) return;
      const delta = startX.current - e.clientX;
      const newW = Math.min(maxWidth||800, Math.max(minWidth||280, startW.current + delta));
      setWidth(newW);
    };
    const onUp = () => {
      if(!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
  },[]);

  return(
    <div style={{width,flexShrink:0,borderLeft:"1px solid "+c.ln,display:"flex",flexDirection:"column",position:"relative",transition:"width .25s ease"}}>
      <div onMouseDown={onMouseDown} style={{position:"absolute",left:0,top:0,bottom:0,width:8,cursor:"ew-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}} title="Drag to resize">
        <div style={{width:3,height:40,borderRadius:2,background:c.ln}}/>
      </div>
      {children}
    </div>
  );
}


// ── SCREEN VIEWER — live feed from Sarah's browser via SSE
function Screen({c,mob,mode,setMode,aFN="Sarah"}) {
  const [screenshot,setScreenshot] = useState(null);
  const [browserUrl,setBrowserUrl] = useState(null);
  const [live,setLive] = useState(false);

  useEffect(()=>{
    if(mode==="hidden") return;
    let es;
    let retryCount = 0;
    let retryTimer = null;
    const MAX_RETRIES = 5;
    const connect = () => {
      if(es) { try { es.close(); } catch {} es = null; }
      es = new EventSource("/api/browser/stream");
      es.onmessage = (e) => {
        retryCount = 0; // reset on successful message
        try {
          const d = JSON.parse(e.data);
          if(d.type==="screenshot") {
            setScreenshot("data:image/jpeg;base64,"+d.data);
            setBrowserUrl(d.url);
            setLive(true);
          }
          if(d.type==="status") {
            setLive(d.live);
            if(d.url) setBrowserUrl(d.url);
          }
        } catch {}
      };
      es.onerror = () => {
        setLive(false);
        try { es.close(); } catch {}
        es = null;
        if(retryCount < MAX_RETRIES) {
          // Exponential backoff: 5s, 10s, 20s, 40s, 60s
          const delay = Math.min(5000 * Math.pow(2, retryCount), 60000);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        }
        // After MAX_RETRIES, stop reconnecting — browser is simply not active
      };
    };
    connect();
    return () => {
      if(retryTimer) clearTimeout(retryTimer);
      try { es&&es.close(); } catch {}
    };
  },[mode]);

  if(mode==="hidden") return null;
  const wrap=mode==="full"
    ?{position:"fixed",inset:0,zIndex:300,background:"#000",display:"flex",flexDirection:"column"}
    :mode==="pop"
    ?{position:"fixed",bottom:mob?12:20,right:mob?12:20,width:mob?200:340,height:mob?130:210,zIndex:250,borderRadius:14,overflow:"hidden",boxShadow:"0 12px 48px rgba(0,0,0,.45)",border:"2px solid "+c.ac+"60"}
    :{borderRadius:0,overflow:"hidden",border:"none",display:"flex",flexDirection:"column",flex:1,height:"100%"};
  return(
    <div style={wrap}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px",height:36,background:mode==="full"?"#111":c.cd,borderBottom:"1px solid "+c.ln,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:live?"#34A853":c.fa,animation:live?"pulse 1.2s ease infinite":"none"}}/>
          <span style={{fontSize:11,fontWeight:600,color:live?c.gr:c.so}}>{live?"LIVE":"Idle"}</span>
        </div>
        <div style={{display:"flex",gap:4}}>
          {mode!=="pop"&&<button onClick={()=>setMode("pop")} style={{width:24,height:24,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="1.8"><path d="M9 2h5v5M14 2L8 8M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3"/></svg>
          </button>}
          {mode!=="full"&&<button onClick={()=>setMode("full")} style={{width:24,height:24,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="1.8"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>
          </button>}
          {(mode==="full"||mode==="pop")&&<button onClick={()=>setMode(mode==="full"?"docked":"hidden")} style={{width:24,height:24,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>}
          {mode==="docked"&&<button onClick={()=>setMode("hidden")} style={{width:24,height:24,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="2"><path d="M3 8h10"/></svg>
          </button>}
        </div>
      </div>
      <div style={{background:"#0a0a0a",flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        {screenshot&&live ? (
          <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column"}}>
            {browserUrl&&(
              <div style={{padding:"4px 8px",background:"#1c1c1c",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <div style={{display:"flex",gap:4}}>{["#ff5f57","#febc2e","#28c840"].map((co,i)=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:co}}/>)}</div>
                <div style={{flex:1,padding:"3px 8px",borderRadius:4,background:"#111",fontSize:10,color:"#aaa",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{browserUrl}</div>
              </div>
            )}
            <img src={screenshot} alt={aFN+"'s browser"} style={{width:"100%",flex:1,objectFit:"contain",display:"block"}}/>
          </div>
        ):(
          <div style={{textAlign:"center",padding:30}}>
            
            <div style={{fontSize:13,color:"#666",marginBottom:4}}>Browser idle</div>
            <div style={{fontSize:11,color:"#555"}}>Activates when {aFN} starts browsing</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP — Jaden's layout, Sarah's data
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   PROGRESS RING — circular progress indicator
   ═══════════════════════════════════════════════════════════════ */
function ProgressRing({pct,sz,stroke,color,bg}) {
  const s=sz||60; const sw=stroke||5;
  const r=(s-sw)/2; const circ=2*Math.PI*r;
  const offset=circ*(1-(pct||0)/100);
  return(
    <svg width={s} height={s} style={{transform:"rotate(-90deg)"}}>
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={bg||"rgba(255,255,255,.1)"} strokeWidth={sw}/>
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={color||"#F4A261"} strokeWidth={sw}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{transition:"stroke-dashoffset .6s ease"}}/>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ACTIVE TASK TRACKER — right panel task progress
   ═══════════════════════════════════════════════════════════════ */
function ActiveTaskTracker({c, sessionId}) {
  const [todos,setTodos]=useState([]);
  const [isActive,setIsActive]=useState(false);

  useEffect(()=>{
    if(!sessionId){setTodos([]);setIsActive(false);return;}

    // Clear immediately on session change
    setTodos([]);setIsActive(false);

    // Subscribe to real-time task_progress SSE stream
    const es=new EventSource(`/api/chat/progress-stream?sessionId=${encodeURIComponent(sessionId)}`);

    es.onmessage=(e)=>{
      try{
        const d=JSON.parse(e.data);
        if(d.connected) return; // handshake ping
        if(Array.isArray(d.todos)){
          setTodos(d.todos);
          setIsActive(d.todos.some(t=>t.status==='in_progress'));
        }
      }catch{}
    };

    es.onerror=()=>{
      // SSE disconnected — fall back to one-time fetch
      fetch(`/api/chat/progress-stream?sessionId=${encodeURIComponent(sessionId)}`)
        .catch(()=>{});
    };

    return()=>es.close();
  },[sessionId]);

  if(todos.length===0) return(
    <div style={{padding:"16px",textAlign:"center",color:c.fa,fontSize:12}}>No active tasks</div>
  );

  const done=todos.filter(t=>t.status==='completed').length;
  const total=todos.length;
  const pct=Math.round((done/total)*100);

  return(
    <div style={{padding:"8px 0"}}>
      {/* Progress header */}
      <div style={{padding:"12px 16px 8px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{position:"relative",flexShrink:0}}>
          <ProgressRing pct={pct} sz={44} stroke={4} color={isActive?c.ac:c.gr} bg={c.ln}/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:c.tx}}>{pct}%</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:c.tx}}>{isActive?"Working...":"Complete"}</div>
          <div style={{fontSize:10,color:c.so,marginTop:2}}>{done} of {total} steps done</div>
        </div>
      </div>
      {/* Step checklist */}
      <div style={{padding:"0 16px 12px"}}>
        {todos.map((t,i)=>{
          const isDone=t.status==='completed';
          const isNow=t.status==='in_progress';
          const isPending=t.status==='pending';
          return(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"4px 0",opacity:isPending?0.45:1,transition:"opacity 0.2s"}}>
              <div style={{
                width:18,height:18,borderRadius:"50%",flexShrink:0,marginTop:1,
                display:"flex",alignItems:"center",justifyContent:"center",
                background:isDone?c.gr:isNow?"transparent":c.ln,
                border:isNow?"2px solid "+c.ac:"none",
                transition:"all 0.3s"
              }}>
                {isDone&&<span style={{fontSize:10,color:"#fff",fontWeight:700}}>✓</span>}
                {isNow&&<span style={{width:7,height:7,borderRadius:"50%",background:c.ac,animation:"pulse 1.1s ease infinite",display:"block"}}/>}
              </div>
              <div style={{
                fontSize:12,lineHeight:1.4,
                color:isDone?c.so:isNow?c.tx:c.fa,
                textDecoration:isDone?"line-through":"none",
                fontStyle:isNow?"italic":"normal",
                transition:"all 0.2s"
              }}>
                {isNow?(t.activeForm||t.content):t.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INLINE CHAT CARDS — parse Sarah's responses for actionable items
   ═══════════════════════════════════════════════════════════════ */
function parseMessageCards(text) {
  if (!text) return [];
  const cards = [];

  // Detect task completion cards
  // Patterns: "Task completed", "✅ Created...", "✅ Updated...", "Successfully created/updated/sent/scheduled"
  const taskPatterns = [
    /(?:✅\s*)?(?:Task completed|Completed)[:\s—–-]*(.+?)(?:\.|!|$)/gi,
    /✅\s+(.+?)(?:\.|!|$)/gi,
    /(?:Successfully|I've successfully|I have successfully)\s+(created|updated|sent|scheduled|published|added|deleted|removed|completed|booked|set up|configured)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\.|!|$)/gi,
  ];
  const seenTasks = new Set();
  for (const pat of taskPatterns) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      // For the third pattern, combine verb + object
      const label = m[2] ? `${m[1]} ${m[2]}` : m[1];
      const clean = label.trim().replace(/^[:\s—–-]+/, "").substring(0, 80);
      if (clean.length > 2 && !seenTasks.has(clean.toLowerCase())) {
        seenTasks.add(clean.toLowerCase());
        cards.push({ type: "task", name: clean });
      }
    }
  }

  // Detect email draft cards — only trigger on clear email drafts, not casual mentions
  // Must have "Subject:" line OR explicit "I drafted/wrote an email" with subject
  const emailMatch = text.match(/^Subject[:\s]+["']?(.+?)["']?\s*$/im)
    || text.match(/(?:I've |I have |I )?(?:drafted|prepared|composed) (?:an |the |your )?email.*?(?:subject|titled|called)[:\s]+["']?(.+?)["']?(?:\.|!|$)/i);
  if (emailMatch) {
    const subject = (emailMatch[1] || emailMatch[2] || "Email draft").trim().substring(0, 100);
    cards.push({ type: "email", subject });
  }

  // Detect artifact creation — Sarah used create_artifact tool
  // PRIMARY: Hidden HTML comment tags <!-- file:filename.ext --> (invisible to user)
  const hiddenTagPattern = /<!--\s*file:\s*([^>]+?\.(?:html|md|docx|pdf|txt|js|css|jsx|json))\s*-->/gi;
  const foundFiles = new Set();
  let match;
  while ((match = hiddenTagPattern.exec(text)) !== null) {
    const fname = (match[1] || "").trim();
    if (fname && !foundFiles.has(fname)) {
      foundFiles.add(fname);
      cards.push({ type: "artifact", name: fname });
    }
  }

  // FALLBACK: Legacy trigger phrases (for older messages before the hidden tag format)
  if (foundFiles.size === 0) {
    const legacyPatterns = [
      /Here's your .+?(?:—|–|-) +"([^"]+\.(?:html|md|docx|pdf|txt|js|css|jsx|json))"/gi,
      /(?:I've created|I created|I've saved|I saved|I've built|I built|I've designed|I designed|Here's the|Here is) (?:a |an |the )?(?:deliverable|artifact|file|page|website|landing page|blog|post|document|report|email|draft).*?"([^"]+\.(?:html|md|docx|pdf|txt|js|css|jsx|json))"/gi,
      /"([^"]+\.(?:html|md|docx|pdf|txt|js|css|jsx|json))".*?(?:saved|created|ready|built|designed)/gi,
      /(?:saved|created|built|designed).*?"([^"]+\.(?:html|md|docx|pdf|txt|js|css|jsx|json))"/gi,
    ];
    for (const pattern of legacyPatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const fname = (match[1] || "").trim();
        if (fname && !foundFiles.has(fname)) {
          foundFiles.add(fname);
          cards.push({ type: "artifact", name: fname });
        }
      }
    }
  }

  // Last resort: mentions Files tab
  if (foundFiles.size === 0) {
    const fallbackMatch = text.match(/(?:in your Files tab|saved to (?:your )?Files|it's in (?:your )?Files|check (?:your |the )?Files tab|ready for you to review|approve it|check it out in Files|view it in Files)/i);
    if (fallbackMatch) {
      cards.push({ type: "artifact", name: "__latest__" });
    }
  }

  return cards;
}

// Strip hidden file tags and legacy trigger phrases from message text before rendering
function cleanMessageText(text) {
  if (!text) return text;
  let cleaned = text;
  // Remove hidden file tags: <!-- file:filename.ext -->
  cleaned = cleaned.replace(/<!--\s*file:\s*[^>]+?-->\n?/g, '');
  // Remove legacy trigger phrases: "Here's your [type] — "filename.ext""
  cleaned = cleaned.replace(/Here's your .+?(?:—|–|-)\s*"[^"]+\.(?:html|md|docx|pdf|txt|js|css|jsx|json)"\n?/gi, '');
  // Strip __clarification JSON from display text (will be rendered as card instead)
  cleaned = cleaned.replace(/\{"__clarification"\s*:\s*true[\s\S]*$/g, '');
  // Clean up any resulting double blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

// Parse __clarification JSON from message text (for history-loaded messages)
function parseClarification(text) {
  if (!text) return null;
  try {
    // Check if the whole message is a clarification JSON
    if (text.trimStart().startsWith('{"__clarification"')) {
      const parsed = JSON.parse(text.trim());
      if (parsed.__clarification && parsed.clarification) return parsed.clarification;
    }
    // Check if clarification JSON is embedded at the end of the message
    const idx = text.indexOf('{"__clarification"');
    if (idx >= 0) {
      const jsonStr = text.slice(idx);
      const parsed = JSON.parse(jsonStr);
      if (parsed.__clarification && parsed.clarification) return parsed.clarification;
    }
  } catch (e) { /* not valid JSON, skip */ }
  return null;
}

// ClarificationCard — renders Sarah's question with clickable option buttons
function ClarificationCardInline({ clarification, onSelect, c, disabled }) {
  const [selected, setSelected] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const CUSTOM_IDX = -1;

  const handleClick = (opt, i) => {
    if (disabled || selected !== null) return;
    setSelected(i);
    if (onSelect) onSelect(opt);
  };

  const handleCustomToggle = () => {
    if (disabled || selected !== null) return;
    setShowCustom(s => !s);
  };

  const handleCustomSubmit = () => {
    if (!customText.trim() || selected !== null) return;
    setSelected(CUSTOM_IDX);
    if (onSelect) onSelect({ label: customText.trim(), description: '' });
  };

  return (
    <div style={{background:c.sf,border:"2px solid "+c.ac,borderRadius:16,padding:16,marginTop:10,maxWidth:380}}>
      <div style={{fontSize:14,fontWeight:600,color:c.tx,marginBottom:6,lineHeight:1.4}}>{clarification.question}</div>
      {clarification.context&&<div style={{fontSize:12,color:c.so,marginBottom:12,lineHeight:1.4}}>{clarification.context}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(clarification.options||[]).map((opt,i)=>{
          const isSel = selected===i;
          const isDis = disabled||(selected!==null&&!isSel);
          return (
            <button key={i} onClick={()=>handleClick(opt,i)} disabled={isDis} style={{
              display:"flex",flexDirection:"column",alignItems:"flex-start",padding:"10px 14px",borderRadius:12,
              border:isSel?"2px solid "+c.ac:"1px solid "+c.ln,
              background:isSel?c.ac+"15":isDis?c.so+"10":c.sf,
              cursor:isDis?"default":"pointer",opacity:isDis&&!isSel?0.5:1,
              transition:"all 0.15s ease",textAlign:"left",width:"100%"
            }}>
              <span style={{fontSize:13,fontWeight:600,color:isSel?c.ac:c.tx}}>{isSel?"✓ ":""}{opt.label}</span>
              {opt.description&&<span style={{fontSize:11,color:c.so,lineHeight:1.3,marginTop:2}}>{opt.description}</span>}
            </button>
          );
        })}

        {/* Other — free text option */}
        {selected===null&&!disabled&&(
          <div>
            <button onClick={handleCustomToggle} style={{
              display:"flex",alignItems:"center",gap:6,padding:"10px 14px",borderRadius:12,
              border:showCustom?"2px solid "+c.ac:"1px dashed "+c.ln,
              background:showCustom?c.ac+"10":"transparent",
              cursor:"pointer",textAlign:"left",width:"100%",transition:"all 0.15s"
            }}>
              <span style={{fontSize:13,fontWeight:600,color:c.so}}>{showCustom?"▾":"▸"} Something else...</span>
            </button>
            {showCustom&&(
              <div style={{display:"flex",gap:8,marginTop:6,padding:"0 2px"}}>
                <input
                  autoFocus
                  type="text"
                  value={customText}
                  onChange={e=>setCustomText(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleCustomSubmit()}
                  placeholder="Type your answer..."
                  style={{
                    flex:1,padding:"8px 12px",borderRadius:10,
                    border:"1.5px solid "+c.ac,background:c.cd,
                    fontSize:13,color:c.tx,outline:"none"
                  }}
                />
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customText.trim()}
                  style={{
                    padding:"8px 14px",borderRadius:10,border:"none",
                    background:customText.trim()?c.ac:c.ln,
                    color:"#fff",fontSize:13,fontWeight:600,
                    cursor:customText.trim()?"pointer":"default"
                  }}
                >Send</button>
              </div>
            )}
          </div>
        )}
      </div>
      {selected!==null&&<div style={{fontSize:11,color:c.ac,marginTop:8,fontWeight:500}}>✓ On it...</div>}
    </div>
  );
}

// ── SESSION FILES PANEL — right panel shows files from current chat ──────────
function ImageLightbox({src, alt, onClose}) {
  useEffect(()=>{
    const h = e => { if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown', h);
    return ()=>document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position:'fixed',inset:0,zIndex:9999,
      background:'rgba(0,0,0,0.88)',
      display:'flex',alignItems:'center',justifyContent:'center',
      cursor:'zoom-out',
      backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)'
    }}>
      <button onClick={onClose} style={{
        position:'fixed',top:20,right:24,
        background:'rgba(255,255,255,0.15)',
        border:'1px solid rgba(255,255,255,0.25)',
        borderRadius:'50%',
        width:40,height:40,
        display:'flex',alignItems:'center',justifyContent:'center',
        cursor:'pointer',color:'#fff',fontSize:20,lineHeight:1,
        backdropFilter:'blur(4px)',
        transition:'background .15s'
      }}
      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.28)'}
      onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.15)'}
      >×</button>
      <img src={src} alt={alt||''} onClick={e=>e.stopPropagation()} style={{
        maxWidth:'90vw',maxHeight:'90vh',
        borderRadius:12,objectFit:'contain',
        boxShadow:'0 32px 96px rgba(0,0,0,0.8)',
        cursor:'default',userSelect:'none'
      }}/>
    </div>
  );
}

function SessionFilesPanel({c, sessionId, setActiveArtifact, aFN="Sarah"}){
  const [lightbox,setLightbox]=useState(null);
  const [files,setFiles]=useState([]);
  const [uploads,setUploads]=useState([]);
  const [loading,setLoading]=useState(true);

  const fetchAll = async ()=>{
    if(!sessionId) return;
    Promise.all([
      withAuth().then(h=>fetch(`/api/files/artifacts?sessionId=${sessionId}&limit=20`,h)).then(r=>r.json()).catch(()=>({})),
      withAuth().then(h=>fetch(`/api/chat/uploads/list?sessionId=${sessionId}`,h)).then(r=>r.json()).catch(()=>({}))
    ]).then(([artifactsData, uploadsData])=>{
      setFiles(artifactsData.artifacts||[]);
      setUploads(uploadsData.uploads||[]);
      setLoading(false);
    });
  };

  useEffect(()=>{ fetchAll(); },[sessionId]);

  // Poll for new artifacts every 5s
  useEffect(()=>{
    const interval=setInterval(fetchAll, 5000);
    return()=>clearInterval(interval);
  },[sessionId]);

  if(loading) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:c.so,fontSize:12}}>Loading...</div>;

  if(files.length===0 && uploads.length===0) return(
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:30}}>
      <div>
        <div style={{fontSize:13,color:c.so,marginBottom:4}}>No files in this chat</div>
        <div style={{fontSize:11,color:c.fa}}>Ask {aFN} to create content — blogs, websites, emails, docs — and they'll appear here</div>
      </div>
    </div>
  );

  // Modern file type badge component
  const FileBadge = ({ ext }) => {
    const badges = {
      html: { label: 'HTML', bg: 'linear-gradient(135deg, #E44D26, #F16529)', icon: '🌐' },
      md: { label: 'MD', bg: 'linear-gradient(135deg, #083FA1, #0969DA)', icon: '📝' },
      png: { label: 'PNG', bg: 'linear-gradient(135deg, #8B5CF6, #A78BFA)', icon: '🖼️' },
      jpg: { label: 'JPG', bg: 'linear-gradient(135deg, #8B5CF6, #A78BFA)', icon: '🖼️' },
      jpeg: { label: 'JPG', bg: 'linear-gradient(135deg, #8B5CF6, #A78BFA)', icon: '🖼️' },
      js: { label: 'JS', bg: 'linear-gradient(135deg, #F7DF1E, #FFEA00)', icon: '💻' },
      py: { label: 'PY', bg: 'linear-gradient(135deg, #3776AB, #FFD43B)', icon: '🐍' },
    };
    const badge = badges[ext] || { label: ext.toUpperCase(), bg: 'linear-gradient(135deg, #6B7280, #9CA3AF)', icon: '📄' };
    return (
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        padding: '4px 8px',
        borderRadius: 6,
        background: badge.bg,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.5px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        zIndex: 2,
      }}>{badge.label}</div>
    );
  };

  const SectionLabel = ({label, count}) => (
    <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,marginTop:4,padding:"0 4px",display:"flex",alignItems:"center",gap:6}}>
      {label}
      <span style={{fontSize:10,fontWeight:600,color:c.fa,background:c.ln,padding:"1px 6px",borderRadius:10}}>{count}</span>
    </div>
  );

  return(
    <>
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {/* ── Bloomie created ── */}
      {files.length>0&&<>
        <SectionLabel label="Created by Bloomie" count={files.length}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',gap:10,marginBottom:20}}>
        {files.map(f=>{
          const ext=(f.name||'').split('.').pop()?.toLowerCase()||'';
          const isImage = ['png','jpg','jpeg','gif','webp'].includes(ext);
          
          return(
            <div key={f.fileId} onClick={async()=>{
              if(isImage){
                setLightbox({src:f.storagePath||f.previewUrl||`/api/files/preview/${f.fileId}`,alt:f.name});
                return;
              }
              try{
                const pr=await fetch(`/api/files/preview/${f.fileId}`, await withAuth());
                if(pr.headers.get('content-type')?.includes('json')){
                  const pd=await pr.json();
                  setActiveArtifact({name:f.name,content:pd.content||'',fileId:f.fileId});
                }
              }catch{}
            }} style={{
              position: 'relative',
              borderRadius:12,
              border:"1px solid "+c.ln,
              background:c.cd,
              cursor:"pointer",
              overflow:"hidden",
              transition:"all .2s",
              aspectRatio: '1'
            }}
              onMouseEnter={e=>{
                e.currentTarget.style.borderColor=c.ac;
                e.currentTarget.style.transform="translateY(-2px)";
                e.currentTarget.style.boxShadow="0 8px 16px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.borderColor=c.ln;
                e.currentTarget.style.transform="translateY(0)";
                e.currentTarget.style.boxShadow="none";
              }}>
              
              <FileBadge ext={ext} />
              
              {/* Preview Image or Icon */}
              <div style={{
                width:'100%',
                height:'100%',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                background: isImage ? '#000' : ext==='html' ? '#fff' : c.bg,
                position: 'relative',
                overflow: 'hidden'
              }}>
                {isImage && (f.storagePath || f.previewUrl) ? (
                  <img 
                    src={f.storagePath || f.previewUrl}
                    alt={f.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      cursor: 'zoom-in'
                    }}
                  />
                ) : ext==='html' ? (
                  /* Website preview iframe */
                  <iframe
                    src={`/api/files/preview/${f.fileId}`}
                    title={f.name}
                    sandbox="allow-same-origin"
                    style={{
                      width: '400%',
                      height: '400%',
                      border: 'none',
                      pointerEvents: 'none',
                      transform: 'scale(0.25)',
                      transformOrigin: 'top left'
                    }}
                  />
                ) : (
                  /* Modern SVG icons */
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="1.5" opacity="0.4">
                    {ext==='md' ? (
                      /* Markdown icon - document with lines */
                      <>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="7" y1="13" x2="17" y2="13"/>
                      <line x1="7" y1="17" x2="13" y2="17"/>
                      </>
                    ) : ext==='js' || ext==='py' ? (
                      /* Code icon - brackets */
                      <>
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                      </>
                    ) : (
                      /* Default file icon */
                      <>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      </>
                    )}
                  </svg>
                )}
              </div>

              {/* File Info Overlay */}
              <div style={{
                position:'absolute',
                bottom:0,
                left:0,
                right:0,
                padding:'8px 10px',
                background:'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                color:'#fff'
              }}>
                <div style={{fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                {f.description&&<div style={{fontSize:9,opacity:0.8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{f.description}</div>}
              </div>
            </div>
          );
        })}
        </div>
      </>}

      {/* ── Uploaded by you ── */}
      {uploads.length>0&&<>
        <SectionLabel label="Uploaded by you" count={uploads.length}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',gap:10}}>
          {uploads.map(u=>{
            const ext=(u.name||'').split('.').pop()?.toLowerCase()||'';
            const isImage=['png','jpg','jpeg','gif','webp'].includes(ext);
            return(
              <div key={u.uploadId} style={{
                position:'relative',borderRadius:12,border:"1px solid "+c.ln,
                background:c.cd,overflow:'hidden',aspectRatio:'1',
                transition:"all .2s"
              }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=c.ac;e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=c.ln;e.currentTarget.style.transform="translateY(0)";}}>
                <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:isImage?'#000':c.bg,overflow:'hidden'}}>
                  {isImage
                    ? <img src={u.previewUrl||`/api/chat/uploads/preview/${u.uploadId}`} alt={u.name} onClick={e=>{e.stopPropagation();setLightbox({src:u.previewUrl||`/api/chat/uploads/preview/${u.uploadId}`,alt:u.name});}} style={{width:'100%',height:'100%',objectFit:'cover',cursor:'zoom-in'}}/>
                    : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="1.5" opacity="0.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  }
                </div>
                <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 10px',background:'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',color:'#fff'}}>
                  <div style={{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </>}
    </div>
    {lightbox&&<ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={()=>setLightbox(null)}/>}
    </>
  );
}

// ── ArtifactPane — Claude-style code/preview panel in right sidebar ──────────
function ArtifactPane({ art, c, onClose, onRequestChanges }) {
  const [artView, setArtView] = useState('preview'); // 'preview' | 'code'
  const [publishing, setPublishing] = useState(false);
  const [publishSlug, setPublishSlug] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState(art.slug ? window.location.origin+'/p/'+art.slug : null);
  const [artContent, setArtContent] = useState(art.content || '');
  const isHtml = art.name?.endsWith('.html');

  // If content wasn't loaded yet, fetch it
  useEffect(() => {
    if (!art.content && art.fileId) {
      withAuth().then(h=>fetch(`/api/files/preview/${art.fileId}`,h))
        .then(r => r.json())
        .then(d => { if (d.content) setArtContent(d.content); })
        .catch(() => {});
    } else {
      setArtContent(art.content || '');
    }
    setPublishedUrl(art.slug ? window.location.origin+'/p/'+art.slug : null);
    setPublishSlug(art.name?.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '');
  }, [art.fileId, art.slug]);

  const doPublish = async () => {
    if (!publishSlug.trim()) return;
    setPublishing(true);
    try {
      const r = await fetch(`/api/files/artifacts/${art.fileId}/publish`, await withAuth({
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ slug: publishSlug.trim() })
      });
      const d = await r.json();
      if (d.success) {
        setPublishedUrl(window.location.origin + '/p/' + d.slug);
        setPublishOpen(false);
      }
    } catch {}
    setPublishing(false);
  };

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'10px 14px',borderBottom:'1px solid '+c.ln,background:c.cd,display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        <button onClick={onClose} style={{width:22,height:22,borderRadius:5,border:'1px solid '+c.ln,background:'transparent',cursor:'pointer',fontSize:11,color:c.so,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <div style={{flex:1,minWidth:0,fontSize:12,fontWeight:700,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{art.name}</div>
        {/* Code / Preview tabs — only for HTML */}
        {isHtml && (
          <div style={{display:'flex',gap:1,background:c.bg,borderRadius:7,padding:2,border:'1px solid '+c.ln,flexShrink:0}}>
            <button onClick={()=>setArtView('preview')} style={{padding:'3px 10px',borderRadius:5,border:'none',fontSize:10,fontWeight:700,cursor:'pointer',background:artView==='preview'?c.cd:'transparent',color:artView==='preview'?c.tx:c.so,fontFamily:'inherit',transition:'all .15s'}}>Preview</button>
            <button onClick={()=>setArtView('code')} style={{padding:'3px 10px',borderRadius:5,border:'none',fontSize:10,fontWeight:700,cursor:'pointer',background:artView==='code'?c.cd:'transparent',color:artView==='code'?c.tx:c.so,fontFamily:'inherit',transition:'all .15s'}}>Code</button>
          </div>
        )}
        {/* Publish button */}
        {isHtml && art.fileId && (
          publishedUrl ? (
            <a href={publishedUrl} target="_blank" rel="noopener noreferrer" style={{padding:'3px 9px',borderRadius:6,border:'1px solid #34a853',background:'rgba(52,168,83,0.1)',fontSize:10,fontWeight:700,color:'#34a853',textDecoration:'none',flexShrink:0}}>✓ Live ↗</a>
          ) : (
            <button onClick={()=>setPublishOpen(p=>!p)} style={{padding:'3px 9px',borderRadius:6,border:'1px solid '+c.ac,background:c.ac+'15',fontSize:10,fontWeight:700,color:c.ac,cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>Publish</button>
          )
        )}
        {art.fileId && <a href={`/api/files/download/${art.fileId}`} download style={{padding:'3px 9px',borderRadius:6,border:'1px solid '+c.ln,background:c.cd,fontSize:10,fontWeight:600,color:c.ac,textDecoration:'none',flexShrink:0}}>↓</a>}
        <button onClick={onClose} style={{width:22,height:22,borderRadius:5,border:'1px solid '+c.ln,background:'transparent',cursor:'pointer',fontSize:12,color:c.so,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>✕</button>
      </div>

      {/* Publish slug input */}
      {publishOpen && (
        <div style={{padding:'10px 14px',background:c.sf,borderBottom:'1px solid '+c.ln,display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
          <span style={{fontSize:11,color:c.so,whiteSpace:'nowrap'}}>/p/</span>
          <input value={publishSlug} onChange={e=>setPublishSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}
            placeholder="url-slug" style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:11,fontFamily:'monospace',outline:'none'}}
            onKeyDown={e=>e.key==='Enter'&&doPublish()}/>
          <button onClick={doPublish} disabled={publishing||!publishSlug.trim()} style={{padding:'5px 12px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:publishing?0.6:1}}>
            {publishing?'...':'Go Live'}
          </button>
          <button onClick={()=>setPublishOpen(false)} style={{padding:'5px 8px',borderRadius:6,border:'1px solid '+c.ln,background:'transparent',cursor:'pointer',fontSize:11,color:c.so,fontFamily:'inherit'}}>✕</button>
        </div>
      )}

      {/* Content */}
      <div style={{flex:1,overflow:'hidden',position:'relative'}}>
        {isHtml ? (
          artView === 'preview' ? (
            <iframe srcDoc={artContent} style={{width:'100%',height:'100%',border:'none',background:'#fff'}} sandbox="allow-scripts allow-same-origin" title={art.name}/>
          ) : (
            <div style={{height:'100%',overflow:'auto',background:'#1a1a2e'}}>
              <pre style={{margin:0,padding:'14px 16px',fontSize:11,lineHeight:1.6,color:'#e8e8f0',fontFamily:'monospace',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{artContent}</pre>
            </div>
          )
        ) : art.name?.match(/\.(docx|pdf|xlsx|pptx)$/) ? (
          <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:32,textAlign:'center'}}>
            <div style={{fontSize:13,color:c.so}}>This file type can't be previewed</div>
            <a href={art.fileId?`/api/files/download/${art.fileId}`:'#'} download style={{padding:'10px 24px',borderRadius:10,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',textDecoration:'none',fontSize:13,fontWeight:700}}>
              Download {art.name?.split('.').pop()?.toUpperCase()}
            </a>
          </div>
        ) : (
          <div style={{height:'100%',overflowY:'auto',padding:'14px 18px',fontSize:13,lineHeight:1.8,color:c.tx}}
            dangerouslySetInnerHTML={{__html:(artContent||'')
              .replace(/^# (.+)$/gm,'<h1 style="font-size:20px;font-weight:700;margin:14px 0 8px">$1</h1>')
              .replace(/^## (.+)$/gm,'<h2 style="font-size:16px;font-weight:700;margin:12px 0 6px">$1</h2>')
              .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
              .replace(/\*(.+?)\*/g,'<em>$1</em>')
              .replace(/^- (.+)$/gm,'<li style="margin-left:16px;margin-bottom:4px">$1</li>')
              .replace(/\n\n/g,'<br/><br/>')
              .replace(/\n/g,'<br/>')
            }}/>
        )}
      </div>

      {/* Footer actions */}
      <div style={{padding:'10px 14px',borderTop:'1px solid '+c.ln,background:c.cd,display:'flex',gap:6,flexShrink:0}}>
        <button onClick={()=>onRequestChanges(art.name)} style={{flex:1,padding:'8px 0',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,cursor:'pointer',fontSize:12,fontWeight:600,color:c.tx,fontFamily:'inherit'}}>Request Changes</button>
        {isHtml && art.fileId && (
          <button onClick={()=>{window.open(`/api/files/publish/${art.fileId}`,'_blank');}} style={{padding:'8px 12px',borderRadius:8,border:'1px solid '+c.ac,background:c.ac+'12',cursor:'pointer',fontSize:12,fontWeight:600,color:c.ac,fontFamily:'inherit'}}>↗ Full Screen</button>
        )}
      </div>
    </div>
  );
}

function ArtifactCard({ name, c, onOpenSide, mob }) {
  const [artData, setArtData] = useState(null);

  const dn = artData?.name || (name === '__latest__' ? 'Loading...' : name);
  const ext = dn.split('.').pop()?.toLowerCase() || '';
  const icon = null;

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/files/artifacts?limit=10', await withAuth());
        const d = await r.json();
        const match = name === '__latest__'
          ? d.artifacts?.[0]
          : d.artifacts?.find(a => a.name === name);
        if (match) setArtData(match);
      } catch {}
    })();
  }, [name]);

  const handleClick = async () => {
    if (!artData?.fileId) return;
    try {
      const pr = await fetch(`/api/files/preview/${artData.fileId}`, await withAuth());
      let content = 'Preview not available';
      if (pr.headers.get('content-type')?.includes('json')) {
        const pd = await pr.json();
        content = pd.content || content;
      }
      if (onOpenSide) {
        onOpenSide({ name: artData.name, content, fileId: artData.fileId });
      }
    } catch {}
  };

  return (
    <div onClick={handleClick} style={{marginTop:8,borderRadius:12,border:"1px solid rgba(52,168,83,0.3)",background:c.cd,cursor:"pointer",overflow:"hidden",transition:"transform .15s",display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}
      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
      onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
      <span style={{fontSize:20}}>{icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:700,color:c.gr,textTransform:"uppercase",letterSpacing:"0.5px"}}>New File — Saved</div>
        <div style={{fontSize:13,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dn}</div>
      </div>
      <span style={{fontSize:11,color:c.so}}>View →</span>
    </div>
  );
}

function TaskCard({ name, c }) {
  return (
    <div style={{
      display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginTop:8,
      borderRadius:12,background:c.gf,border:"1px solid rgba(52,168,83,0.3)",
    }}>
      <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(52,168,83,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <span style={{fontSize:14}}>✅</span>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:700,color:c.gr,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:1}}>Task Completed</div>
        <div style={{fontSize:13,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
      </div>
    </div>
  );
}

function EmailCard({ subject, c, onReview }) {
  return (
    <div style={{
      display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginTop:8,
      borderRadius:12,background:c.cd,border:"1px solid "+c.ln,
    }}>
      <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(244,162,97,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <span style={{fontSize:14}}>📧</span>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:700,color:c.ac,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:1}}>Email Draft</div>
        <div style={{fontSize:13,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subject}</div>
        <div style={{fontSize:11,color:c.so,marginTop:2}}>Ready for your review</div>
      </div>
      <button onClick={onReview} style={{
        padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,
        background:"linear-gradient(135deg,#F4A261,#E76F8B)",color:"#fff",whiteSpace:"nowrap",flexShrink:0,
      }}>Review & Approve</button>
    </div>
  );
}

// ── BILLING PAGE ──
const PLANS_DATA={
  standard:{name:"Standard",price:500,emails:1000,sms:200,mms:50,phone:0,images:0,videos:0,tasks:5},
  pro:{name:"Pro",price:800,emails:5000,sms:500,mms:150,phone:60,images:40,videos:0,tasks:15},
  enterprise:{name:"Enterprise",price:1200,emails:10000,sms:1000,mms:300,phone:200,images:80,videos:30,tasks:999},
};
const OVERAGE_RATES={email:0.02,sms:0.03,mms:0.06,phone:0.05,image:0.15,video:2.00};
const $=n=>"$"+n.toFixed(2);

function BillingUsageBar({icon,label,used,limit,rate,unit,c}){
  const over=Math.max(0,used-limit),isOver=over>0,progress=Math.min(100,(used/limit)*100),nearLimit=progress>75&&!isOver;
  return(
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:14}}>{icon}</span>
          <span style={{fontSize:13,fontWeight:600}}>{label}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:isOver?c.ac2:nearLimit?"#FBBC04":c.so}}>{used.toLocaleString()} / {limit.toLocaleString()}</span>
          {isOver&&<span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"rgba(234,67,53,0.12)",color:"#ea4335",border:"1px solid rgba(234,67,53,0.25)"}}>+{over.toLocaleString()} OVER</span>}
          {nearLimit&&!isOver&&<span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,background:"rgba(251,188,4,0.1)",color:"#FBBC04",border:"1px solid rgba(251,188,4,0.2)"}}>{Math.round(100-progress)}% left</span>}
        </div>
      </div>
      <div style={{height:7,borderRadius:4,background:c.ln,overflow:"hidden",position:"relative"}}>
        {isOver?(<>
          <div style={{position:"absolute",left:0,top:0,height:7,borderRadius:"4px 0 0 4px",width:((limit/used)*100)+"%",background:"#34a853",zIndex:2}}/>
          <div style={{position:"absolute",left:((limit/used)*100)+"%",top:0,height:7,borderRadius:"0 4px 4px 0",width:((over/used)*100)+"%",background:"repeating-linear-gradient(135deg,#ea4335,#ea4335 3px,rgba(234,67,53,0.6) 3px,rgba(234,67,53,0.6) 6px)",zIndex:2}}/>
        </>):(
          <div style={{height:7,borderRadius:4,transition:"width .5s",width:progress+"%",background:nearLimit?"#FBBC04":"#34a853"}}/>
        )}
      </div>
      {isOver&&<div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"#ea4335"}}><span>{over.toLocaleString()} extra × {$(rate)}/{unit}</span><span style={{fontWeight:700}}>{$(over*rate)}</span></div>}
    </div>
  );
}

// ── SKILLS PAGE — Train your Bloomie ────────────────────────────────────────
// ── CALLS PAGE — Phone transcript viewer ────────────────────────────────────
function CallsPage({c,mob,aFN="Sarah"}){
  const [calls,setCalls]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(null);

  useEffect(()=>{
    withAuth().then(h=>fetch('/api/chat/calls',h)).then(r=>r.json()).then(d=>{setCalls(d.calls||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);

  if(loading) return <div style={{textAlign:"center",padding:40,color:c.so}}>Loading calls...</div>;

  if(calls.length===0) return(
    <div style={{textAlign:"center",padding:60,background:c.cd,borderRadius:16,border:"1px solid "+c.ln}}>
      <div style={{fontSize:40,marginBottom:12}}>📞</div>
      <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:6}}>No calls yet</div>
      <div style={{fontSize:13,color:c.so,maxWidth:400,margin:"0 auto",lineHeight:1.6}}>When clients call or leave voicemails on your BLOOM number, {aFN} will read the transcript, extract action items, and get to work. Call transcripts and {aFN}'s actions will appear here.</div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {calls.map(call=>{
        const isExpanded=expanded===call.id;
        const mins=call.duration?Math.round(call.duration/60):null;
        const date=call.created_at?new Date(call.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
        const statusColor=call.status==='processed'?c.gr:call.status==='received'?'#F59E0B':'#EF4444';
        return(
          <div key={call.id} style={{background:c.cd,borderRadius:14,border:"1px solid "+c.ln,overflow:"hidden"}}>
            <div onClick={()=>setExpanded(isExpanded?null:call.id)} style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}
              onMouseEnter={e=>e.currentTarget.style.background=c.hv||c.sf} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:36,height:36,borderRadius:10,background:call.direction==='inbound'?'rgba(52,168,83,0.1)':'rgba(96,165,250,0.1)',display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                {call.direction==='inbound'?'📲':'📱'}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:600,color:c.tx}}>{call.contact_name||'Unknown Caller'}</span>
                  <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:statusColor+"20",color:statusColor}}>{call.status==='processed'?'PROCESSED':'PENDING'}</span>
                </div>
                <div style={{fontSize:11,color:c.so,marginTop:2}}>
                  {call.contact_phone||''}{call.contact_phone&&' · '}{call.direction||'inbound'}{mins?' · '+mins+' min':''}{date?' · '+date:''}
                </div>
              </div>
              <span style={{fontSize:14,color:c.so,transform:isExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s"}}>▾</span>
            </div>

            {isExpanded&&(
              <div style={{borderTop:"1px solid "+c.ln}}>
                {call.summary&&(
                  <div style={{padding:"12px 18px",background:c.sf}}>
                    <div style={{fontSize:11,fontWeight:700,color:c.so,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Summary</div>
                    <div style={{fontSize:13,color:c.tx,lineHeight:1.5}}>{call.summary}</div>
                  </div>
                )}
                <div style={{padding:"12px 18px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:c.so,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Transcript</div>
                  <div style={{fontSize:13,color:c.tx,lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:200,overflowY:"auto",background:c.sf,padding:12,borderRadius:8}}>{call.transcript||'No transcript available'}</div>
                </div>
                {call.sarah_response&&(
                  <div style={{padding:"12px 18px",borderTop:"1px solid "+c.ln}}>
                    <div style={{fontSize:11,fontWeight:700,color:c.ac,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>🌸 {aFN}'s Actions</div>
                    <div style={{fontSize:13,color:c.tx,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{call.sarah_response}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkillsPage({c,mob,aFN="Sarah"}){
  const [skills,setSkills]=useState([]);
  const [bloomSkills,setBloomSkills]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [editSkill,setEditSkill]=useState(null);
  const [form,setForm]=useState({name:'',trigger:'',instructions:''});
  const [saving,setSaving]=useState(false);

  // Load skills on mount
  useEffect(()=>{
    loadSkills();
  },[]);

  const loadSkills=async()=>{
    setLoading(true);
    try{
      const r=await fetch('/api/skills', await withAuth());
      const d=await r.json();
      setBloomSkills(d.bloomSkills||[]);
      setSkills(d.companySkills||[]);
    }catch(e){
      // Fallback demo data if API not ready
      setBloomSkills([
        {id:'bloom-1',name:'Blog Writing',description:'SEO-optimized blog posts and articles',enabled:true,builtin:true},
        {id:'bloom-2',name:'Email Marketing',description:'Email sequences, subject lines, SMS copy',enabled:true,builtin:true},
        {id:'bloom-3',name:'Social Media',description:'Platform-specific social content',enabled:true,builtin:true},
        {id:'bloom-4',name:'CRM Operations',description:'GoHighLevel contacts, pipeline, workflows',enabled:true,builtin:true},
        {id:'bloom-5',name:'Frontend Design',description:'Professional website and dashboard UI',enabled:true,builtin:true},
        {id:'bloom-6',name:'Document Creation',description:'Professional Word docs, reports, memos',enabled:true,builtin:true},
      ]);
      setSkills([]);
    }
    setLoading(false);
  };

  const toggleBloomSkill=async(id)=>{
    setBloomSkills(prev=>prev.map(s=>s.id===id?{...s,enabled:!s.enabled}:s));
    try{ await fetch(`/api/skills/${id}/toggle`, await withAuth({method:'POST'}); }catch(e){}
  };

  const saveSkill=async()=>{
    if(!form.name.trim()||!form.instructions.trim()) return;
    setSaving(true);
    try{
      const method=editSkill?'PUT':'POST';
      const url=editSkill?`/api/skills/${editSkill.id}`:'/api/skills';
      const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      const d=await r.json();
      if(d.success){
        await loadSkills();
        setShowAdd(false);
        setEditSkill(null);
        setForm({name:'',trigger:'',instructions:''});
      }
    }catch(e){
      // Optimistic local add
      const newSkill={id:'local-'+Date.now(),name:form.name,trigger:form.trigger,instructions:form.instructions,enabled:true};
      setSkills(prev=>[...prev,newSkill]);
      setShowAdd(false);
      setEditSkill(null);
      setForm({name:'',trigger:'',instructions:''});
    }
    setSaving(false);
  };

  const deleteSkill=async(id)=>{
    setSkills(prev=>prev.filter(s=>s.id!==id));
    try{ await fetch(`/api/skills/${id}`, await withAuth({method:'DELETE'}); }catch(e){}
  };

  const startEdit=(skill)=>{
    setEditSkill(skill);
    setForm({name:skill.name,trigger:skill.trigger||'',instructions:skill.instructions||''});
    setShowAdd(true);
  };

  const ac=c.ac||'#F4A261';

  return(
    <div style={{maxWidth:800,margin:'0 auto',padding:mob?16:32}}>
      <h1 style={{fontSize:mob?20:26,fontWeight:700,color:c.tx,marginBottom:4}}>🧠 Skills</h1>
      <p style={{fontSize:13,color:c.so,marginBottom:24}}>Train your Bloomie with expert knowledge and company-specific processes</p>

      {/* ── BLOOM SKILLS (built-in) ──────────────────── */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{fontSize:15}}>🌸</span>
          <h2 style={{fontSize:16,fontWeight:700,color:c.tx,margin:0}}>BLOOM Skills</h2>
          <span style={{fontSize:11,color:c.so,background:c.sf,padding:'2px 8px',borderRadius:10}}>Built-in</span>
        </div>
        <p style={{fontSize:12,color:c.so,marginBottom:12}}>Expert capabilities that come with every Bloomie. Toggle on/off per your needs.</p>
        <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 1fr',gap:10}}>
          {bloomSkills.map(skill=>(
            <div key={skill.id} style={{padding:14,borderRadius:12,border:'1px solid '+c.ln,background:c.cd,display:'flex',alignItems:'center',gap:12,opacity:skill.enabled?1:0.5,transition:'opacity .2s'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{skill.name}</div>
                <div style={{fontSize:11,color:c.so,marginTop:2}}>{skill.description}</div>
              </div>
              <button onClick={()=>toggleBloomSkill(skill.id)} style={{width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',background:skill.enabled?ac:'#555',position:'relative',transition:'background .2s',flexShrink:0}}>
                <div style={{width:18,height:18,borderRadius:9,background:'#fff',position:'absolute',top:3,left:skill.enabled?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── COMPANY SKILLS (custom) ─────────────────── */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:15}}>🏢</span>
            <h2 style={{fontSize:16,fontWeight:700,color:c.tx,margin:0}}>Company Skills</h2>
            <span style={{fontSize:11,color:c.so,background:c.sf,padding:'2px 8px',borderRadius:10}}>Custom</span>
          </div>
          <button onClick={()=>{setShowAdd(true);setEditSkill(null);setForm({name:'',trigger:'',instructions:''});}} style={{padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',background:ac,color:'#fff',fontSize:12,fontWeight:600}}>+ New Skill</button>
        </div>
        <p style={{fontSize:12,color:c.so,marginBottom:12}}>Teach your Bloomie how YOUR company does things. These are your SOPs, brand voice, and custom processes.</p>

        {skills.length===0&&!showAdd&&(
          <div style={{padding:32,borderRadius:12,border:'2px dashed '+c.ln,textAlign:'center'}}>
            
            <div style={{fontSize:14,fontWeight:600,color:c.tx,marginBottom:4}}>No company skills yet</div>
            <div style={{fontSize:12,color:c.so,marginBottom:12}}>Train your Bloomie on your company's processes, brand voice, and SOPs</div>
            <button onClick={()=>setShowAdd(true)} style={{padding:'8px 20px',borderRadius:8,border:'none',cursor:'pointer',background:ac,color:'#fff',fontSize:13,fontWeight:600}}>Create Your First Skill</button>
          </div>
        )}

        {skills.map(skill=>(
          <div key={skill.id} style={{padding:14,borderRadius:12,border:'1px solid '+c.ln,background:c.cd,marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:c.tx}}>{skill.name}</div>
                {skill.trigger&&<div style={{fontSize:11,color:c.so,marginTop:2}}>Triggers: {skill.trigger}</div>}
              </div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>startEdit(skill)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid '+c.ln,background:'transparent',cursor:'pointer',fontSize:11,color:c.so}}>Edit</button>
                <button onClick={()=>deleteSkill(skill.id)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid #ef444440',background:'transparent',cursor:'pointer',fontSize:11,color:'#ef4444'}}>Delete</button>
              </div>
            </div>
            {skill.instructions&&(
              <div style={{fontSize:11,color:c.so,marginTop:8,padding:10,borderRadius:8,background:c.sf,whiteSpace:'pre-wrap',maxHeight:100,overflow:'auto'}}>{skill.instructions.slice(0,200)}{skill.instructions.length>200?'...':''}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── ADD/EDIT SKILL MODAL ────────────────────── */}
      {showAdd&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div style={{background:c.cd,borderRadius:16,padding:24,width:'100%',maxWidth:520,maxHeight:'85vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
            <h3 style={{fontSize:18,fontWeight:700,color:c.tx,marginBottom:4}}>{editSkill?'Edit Skill':'Create Company Skill'}</h3>
            <p style={{fontSize:12,color:c.so,marginBottom:20}}>Teach your Bloomie a new process or standard</p>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:c.tx,marginBottom:4,display:'block'}}>Skill Name</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g., New Lead Intake Process" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:c.tx,marginBottom:4,display:'block'}}>When to use this skill</label>
              <input value={form.trigger} onChange={e=>setForm(f=>({...f,trigger:e.target.value}))} placeholder="e.g., new lead, intake form, onboarding" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
              <div style={{fontSize:11,color:c.so,marginTop:4}}>Keywords that tell {aFN} when to apply this skill</div>
            </div>

            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:600,color:c.tx,marginBottom:4,display:'block'}}>Instructions</label>
              <textarea value={form.instructions} onChange={e=>setForm(f=>({...f,instructions:e.target.value}))} placeholder={"Describe exactly how you want this done. For example:\n\n1. When a new lead fills out the intake form...\n2. Create a contact in BLOOM CRM with tags 'new-intake'\n3. Add them to the Welcome workflow\n4. Send the intake confirmation email\n5. Create a note with the form submission details\n6. Notify the team in the #new-leads channel"} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:13,outline:'none',minHeight:180,resize:'vertical',fontFamily:'inherit',boxSizing:'border-box',lineHeight:1.5}}/>
              <div style={{fontSize:11,color:c.so,marginTop:4}}>Be specific — the more detail you give, the better {aFN} performs this task</div>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowAdd(false);setEditSkill(null);}} style={{padding:'10px 20px',borderRadius:8,border:'1px solid '+c.ln,background:'transparent',cursor:'pointer',fontSize:13,color:c.so}}>Cancel</button>
              <button onClick={saveSkill} disabled={saving||!form.name.trim()||!form.instructions.trim()} style={{padding:'10px 24px',borderRadius:8,border:'none',cursor:'pointer',background:(!form.name.trim()||!form.instructions.trim())?'#555':ac,color:'#fff',fontSize:13,fontWeight:600,opacity:saving?.7:1}}>{saving?'Saving...':editSkill?'Save Changes':'Create Skill'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TIPS ────────────────────────────────────── */}
      <div style={{padding:16,borderRadius:12,background:c.sf,border:'1px solid '+c.ln}}>
        <div style={{fontSize:13,fontWeight:600,color:c.tx,marginBottom:8}}>💡 Skill Ideas</div>
        <div style={{fontSize:12,color:c.so,lineHeight:1.6}}>
          <div style={{marginBottom:4}}>• <strong>Brand Voice</strong> — "Always use a warm, professional tone. Never use exclamation marks. Sign off with 'In service, Bishop Flowers'"</div>
          <div style={{marginBottom:4}}>• <strong>New Lead Process</strong> — "When a new lead comes in: tag them, add to welcome sequence, create a deal in the pipeline"</div>
          <div style={{marginBottom:4}}>• <strong>Blog Standards</strong> — "Always mention our three pillars: Faith, Education, Community. Include a call to action for the summer program"</div>
          <div>• <strong>Email Signature</strong> — "All emails should include the YES logo, phone number, and website link in the footer"</div>
        </div>
      </div>
    </div>
  );
}

// ── BUSINESS PROFILE PAGE — Synced from BLOOM CRM ─────────────────────────────────
function BusinessProfilePage({c,mob,userImg,setUserImg,meInitial="U",aFN="Your Bloomie",chatLightbox=null,setChatLightbox=null}){
  const [biz,setBiz]=useState(null);
  const [loading,setLoading]=useState(true);
  const emptyKit={kitName:'',logo:null,colors:['#F4A261','#E76F8B','#2D3436','#FFFFFF','#F5F5F5'],fonts:{heading:'',body:''},tagline:'',brandVoice:'',active:false};
  const [kits,setKits]=useState([{...emptyKit,kitName:'Primary Brand',active:true}]);
  const [activeIdx,setActiveIdx]=useState(0);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  const brand=kits[activeIdx]||kits[0]||emptyKit;
  const setBrand=(fn)=>setKits(prev=>{const next=[...prev];next[activeIdx]=typeof fn==='function'?fn(next[activeIdx]):{...next[activeIdx],...fn};return next;});

  useEffect(()=>{
    Promise.all([
      withAuth().then(h=>fetch('/api/dashboard/business-profile',h)).then(r=>r.json()),
      withAuth().then(h=>fetch('/api/dashboard/brand-kit',h)).then(r=>r.json()).catch(()=>({kits:[],brand:null}))
    ]).then(([bizD,brandD])=>{
      setBiz(bizD.profile);
      if(brandD.kits?.length>0){
        setKits(brandD.kits);
        const ai=brandD.kits.findIndex(k=>k.active);
        if(ai>=0)setActiveIdx(ai);
      } else if(brandD.brand){
        setKits([{...emptyKit,...brandD.brand,kitName:brandD.brand.kitName||'Primary Brand',active:true}]);
      }
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  const saveBrand=async()=>{
    setSaving(true);setSaved(false);
    // Mark active
    const toSave=kits.map((k,i)=>({...k,active:i===activeIdx}));
    try{
      await fetch('/api/dashboard/brand-kit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kits:toSave})});
      setKits(toSave);
      setSaved(true);setTimeout(()=>setSaved(false),2000);
    }catch{}
    setSaving(false);
  };

  const addKit=()=>{
    if(kits.length>=3)return;
    const names=['Primary Brand','Secondary Brand','Sub-Brand'];
    const name=names[kits.length]||`Brand Kit ${kits.length+1}`;
    setKits(p=>[...p,{...emptyKit,kitName:name}]);
    setActiveIdx(kits.length);
  };
  const removeKit=(i)=>{
    if(kits.length<=1)return;
    setKits(p=>p.filter((_,j)=>j!==i));
    setActiveIdx(prev=>prev>=i?Math.max(0,prev-1):prev);
  };

  const handleLogoUpload=(e)=>{
    const f=e.target.files[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=async(ev)=>{
      try{
        const img=new Image();
        await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=ev.target.result;});
        const max=400,scale=Math.min(max/img.width,max/img.height,1);
        const cv=document.createElement('canvas');cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);
        cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
        const d=cv.toDataURL('image/png',0.9);
        setBrand(p=>({...p,logo:d}));
      }catch{setBrand(p=>({...p,logo:ev.target.result}));}
    };reader.readAsDataURL(f);
  };

  const updateColor=(i,val)=>{
    setBrand(p=>{const cols=[...p.colors];cols[i]=val;return{...p,colors:cols};});
  };
  const addColor=()=>setBrand(p=>({...p,colors:[...p.colors,'#CCCCCC']}));
  const removeColor=(i)=>setBrand(p=>({...p,colors:p.colors.filter((_,j)=>j!==i)}));

  if(loading) return <div style={{textAlign:"center",padding:60,color:c.so}}>Loading business profile...</div>;

  return(
    <div style={{padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:700,margin:"0 auto"}}>
      <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>🏢 Business Profile</h1>
      <p style={{fontSize:13,color:c.so,marginBottom:24}}>Synced from GoHighLevel + your brand settings</p>

      {/* Owner Photo */}
      <div style={{background:c.cd,borderRadius:16,border:"1px solid "+c.ln,padding:24,marginBottom:16,display:"flex",alignItems:"center",gap:20}}>
        <label style={{width:80,height:80,borderRadius:16,background:userImg?"transparent":"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:700,color:"#fff",cursor:"pointer",overflow:"hidden",flexShrink:0,border:"3px solid "+c.ln}}>
          {userImg?<img src={userImg} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:meInitial}
          <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
            const f=e.target.files[0];if(!f)return;
            const reader=new FileReader();
            reader.onload=async(ev)=>{
              try{
                const img=new Image();
                await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=ev.target.result;});
                const max=200,scale=Math.min(max/img.width,max/img.height,1);
                const cv=document.createElement('canvas');cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);
                cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
                const d=cv.toDataURL('image/jpeg',0.8);
                setUserImg(d);
                getAuthHeaders().then(h=>fetch('/api/agent/me/avatar',{method:'POST',headers:h,body:JSON.stringify({avatar:d})})).catch(()=>{});
              }catch{
                setUserImg(ev.target.result);
                getAuthHeaders().then(h=>fetch('/api/agent/me/avatar',{method:'POST',headers:h,body:JSON.stringify({avatar:ev.target.result})})).catch(()=>{});
              }
            };reader.readAsDataURL(f);
          }}/>
        </label>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:c.tx}}>Your Photo</div>
          <div style={{fontSize:12,color:c.so,marginTop:2}}>Visible across all your Bloomie dashboards</div>
          {userImg&&<button onClick={()=>{setUserImg(null);getAuthHeaders().then(h=>fetch('/api/agent/me/avatar',{method:'POST',headers:h,body:JSON.stringify({avatar:null})})).catch(()=>{});}} style={{marginTop:8,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(234,67,53,0.3)",background:"transparent",cursor:"pointer",fontSize:11,color:"#ea4335",fontFamily:"inherit"}}>Remove photo</button>}
        </div>
      </div>

      {/* ═══ BRAND KITS ═══ */}
      <div style={{background:c.cd,borderRadius:16,border:"1px solid "+c.ln,overflow:"hidden",marginBottom:16}}>
        <div style={{padding:"18px 24px",borderBottom:"1px solid "+c.ln,background:"linear-gradient(135deg, rgba(244,162,97,0.06), rgba(231,111,139,0.06))"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:c.tx}}>🎨 Brand Kits</div>
              <div style={{fontSize:12,color:c.so,marginTop:2}}>Up to 3 kits for different brands or projects. Active kit is used in all designs.</div>
            </div>
            {kits.length<3&&<button onClick={addKit} style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:600,color:c.tx,fontFamily:"inherit"}}>+ Add Kit</button>}
          </div>
          {/* Kit tabs */}
          {kits.length>1&&(
            <div style={{display:"flex",gap:4,marginTop:12}}>
              {kits.map((k,i)=>(
                <button key={i} onClick={()=>setActiveIdx(i)} style={{padding:"7px 14px",borderRadius:8,border:i===activeIdx?"2px solid "+c.ac:"1px solid "+c.ln,background:i===activeIdx?c.ac+"12":c.cd,cursor:"pointer",fontSize:12,fontWeight:i===activeIdx?700:500,color:i===activeIdx?c.ac:c.tx,fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                  {k.logo&&<img src={k.logo} style={{width:14,height:14,borderRadius:3,objectFit:"contain"}} alt=""/>}
                  {k.kitName||`Kit ${i+1}`}
                  {k.active&&<span style={{width:6,height:6,borderRadius:"50%",background:c.gr,flexShrink:0}}/>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{padding:24}}>
          {/* Kit Name */}
          <div style={{marginBottom:16,display:"flex",gap:10,alignItems:"center"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Kit Name</div>
              <input value={brand.kitName||''} onChange={e=>setBrand(p=>({...p,kitName:e.target.value}))} placeholder="e.g. My Business, Client Name" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,fontSize:13,fontFamily:"inherit",background:c.inp,color:c.tx,boxSizing:"border-box"}}/>
            </div>
            {kits.length>1&&<button onClick={()=>{if(confirm(`Remove "${brand.kitName||'this kit'}"?`))removeKit(activeIdx);}} style={{marginTop:20,padding:"6px 10px",borderRadius:6,border:"1px solid rgba(234,67,53,0.3)",background:"transparent",cursor:"pointer",fontSize:11,color:"#ea4335",fontFamily:"inherit"}}>Remove</button>}
          </div>

          {/* Logo */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Logo</div>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <label style={{width:100,height:100,borderRadius:12,border:"2px dashed "+c.ln,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",background:c.sf,flexShrink:0,transition:"border-color .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
                onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>
                {brand.logo?<img src={brand.logo} style={{width:"100%",height:"100%",objectFit:"contain",padding:4}} alt="Logo"/>:
                  <div style={{textAlign:"center",color:c.so}}><div style={{fontSize:24,marginBottom:4}}>+</div><div style={{fontSize:10}}>Upload</div></div>
                }
                <input type="file" accept="image/*" style={{display:"none"}} onChange={handleLogoUpload}/>
              </label>
              <div style={{fontSize:12,color:c.so,lineHeight:1.6}}>
                {brand.logo?"Click to replace":"Upload your logo (PNG, SVG, or JPG)"}
                <br/>Used in websites, emails, social posts, and documents
                {brand.logo&&<><br/><button onClick={()=>setBrand(p=>({...p,logo:null}))} style={{marginTop:4,padding:"2px 8px",borderRadius:4,border:"1px solid rgba(234,67,53,0.3)",background:"transparent",cursor:"pointer",fontSize:10,color:"#ea4335",fontFamily:"inherit"}}>Remove</button></>}
              </div>
            </div>
          </div>

          {/* Brand Colors */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Brand Colors</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
              {brand.colors.map((col,i)=>(
                <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <label style={{width:48,height:48,borderRadius:10,background:col,border:"2px solid "+c.ln,cursor:"pointer",position:"relative",boxShadow:"0 2px 8px rgba(0,0,0,.1)"}}>
                    <input type="color" value={col} onChange={e=>updateColor(i,e.target.value)} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}/>
                  </label>
                  <div style={{fontSize:9,fontFamily:"monospace",color:c.so}}>{col}</div>
                  {brand.colors.length>2&&<button onClick={()=>removeColor(i)} style={{fontSize:9,color:"#ea4335",background:"transparent",border:"none",cursor:"pointer",padding:0}}>×</button>}
                </div>
              ))}
              {brand.colors.length<8&&(
                <button onClick={addColor} style={{width:48,height:48,borderRadius:10,border:"2px dashed "+c.ln,background:"transparent",cursor:"pointer",fontSize:20,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>+</button>
              )}
            </div>
            <div style={{fontSize:11,color:c.so,marginTop:8}}>Click a swatch to change, + to add. First color = primary, second = accent.</div>
          </div>

          {/* Fonts */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Fonts</div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:mob?"100%":200}}>
                <div style={{fontSize:11,color:c.so,marginBottom:4}}>Heading font</div>
                <input value={brand.fonts.heading} onChange={e=>setBrand(p=>({...p,fonts:{...p.fonts,heading:e.target.value}}))} placeholder="e.g. Playfair Display, Montserrat" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,fontSize:13,fontFamily:"inherit",background:c.inp,color:c.tx,boxSizing:"border-box"}}/>
              </div>
              <div style={{flex:1,minWidth:mob?"100%":200}}>
                <div style={{fontSize:11,color:c.so,marginBottom:4}}>Body font</div>
                <input value={brand.fonts.body} onChange={e=>setBrand(p=>({...p,fonts:{...p.fonts,body:e.target.value}}))} placeholder="e.g. Inter, Open Sans, Lora" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,fontSize:13,fontFamily:"inherit",background:c.inp,color:c.tx,boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>

          {/* Tagline */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Tagline / Slogan</div>
            <input value={brand.tagline} onChange={e=>setBrand(p=>({...p,tagline:e.target.value}))} placeholder="e.g. Empowering the next generation through classical education" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,fontSize:13,fontFamily:"inherit",background:c.inp,color:c.tx,boxSizing:"border-box"}}/>
          </div>

          {/* Brand Voice */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Brand Voice</div>
            <textarea value={brand.brandVoice} onChange={e=>setBrand(p=>({...p,brandVoice:e.target.value}))} placeholder="Describe how your brand speaks — warm and nurturing? Bold and direct? Professional but approachable? Your Bloomie will match this tone in everything it creates." rows={3} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,fontSize:13,fontFamily:"inherit",background:c.inp,color:c.tx,resize:"vertical",boxSizing:"border-box"}}/>
          </div>

          {/* Save */}
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={saveBrand} disabled={saving} style={{padding:"10px 24px",borderRadius:10,border:"none",background:saved?"#34a853":c.gradient,cursor:saving?"not-allowed":"pointer",fontSize:13,fontWeight:700,color:"#fff",transition:"background .2s"}}>
              {saving?"Saving all kits...":saved?"✓ Saved!":"Save All Kits"}
            </button>
            {kits.length>1&&!brand.active&&(
              <button onClick={()=>{setKits(p=>p.map((k,i)=>({...k,active:i===activeIdx})));}} style={{padding:"10px 16px",borderRadius:10,border:"1px solid "+c.ac,background:c.ac+"10",cursor:"pointer",fontSize:13,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>
                Set as Active Kit
              </button>
            )}
            {brand.active&&<span style={{fontSize:11,color:c.gr,fontWeight:600}}>✓ Active — {aFN} uses this kit</span>}
          </div>
        </div>
      </div>

      {/* ═══ BLOOM CRM BUSINESS INFO ═══ */}
      {biz?(
        <div style={{background:c.cd,borderRadius:16,border:"1px solid "+c.ln,overflow:"hidden"}}>
          <div style={{padding:24,display:"flex",alignItems:"center",gap:16,borderBottom:"1px solid "+c.ln,background:"linear-gradient(135deg, rgba(244,162,97,0.06), rgba(231,111,139,0.06))"}}>
            {(brand.logo||biz.logoUrl)?(
              <img src={brand.logo||biz.logoUrl} style={{width:64,height:64,borderRadius:12,objectFit:"contain",background:"#fff",border:"1px solid "+c.ln}} alt=""/>
            ):(
              <div style={{width:64,height:64,borderRadius:12,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:700,color:"#fff"}}>{(biz.name||"B")[0]}</div>
            )}
            <div>
              <div style={{fontSize:20,fontWeight:700,color:c.tx}}>{biz.name||"Unnamed Business"}</div>
              <div style={{fontSize:12,color:c.so,marginTop:2}}>Location ID: {biz.locationId}</div>
            </div>
          </div>
          <div style={{padding:"16px 24px"}}>
            {[
              {label:"Phone",value:biz.phone,icon:"📞"},
              {label:"Email",value:biz.email,icon:"✉️"},
              {label:"Website",value:biz.website,icon:"🌐"},
              {label:"Address",value:[biz.address,biz.city,biz.state,biz.postalCode].filter(Boolean).join(", "),icon:"📍"},
              {label:"Timezone",value:biz.timezone,icon:"🕐"},
            ].filter(r=>r.value).map((r,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<4?"1px solid "+c.ln:"none"}}>
                <span style={{fontSize:16,width:24,textAlign:"center"}}>{r.icon}</span>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px"}}>{r.label}</div>
                  <div style={{fontSize:14,color:c.tx,marginTop:1}}>{r.value}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:"12px 24px",borderTop:"1px solid "+c.ln,background:c.sf}}>
            <div style={{fontSize:11,color:c.so}}>Business info synced from GoHighLevel. Edit in GHL Settings → Business Profile.</div>
          </div>
        </div>
      ):(
        <div style={{background:c.cd,borderRadius:16,border:"1px solid "+c.ln,padding:40,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:12}}>🔗</div>
          <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:6}}>Connect GoHighLevel</div>
          <div style={{fontSize:13,color:c.so}}>Set GHL_API_KEY and GHL_LOCATION_ID to sync your business profile.</div>
        </div>
      )}



          {chatLightbox&&<ImageLightbox src={chatLightbox.src} alt={chatLightbox.alt} onClose={()=>setChatLightbox(null)}/>}
    </div>
  );
}

function SiteLoginsManager({c,mob,aFN="Sarah"}){
  const [sites,setSites]=useState({configured:[],available:[]});
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [addForm,setAddForm]=useState({siteKey:'',username:'',password:'',notes:''});
  const [saving,setSaving]=useState(false);
  const [showPw,setShowPw]=useState(false);

  const loadSites=async()=>{
    try{
      const r=await fetch("/api/dashboard/credential-registry", await withAuth());
      if(r.ok){const d=await r.json();setSites(d);}
    }catch{}
    setLoading(false);
  };

  useEffect(()=>{loadSites();},[]);

  const saveSite=async()=>{
    if(!addForm.siteKey||!addForm.username||!addForm.password)return;
    setSaving(true);
    try{
      const r=await fetch("/api/dashboard/credential-registry", await withAuth({
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(addForm)
      });
      if(r.ok){setShowAdd(false);setAddForm({siteKey:'',username:'',password:'',notes:''});await loadSites();}
    }catch{}
    setSaving(false);
  };

  const removeSite=async(siteKey)=>{
    try{
      const r=await fetch(`/api/dashboard/credential-registry/${siteKey}`, await withAuth({method:"DELETE"}));
      if(r.ok)await loadSites();
    }catch{}
  };

  const siteIcons={quora:"Q",reddit:"R",facebook:"f",linkedin:"in",twitter:"X",instagram:"IG",canva:"C",wordpress:"W",pinterest:"P",tiktok:"T",youtube:"YT",medium:"M"};

  return(
    <div style={{marginBottom:28}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:c.tx}}>Site Logins</div>
          <div style={{fontSize:11,color:c.so}}>Credentials {aFN} uses to log into sites via browser automation</div>
        </div>
        <button onClick={()=>setShowAdd(!showAdd)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+c.ac,background:"transparent",color:c.ac,fontSize:12,fontWeight:600,cursor:"pointer"}}>
          {showAdd?"Cancel":"+ Add Site"}
        </button>
      </div>

      {showAdd&&(
        <div style={{padding:16,borderRadius:12,background:c.sf,border:"1px solid "+c.ln,marginBottom:12}}>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4}}>Site</div>
            <select value={addForm.siteKey} onChange={e=>setAddForm({...addForm,siteKey:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:13,color:c.tx}}>
              <option value="">Select a site...</option>
              {sites.available.map(s=>(
                <option key={s.site_key} value={s.site_key}>{s.site_name}</option>
              ))}
              <option value="custom">Other (custom)</option>
            </select>
          </div>
          {addForm.siteKey==="custom"&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4}}>Site Key (lowercase, no spaces)</div>
              <input value={addForm.siteKey==="custom"?"":addForm.siteKey} onChange={e=>setAddForm({...addForm,siteKey:e.target.value.toLowerCase().replace(/[^a-z0-9]/g,'')})} placeholder="e.g. mysite" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:13,color:c.tx}}/>
            </div>
          )}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4}}>Email / Username</div>
            <input value={addForm.username} onChange={e=>setAddForm({...addForm,username:e.target.value})} placeholder="your@email.com" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:13,color:c.tx}}/>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4}}>Password</div>
            <div style={{position:"relative"}}>
              <input type={showPw?"text":"password"} value={addForm.password} onChange={e=>setAddForm({...addForm,password:e.target.value})} placeholder="••••••••" style={{width:"100%",padding:"8px 40px 8px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:13,color:c.tx}}/>
              <button type="button" onClick={()=>setShowPw(!showPw)} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",border:"none",background:"transparent",cursor:"pointer",padding:4,color:c.so,fontSize:16}} title={showPw?"Hide password":"Show password"}>
                {showPw?(
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ):(
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4}}>Notes (optional)</div>
            <input value={addForm.notes} onChange={e=>setAddForm({...addForm,notes:e.target.value})} placeholder="e.g. business account, use for posting only" style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:13,color:c.tx}}/>
          </div>
          <button onClick={saveSite} disabled={saving||!addForm.siteKey||!addForm.username||!addForm.password} style={{padding:"8px 20px",borderRadius:8,border:"none",background:c.ac,color:"#fff",fontSize:13,fontWeight:600,cursor:saving?"wait":"pointer",opacity:(!addForm.siteKey||!addForm.username||!addForm.password)?0.5:1}}>
            {saving?"Saving...":"Save Credentials"}
          </button>
        </div>
      )}

      {loading?(
        <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>Loading...</div>
      ):sites.configured.length===0?(
        <div style={{padding:"16px",borderRadius:10,background:c.sf,border:"1px dashed "+c.ln,textAlign:"center"}}>
          <div style={{fontSize:12,color:c.so}}>No site logins configured yet. Click "+ Add Site" to get started.</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sites.configured.map(site=>(
            <div key={site.site_key} style={{padding:"10px 14px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>
                  {siteIcons[site.site_key]||site.site_key.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{site.site_name}</div>
                  <div style={{fontSize:11,color:c.so}}>{site.username}{site.last_used_at?" · Last used "+new Date(site.last_used_at).toLocaleDateString():""}</div>
                </div>
              </div>
              <button onClick={()=>removeSite(site.site_key)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #ef444450",background:"transparent",color:"#ef4444",fontSize:11,fontWeight:600,cursor:"pointer"}}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocsPage({c,mob,aFN="Sarah",agentId}){
  const [docs,setDocs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selectedDoc,setSelectedDoc]=useState(null);
  const [docContent,setDocContent]=useState(null);
  const [filter,setFilter]=useState("all");

  useEffect(()=>{
    const go=async()=>{
      try{
        const qs = agentId ? `?agentId=${agentId}` : '';
        const r=await fetch(`/api/dashboard/documents${qs}`, await withAuth());
        if(r.ok){const d=await r.json();setDocs(d.documents||[]);}
      }catch{}
      setLoading(false);
    };
    go();
  },[agentId]);

  const openDoc=async(id)=>{
    try{
      const r=await fetch(`/api/dashboard/documents/${id}`, await withAuth());
      if(r.ok){const d=await r.json();setDocContent(d);setSelectedDoc(id);}
    }catch{}
  };

  const updateStatus=async(id,status)=>{
    try{
      const r=await fetch(`/api/dashboard/documents/${id}`, await withAuth({method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
      if(r.ok){
        setDocs(prev=>prev.map(d=>d.id===id?{...d,status,approved_at:status==="approved"?new Date().toISOString():d.approved_at}:d));
        if(docContent&&docContent.id===id)setDocContent({...docContent,status});
      }
    }catch{}
  };

  const filtered=filter==="all"?docs:docs.filter(d=>d.status===filter);
  const counts={all:docs.length,draft:docs.filter(d=>d.status==="draft").length,approved:docs.filter(d=>d.status==="approved").length,rejected:docs.filter(d=>d.status==="rejected").length};
  const needsApproval=docs.filter(d=>d.requires_approval&&d.status==="draft").length;

  const statusColors={draft:"#f59e0b",approved:"#22c55e",rejected:"#ef4444",archived:"#94a3b8"};
  const typeIcons={draft:"📝",report:"📊",research:"🔍",responses:"💬",content:"✍️",plan:"📋",general:"📄"};

  if(selectedDoc&&docContent)return(
    <div style={{padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:900,margin:"0 auto"}}>
      <button onClick={()=>{setSelectedDoc(null);setDocContent(null);}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"1px solid "+c.ln,background:c.sf,cursor:"pointer",fontSize:13,fontWeight:600,color:c.so,marginBottom:16}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Documents
      </button>

      <div style={{background:c.cd,borderRadius:16,border:"1px solid "+c.ln,overflow:"hidden"}}>
        <div style={{padding:"20px 24px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{fontSize:18}}>{typeIcons[docContent.doc_type]||"📄"}</span>
              <h2 style={{fontSize:mob?18:22,fontWeight:700,color:c.tx,margin:0}}>{docContent.title}</h2>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,fontSize:11,color:c.so}}>
              <span style={{padding:"2px 8px",borderRadius:6,background:statusColors[docContent.status]+"20",color:statusColors[docContent.status],fontWeight:600,fontSize:11}}>{docContent.status.toUpperCase()}</span>
              <span>{new Date(docContent.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</span>
              {docContent.requires_approval&&<span style={{color:"#f59e0b",fontWeight:600}}>REQUIRES APPROVAL</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {docContent.status==="draft"&&(
              <>
                <button onClick={()=>updateStatus(docContent.id,"approved")} style={{padding:"8px 16px",borderRadius:10,border:"none",background:"#22c55e",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>Approve</button>
                <button onClick={()=>updateStatus(docContent.id,"rejected")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid #ef4444",background:"transparent",color:"#ef4444",fontSize:13,fontWeight:600,cursor:"pointer"}}>Reject</button>
              </>
            )}
            {docContent.status!=="draft"&&(
              <button onClick={()=>updateStatus(docContent.id,"draft")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid "+c.ln,background:c.sf,color:c.so,fontSize:13,fontWeight:600,cursor:"pointer"}}>Reset to Draft</button>
            )}
          </div>
        </div>

        <div style={{padding:"24px",fontSize:14,lineHeight:1.7,color:c.tx,whiteSpace:"pre-wrap",fontFamily:"'Inter',system-ui,sans-serif"}}>
          {docContent.content}
        </div>

        {docContent.tags&&docContent.tags.length>0&&(
          <div style={{padding:"12px 24px 20px",borderTop:"1px solid "+c.ln,display:"flex",gap:6,flexWrap:"wrap"}}>
            {docContent.tags.map((tag,i)=>(
              <span key={i} style={{padding:"3px 10px",borderRadius:20,background:c.ac+"12",color:c.ac,fontSize:11,fontWeight:600}}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return(
    <div style={{padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:900,margin:"0 auto"}}>
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
          <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx}}>Documents</h1>
          {needsApproval>0&&(
            <div style={{padding:"6px 14px",borderRadius:20,background:"#f59e0b20",color:"#f59e0b",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:"#f59e0b",animation:"pulse 1.5s ease infinite"}}/>
              {needsApproval} awaiting approval
            </div>
          )}
        </div>
        <p style={{fontSize:13,color:c.so}}>{aFN}'s saved documents, drafts, and artifacts for your review</p>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:16,background:c.sf,padding:3,borderRadius:10,flexWrap:"wrap"}}>
        {[{k:"all",l:"All"},{k:"draft",l:"Drafts"},{k:"approved",l:"Approved"},{k:"rejected",l:"Rejected"}].map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filter===f.k?c.cd:"transparent",color:filter===f.k?c.tx:c.so,boxShadow:filter===f.k?"0 1px 4px rgba(0,0,0,.06)":"none"}}>
            {f.l} ({counts[f.k]||0})
          </button>
        ))}
      </div>

      {loading?(
        <div style={{textAlign:"center",padding:40,color:c.so,fontSize:13}}>Loading documents...</div>
      ):filtered.length===0?(
        <div style={{textAlign:"center",padding:60,color:c.so}}>
          <div style={{fontSize:40,marginBottom:12}}>📄</div>
          <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>No documents yet</div>
          <div style={{fontSize:12}}>When {aFN} creates documents or drafts, they'll appear here for your review.</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(doc=>(
            <div key={doc.id} onClick={()=>openDoc(doc.id)} style={{padding:"14px 18px",borderRadius:12,background:c.cd,border:"1px solid "+(doc.requires_approval&&doc.status==="draft"?("#f59e0b"+"50"):c.ln),cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background=c.cd}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>{typeIcons[doc.doc_type]||"📄"}</span>
                  <span style={{fontSize:14,fontWeight:600,color:c.tx}}>{doc.title}</span>
                </div>
                <span style={{padding:"2px 8px",borderRadius:6,background:statusColors[doc.status]+"20",color:statusColors[doc.status],fontWeight:600,fontSize:11}}>{doc.status.toUpperCase()}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,fontSize:11,color:c.so}}>
                <span>{new Date(doc.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
                <span>{doc.doc_type}</span>
                {doc.requires_approval&&doc.status==="draft"&&<span style={{color:"#f59e0b",fontWeight:600}}>NEEDS APPROVAL</span>}
                {doc.tags&&doc.tags.length>0&&<span>{doc.tags.join(", ")}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BillingPage({c,mob,aFN="Sarah"}){
  const [showEstimate,setShowEstimate]=useState(false);
  const currentPlan="enterprise";
  const plan=PLANS_DATA[currentPlan];

  // Simulated usage — will come from API
  const usage={emails:7340,sms:680,mms:120,phone:145,images:52,videos:18,chatMessages:4820,blogPosts:28,emailDrafts:44,codePages:8,research:16};
  const daysInPeriod=31,daysPassed=19,daysLeft=daysInPeriod-daysPassed;

  const overageItems=[
    {key:"email",label:"Email sends",icon:"✉️",used:usage.emails,limit:plan.emails,rate:OVERAGE_RATES.email,unit:"email"},
    {key:"sms",label:"SMS messages",icon:"💬",used:usage.sms,limit:plan.sms,rate:OVERAGE_RATES.sms,unit:"text"},
    {key:"mms",label:"MMS messages",icon:"📸",used:usage.mms,limit:plan.mms,rate:OVERAGE_RATES.mms,unit:"msg"},
    {key:"phone",label:"Phone minutes",icon:"📞",used:usage.phone,limit:plan.phone,rate:OVERAGE_RATES.phone,unit:"min"},
    {key:"image",label:"Images",icon:"🎨",used:usage.images,limit:plan.images,rate:OVERAGE_RATES.image,unit:"image"},
    {key:"video",label:"Videos (8s)",icon:"🎬",used:usage.videos,limit:plan.videos,rate:OVERAGE_RATES.video,unit:"video"},
  ].filter(i=>i.limit>0);

  const currentOverage=overageItems.reduce((s,i)=>s+Math.max(0,i.used-i.limit)*i.rate,0);
  const projMult=daysPassed>0?daysInPeriod/daysPassed:1;
  const projItems=overageItems.map(i=>({...i,projected:Math.round(i.used*projMult),projOver:Math.max(0,Math.round(i.used*projMult)-i.limit),projCost:Math.max(0,Math.round(i.used*projMult)-i.limit)*i.rate}));
  const projTotalOver=projItems.reduce((s,i)=>s+i.projCost,0);

  return(
    <div style={{padding:mob?"16px 12px 40px":"24px 28px 60px",maxWidth:860,margin:"0 auto"}}>
      <style>{`@keyframes bFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:mob?18:20,fontWeight:700}}>💳 Billing</h1>
          <p style={{fontSize:13,color:c.so,marginTop:3}}>Manage your plan, usage, and payment</p>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:c.so}}>Billing period</div>
          <div style={{fontSize:13,fontWeight:600}}>Mar 1 — Mar 31, 2026</div>
          <div style={{fontSize:11,color:c.ac2||c.ac||"#F4A261",marginTop:2}}>{daysLeft} days remaining</div>
        </div>
      </div>

      {/* Plan + Amount */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:14,marginBottom:18}}>
        <div style={{background:c.cd,borderRadius:12,border:"1px solid "+c.ln,padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px"}}>Current Plan</div>
              <div style={{fontSize:22,fontWeight:700,marginTop:2,background:"linear-gradient(135deg,#F4A261,#E76F8B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Enterprise</div>
            </div>
            <div style={{fontSize:24,fontWeight:700}}>{$(plan.price)}<span style={{fontSize:13,color:c.so,fontWeight:500}}>/mo</span></div>
          </div>
          <div style={{fontSize:12,color:c.so,lineHeight:1.6}}>Unlimited chat · Unlimited articles & emails · {plan.images} images · {plan.videos} videos · {plan.emails.toLocaleString()} email sends · {plan.sms.toLocaleString()} SMS</div>
          <button style={{marginTop:10,padding:"7px 16px",borderRadius:8,border:"1px solid "+c.ln,background:"none",color:c.ac2||"#F4A261",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Change Plan</button>
        </div>
        <div style={{background:c.cd,borderRadius:12,border:currentOverage>0?"1px solid rgba(234,67,53,0.3)":"1px solid "+c.ln,padding:18}}>
          <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px"}}>Current Total</div>
          <div style={{fontSize:30,fontWeight:700,marginTop:4}}>{$(plan.price+currentOverage)}</div>
          <div style={{display:"flex",gap:16,marginTop:6,fontSize:12}}>
            <div><span style={{color:c.so}}>Base:</span> <span style={{fontWeight:600}}>{$(plan.price)}</span></div>
            {currentOverage>0&&<div><span style={{color:c.so}}>Overages:</span> <span style={{fontWeight:700,color:"#ea4335"}}>{$(currentOverage)}</span></div>}
          </div>
          <div style={{marginTop:12}}>
            <div style={{height:4,borderRadius:2,background:c.ln}}><div style={{height:4,borderRadius:2,background:c.ac2||"#F4A261",width:(daysPassed/daysInPeriod*100)+"%"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:c.so}}><span>Mar 1</span><span>Day {daysPassed}</span><span>Mar 31</span></div>
          </div>
        </div>
      </div>

      {/* CRM Sends */}
      <div style={{background:c.cd,borderRadius:12,border:"1px solid "+c.ln,padding:18,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:15,fontWeight:700}}>CRM Communication Sends</div>
          {currentOverage>0&&<div style={{fontSize:12,fontWeight:700,color:"#ea4335",display:"flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:3,background:"#ea4335",display:"inline-block"}}/>{$(currentOverage)} in overages</div>}
        </div>
        <div style={{fontSize:12,color:c.so,marginBottom:14}}>Included with BLOOM CRM. Overages billed at end of period.</div>

        {overageItems.filter(i=>["email","sms","mms","phone"].includes(i.key)).map(i=><BillingUsageBar key={i.key} {...i} c={c}/>)}

        {/* Estimate toggle */}
        <button onClick={()=>setShowEstimate(!showEstimate)} style={{width:"100%",padding:"9px 14px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:showEstimate?"1px solid rgba(244,162,97,0.3)":"1px solid "+c.ln,background:showEstimate?"rgba(244,162,97,0.06)":c.sf||"#222",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
          <span style={{fontSize:13,fontWeight:600,color:showEstimate?c.ac2||"#F4A261":c.so}}>{showEstimate?"Hide":"View"} End-of-Month Estimate</span>
          <span style={{fontSize:12,color:c.so,transform:showEstimate?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
        </button>

        {showEstimate&&(
          <div style={{marginTop:12,padding:16,borderRadius:10,background:c.sf||"#222",border:"1px solid "+c.ln,animation:"bFadeIn .25s ease"}}>
            <div style={{fontSize:12,fontWeight:700,color:c.ac2||"#F4A261",marginBottom:4}}>Projected End-of-Month Estimate</div>
            <div style={{fontSize:11,color:c.so,marginBottom:12}}>Based on your pace through day {daysPassed}, projected to end of billing period.</div>
            {projItems.filter(i=>["email","sms","mms","phone"].includes(i.key)).map(i=>{
              const isO=i.projOver>0;
              return(
                <div key={i.key} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:6,marginBottom:4,background:isO?"rgba(234,67,53,0.06)":"transparent",border:isO?"1px solid rgba(234,67,53,0.15)":"1px solid transparent"}}>
                  <span style={{fontSize:14,width:22}}>{i.icon}</span>
                  <span style={{flex:1,fontSize:12,fontWeight:600,color:isO?"#ea4335":c.tx}}>{i.label}</span>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,color:isO?"#ea4335":c.so}}>~{i.projected.toLocaleString()} <span style={{color:c.so}}>/ {i.limit.toLocaleString()}</span></div>
                    {isO?<div style={{fontSize:11,fontWeight:700,color:"#ea4335"}}>+{i.projOver.toLocaleString()} over → {$(i.projCost)}</div>:<div style={{fontSize:11,color:"#34a853"}}>Within plan</div>}
                  </div>
                </div>
              );
            })}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid "+c.ln,marginTop:10,paddingTop:10}}>
              <span style={{fontSize:13,fontWeight:700}}>Estimated Total Bill</span>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:20,fontWeight:700,color:projTotalOver>0?"#ea4335":"#34a853"}}>{$(plan.price+projTotalOver)}</div>
                {projTotalOver>0&&<div style={{fontSize:11,color:"#ea4335"}}>{$(plan.price)} base + {$(projTotalOver)} overages</div>}
              </div>
            </div>
            {projTotalOver>10&&<div style={{marginTop:10,padding:"9px 14px",borderRadius:8,fontSize:12,lineHeight:1.5,background:"rgba(244,162,97,0.06)",border:"1px solid rgba(244,162,97,0.2)",color:c.ac2||"#F4A261"}}>💡 <strong>Tip:</strong> You're on pace for {$(projTotalOver)} in overages. Consider adjusting {aFN}'s send frequency or upgrading your plan.</div>}
          </div>
        )}
      </div>

      {/* AI Generation */}
      <div style={{background:c.cd,borderRadius:12,border:"1px solid "+c.ln,padding:18,marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>AI Generation</div>
        <div style={{fontSize:12,color:c.so,marginBottom:14}}>{aFN} picks the best AI model for each job automatically.</div>
        {overageItems.filter(i=>["image","video"].includes(i.key)).map(i=><BillingUsageBar key={i.key} {...i} c={c}/>)}
        <div style={{borderTop:"1px solid "+c.ln,marginTop:6,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:c.so,marginBottom:10}}>Content Created This Period</div>
          <div style={{display:"grid",gridTemplateColumns:mob?"repeat(3,1fr)":"repeat(5,1fr)",gap:8}}>
            {[{l:"Chat Messages",v:usage.chatMessages,i:null},{l:"Articles",v:usage.blogPosts,i:null},{l:"Emails Drafted",v:usage.emailDrafts,i:null},{l:"Pages Built",v:usage.codePages,i:null},{l:"Research",v:usage.research,i:null}].map((s,idx)=>(
              <div key={idx} style={{textAlign:"center",padding:"10px 6px",borderRadius:8,background:c.sf||"#222",border:"1px solid "+c.ln}}>
                <div style={{fontSize:16,marginBottom:4}}>{s.i}</div>
                <div style={{fontSize:18,fontWeight:700,color:c.ac2||"#F4A261"}}>{s.v.toLocaleString()}</div>
                <div style={{fontSize:10,color:c.so,marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plan comparison */}
      <div style={{background:c.cd,borderRadius:12,border:"1px solid "+c.ln,padding:18,marginBottom:14,overflowX:"auto"}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:14}}>Plan Comparison</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:500}}>
          <thead><tr style={{borderBottom:"1px solid "+c.ln}}>
            <th style={{textAlign:"left",padding:"8px 12px",color:c.so,fontWeight:600,fontSize:12}}>Feature</th>
            {Object.entries(PLANS_DATA).map(([k,p])=><th key={k} style={{textAlign:"center",padding:"8px 12px",color:k===currentPlan?c.ac2||"#F4A261":c.tx,fontWeight:700}}>{p.name}<div style={{fontSize:11,fontWeight:500,color:k===currentPlan?c.ac2||"#F4A261":c.so}}>{$(p.price)}/mo</div>{k===currentPlan&&<div style={{fontSize:9,color:"#34a853",marginTop:2}}>CURRENT</div>}</th>)}
          </tr></thead>
          <tbody>
            {[
              {l:"Chat with your Bloomie",v:["Unlimited","Unlimited","Unlimited"]},
              {l:"BLOOM CRM",v:["Included","Included","Included"]},
              {l:"Scheduled Tasks",v:["5","15","Unlimited"]},
              {l:"Emails included",v:["1,000","5,000","10,000"]},
              {l:"SMS included",v:["200","500","1,000"]},
              {l:"Images",v:["—","40/mo","80/mo"]},
              {l:"Videos",v:["—","—","30/mo"]},
              {l:"Phone minutes",v:["—","60 min","200 min"]},
              {l:"Email overage",v:["$0.02","$0.02","$0.02"]},
              {l:"SMS overage",v:["$0.03","$0.03","$0.03"]},
              {l:"Image overage",v:["—","$0.15","$0.15"]},
              {l:"Video overage",v:["—","—","$2.00"]},
            ].map((r,i)=><tr key={i} style={{borderBottom:"1px solid rgba(42,42,42,0.4)"}}><td style={{padding:"8px 12px",color:c.so,fontSize:12}}>{r.l}</td>{r.v.map((v,j)=><td key={j} style={{textAlign:"center",padding:"8px 12px",color:v==="—"?c.so:v==="Unlimited"||v==="Included"?"#34a853":c.tx,fontWeight:v==="Unlimited"||v==="Included"?600:400}}>{v}</td>)}</tr>)}
          </tbody>
        </table>
      </div>

      {/* Video add-on */}
      <div style={{background:"linear-gradient(135deg,rgba(244,162,97,0.06),rgba(231,111,139,0.06))",borderRadius:12,border:"1px solid rgba(244,162,97,0.2)",padding:18,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:c.ac2||"#F4A261"}}>Video Creator Pack</div>
          <div style={{fontSize:12,color:c.so,marginTop:3}}>Need more videos? Add 100 videos/month for $200. Extra clips at $1.50 each.</div>
        </div>
        <button style={{padding:"10px 22px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",background:"linear-gradient(135deg,#F4A261,#E76F8B)",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>Add to Plan</button>
      </div>

      {/* Payment method */}
      <div style={{background:c.cd,borderRadius:12,border:"1px solid "+c.ln,padding:18}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>Payment Method</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:48,height:32,borderRadius:6,background:c.sf||"#222",border:"1px solid "+c.ln,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>💳</div>
          <div><div style={{fontSize:13,fontWeight:600}}>Visa ending in 4242</div><div style={{fontSize:11,color:c.so}}>Expires 08/2027</div></div>
          <button style={{marginLeft:"auto",padding:"6px 14px",borderRadius:6,border:"1px solid "+c.ln,background:"none",color:c.so,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Update</button>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   DISPATCH PAGE — Mobile access to your Bloomie
   ═══════════════════════════════════════════════════════════════ */
function DispatchPage({c, mob, currentAgent, agentImgUrl}) {
  const SARAH_URL = 'https://autonomous-sarah-rodriguez-production.up.railway.app';
  const dispatchUrl = SARAH_URL + '/dispatch';
  const [copied, setCopied] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [desktopAvail, setDesktopAvail] = useState(null);

  // Detect platform — default Mac to ARM64 since most modern Macs are Apple Silicon
  // Chrome on M1/M2/M3 still reports "Intel" in user agent for compatibility
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMac = ua.includes('Macintosh') || ua.includes('Mac OS');
  const isWin = ua.includes('Windows');
  const defaultPlatform = isMac ? 'mac-arm64' : isWin ? 'windows' : null;

  // Check available builds
  useEffect(() => {
    fetch(SARAH_URL + '/api/desktop/downloads')
      .then(r => r.json())
      .then(d => setDesktopAvail(d.platforms))
      .catch(() => setDesktopAvail(null));
  }, []);

  const downloadDesktop = async (platform) => {
    setDownloading(platform);
    try {
      // Get auth token
      const headers = await getAuthHeaders();
      const tokenRes = await fetch(SARAH_URL + '/api/desktop/download-token/' + platform, { method: 'POST', headers });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        alert(err.error || 'Download failed');
        setDownloading(null);
        return;
      }
      const { downloadUrl } = await tokenRes.json();
      const filename = platform.includes('mac') ? 'BLOOM-Desktop.dmg' : 'BLOOM-Desktop.exe';

      // Stream download via fetch (avoids Railway 503 on navigation requests)
      const dlRes = await fetch(SARAH_URL + downloadUrl);
      if (!dlRes.ok) throw new Error('Download failed: ' + dlRes.status);

      // Use StreamSaver-style approach: collect chunks and create blob
      const reader = dlRes.body.getReader();
      const chunks = [];
      let received = 0;
      const total = parseInt(dlRes.headers.get('Content-Length') || '0');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        // Could update progress UI here
      }

      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error('Download error:', e);
      alert('Download failed. Please try again.');
    }
    setDownloading(null);
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(dispatchUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const agentName = currentAgent?.name || 'Sarah Rodriguez';
  const agentFirst = agentName.split(' ')[0];
  const agentImg = agentImgUrl || currentAgent?.avatar_url || null;

  // QR code via Google Charts API (no npm needed)
  const qrSrc = 'https://chart.googleapis.com/chart?cht=qr&chs=240x240&chl=' + encodeURIComponent(dispatchUrl) + '&choe=UTF-8';

  return (
    <div style={{padding: mob ? '20px 16px 60px' : '32px 40px 60px', maxWidth: 680, margin: '0 auto'}}>
      {/* Header */}
      <div style={{marginBottom: 32}}>
        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:8}}>
          <div style={{width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#F4A261,#E76F8B)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='#fff' strokeWidth='2.5' strokeLinecap='round'>
              <path d='M12 2C9.8 2 8 3.8 8 6s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z'/>
              <path d='M12 14c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z'/>
              <path d='M2 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z'/>
              <path d='M14 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z'/>
            </svg>
          </div>
          <div>
            <h1 style={{fontSize: mob ? 22 : 26, fontWeight:700, color:c.tx, margin:0}}>Dispatch</h1>
            <p style={{fontSize:13, color:c.so, margin:0}}>Chat with {agentFirst} from your phone — or share access with your team</p>
          </div>
        </div>
      </div>

      {/* Agent card */}
      <div style={{padding:20, borderRadius:16, background:c.cd, border:'1px solid '+c.ln, marginBottom:20, display:'flex', alignItems:'center', gap:16}}>
        {agentImg
          ? <img src={agentImg} alt={agentName} style={{width:56, height:56, borderRadius:14, objectFit:'cover', border:'2px solid '+c.ln, flexShrink:0}}/>
          : <div style={{width:56, height:56, borderRadius:14, background:'linear-gradient(135deg,#F4A261,#E76F8B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, color:'#fff', flexShrink:0}}>{agentName.charAt(0)}</div>
        }
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:16, fontWeight:700, color:c.tx}}>{agentName}</div>
          <div style={{fontSize:12, color:c.so, marginTop:2}}>{currentAgent?.job_title || currentAgent?.role || 'Your AI Employee'}</div>
          <div style={{display:'flex', alignItems:'center', gap:5, marginTop:4}}>
            <span style={{width:6, height:6, borderRadius:'50%', background:'#34a853', animation:'pulse 1.5s ease infinite'}}/>
            <span style={{fontSize:11, color:'#34a853', fontWeight:600}}>Online via Dispatch</span>
          </div>
        </div>
      </div>

      {/* Desktop App Download */}
      <div style={{padding:24, borderRadius:16, background:c.cd, border:'1px solid '+c.ln, marginBottom:16}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:4}}>
          <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke={c.tx} strokeWidth='2' strokeLinecap='round'>
            <rect x='2' y='3' width='20' height='14' rx='2'/><line x1='8' y1='21' x2='16' y2='21'/><line x1='12' y1='17' x2='12' y2='21'/>
          </svg>
          <span style={{fontSize:14, fontWeight:700, color:c.tx}}>BLOOM Desktop</span>
        </div>
        <div style={{fontSize:12, color:c.so, marginBottom:20, lineHeight:1.6}}>
          Let {agentFirst} work directly on your computer — screen control, browser automation, and file access. Download and sign in with your BLOOM account.
        </div>

        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:16}}>
          {/* macOS Button */}
          <button
            onClick={() => downloadDesktop(isMac ? 'mac-arm64' : 'windows')}
            disabled={downloading !== null}
            style={{flex:1, minWidth:140, padding:'14px 20px', borderRadius:12, border:'none', background: isMac ? 'linear-gradient(135deg,#F4A261,#E76F8B)' : c.sf, color: isMac ? '#fff' : c.tx, cursor: downloading ? 'wait' : 'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'transform .1s', opacity: downloading === 'mac-arm64' || downloading === 'mac-intel' ? 0.6 : 1}}>
            <svg width='18' height='18' viewBox='0 0 24 24' fill={isMac ? '#fff' : c.so}>
              <path d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z'/>
            </svg>
            {downloading === 'mac-arm64' || downloading === 'mac-intel' ? 'Downloading...' : 'Download for macOS'}
          </button>

          {/* Windows Button */}
          <button
            onClick={() => downloadDesktop('windows')}
            disabled={downloading !== null}
            style={{flex:1, minWidth:140, padding:'14px 20px', borderRadius:12, border:'none', background: isWin ? 'linear-gradient(135deg,#F4A261,#E76F8B)' : c.sf, color: isWin ? '#fff' : c.tx, cursor: downloading ? 'wait' : 'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'transform .1s', opacity: downloading === 'windows' ? 0.6 : 1}}>
            <svg width='16' height='16' viewBox='0 0 24 24' fill={isWin ? '#fff' : c.so}>
              <path d='M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801'/>
            </svg>
            {downloading === 'windows' ? 'Downloading...' : 'Download for Windows'}
          </button>
        </div>

        {/* Mac chip picker (only show on Mac) */}
        {isMac && (
          <div style={{display:'flex', gap:6, marginBottom:12}}>
            <button onClick={() => downloadDesktop('mac-arm64')} disabled={downloading !== null}
              style={{padding:'6px 14px', borderRadius:8, border:'1px solid '+c.ln, background:c.sf, fontSize:11, fontWeight:600, color:c.so, cursor:'pointer', fontFamily:'inherit'}}>
              Apple Silicon (M1/M2/M3)
            </button>
            <button onClick={() => downloadDesktop('mac-intel')} disabled={downloading !== null}
              style={{padding:'6px 14px', borderRadius:8, border:'1px solid '+c.ln, background:c.sf, fontSize:11, fontWeight:600, color:c.so, cursor:'pointer', fontFamily:'inherit'}}>
              Intel Mac
            </button>
          </div>
        )}

        <div style={{fontSize:11, color:c.fa, lineHeight:1.5}}>
          Requires macOS 12+ or Windows 10+. After installing, sign in with your BLOOM email and password.
        </div>
      </div>

      {/* QR + Link section */}
      <div style={{padding:24, borderRadius:16, background:c.cd, border:'1px solid '+c.ln, marginBottom:16}}>
        <div style={{fontSize:14, fontWeight:700, color:c.tx, marginBottom:4}}>Open on your phone</div>
        <div style={{fontSize:12, color:c.so, marginBottom:20}}>Scan the QR code or send the link. Sign in with your BLOOM account to start chatting.</div>

        <div style={{display:'flex', flexDirection: mob ? 'column' : 'row', gap:20, alignItems:'flex-start'}}>
          {/* QR code */}
          <div style={{flexShrink:0, textAlign:'center'}}>
            <div style={{width:180, height:180, borderRadius:14, border:'1px solid '+c.ln, background:'#fff', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', margin: mob ? '0 auto' : 0}}>
              <QRCanvas url={dispatchUrl} size={160}/>
            </div>
            <div style={{fontSize:10, color:c.so, marginTop:6}}>Scan with your phone camera</div>
          </div>

          {/* Right side */}
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:11, fontWeight:700, color:c.so, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8}}>Dispatch Link</div>
            <div style={{display:'flex', gap:6, marginBottom:16}}>
              <div style={{flex:1, padding:'10px 12px', borderRadius:8, border:'1px solid '+c.ln, background:c.sf, fontSize:12, fontFamily:'monospace', color:c.ac, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                {dispatchUrl}
              </div>
              <button onClick={copyLink} style={{padding:'10px 16px', borderRadius:8, border:'none', background: copied ? '#34a853' : 'linear-gradient(135deg,#F4A261,#E76F8B)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff', fontFamily:'inherit', flexShrink:0, transition:'background .2s'}}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <div style={{fontSize:11, fontWeight:700, color:c.so, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8}}>Share via</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {[
                {label:'Text / iMessage', href:'sms:?body=Chat+with+' + encodeURIComponent(agentFirst) + '+from+anywhere:+' + encodeURIComponent(dispatchUrl)},
                {label:'Email', href:'mailto:?subject=' + encodeURIComponent('Chat with ' + agentFirst + ' on Dispatch') + '&body=' + encodeURIComponent('Use this link to chat with ' + agentFirst + ' from your phone: ' + dispatchUrl)},
                {label:'WhatsApp', href:'https://wa.me/?text=' + encodeURIComponent('Chat with ' + agentFirst + ' from your phone: ' + dispatchUrl)},
              ].map((s, i) => (
                <a key={i} href={s.href} target='_blank' rel='noopener noreferrer' style={{padding:'7px 14px', borderRadius:8, border:'1px solid '+c.ln, background:c.cd, fontSize:12, fontWeight:600, color:c.tx, textDecoration:'none', transition:'border-color .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{padding:20, borderRadius:16, background:c.cd, border:'1px solid '+c.ln, marginBottom:16}}>
        <div style={{fontSize:14, fontWeight:700, color:c.tx, marginBottom:14}}>How it works</div>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {[
            {n:'1', title:'Open the link on any device', desc:'Works on iPhone, Android, or any browser — no app install needed'},
            {n:'2', title:'Sign in with your BLOOM account', desc:'Uses your existing username and password — secure, per-user access'},
            {n:'3', title:'Chat with ' + agentFirst + ' from anywhere', desc:'Give tasks, check status, get updates — your Bloomie is always on via Railway'},
          ].map((step, i) => (
            <div key={i} style={{display:'flex', alignItems:'flex-start', gap:12}}>
              <div style={{width:26, height:26, borderRadius:8, background:'linear-gradient(135deg,#F4A261,#E76F8B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0, marginTop:1}}>{step.n}</div>
              <div>
                <div style={{fontSize:13, fontWeight:600, color:c.tx}}>{step.title}</div>
                <div style={{fontSize:12, color:c.so, marginTop:2, lineHeight:1.5}}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SMS Dispatch coming soon */}
      <div style={{padding:16, borderRadius:12, background:'linear-gradient(135deg, rgba(244,162,97,0.06), rgba(231,111,139,0.06))', border:'1px solid rgba(244,162,97,0.2)'}}>
        <div style={{fontSize:13, fontWeight:700, color:c.ac, marginBottom:4}}>SMS Dispatch — coming soon</div>
        <div style={{fontSize:12, color:c.so, lineHeight:1.6}}>Text {agentFirst} directly from your phone number — no login, no app. Your Bloomie will reply as if you messaged a real person. Powered by Twilio.</div>
      </div>
    </div>
  );
}


/* ── QR CODE — generated in-browser, no external API ── */
function QRCanvas({url, size=160}) {
  const canvasRef = useRef(null);
  useEffect(()=>{
    if(!canvasRef.current||!url) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    }, (err)=>{ if(err) console.error('QR error:', err); });
  },[url,size]);
  return <canvas ref={canvasRef} style={{borderRadius:8,display:'block'}}/>;
}

export default function AppWithErrorBoundary({ user: authUser }) {
  return <ErrorBoundary><App authUser={authUser} /></ErrorBoundary>;
}

// ── Password Change Panel — used in Settings > General > Security ──────────
function PwChangePanel({c}) {
  const [nw, setNw] = useState('');
  const [conf, setConf] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const handle = async () => {
    if (!nw.trim() || !conf.trim()) { setErr('Enter a new password'); return; }
    if (nw !== conf) { setErr('Passwords do not match'); return; }
    if (nw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setSaving(true); setErr(''); setOk('');
    const { error } = await supabase.auth.updateUser({ password: nw });
    setSaving(false);
    if (error) { setErr(error.message); }
    else { setOk('Password updated successfully.'); setNw(''); setConf(''); }
  };

  return (
    <div style={{padding:'14px 16px',borderRadius:10,background:c.sf,border:'1px solid '+c.ln,display:'flex',flexDirection:'column',gap:10}}>
      <input
        type="password" placeholder="New password" value={nw} onChange={e=>setNw(e.target.value)}
        style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid '+c.ln,background:c.cd,fontSize:13,color:c.tx,outline:'none'}}
        onFocus={e=>e.target.style.borderColor='#7c5cbf'} onBlur={e=>e.target.style.borderColor=c.ln}
      />
      <input
        type="password" placeholder="Confirm new password" value={conf} onChange={e=>setConf(e.target.value)}
        style={{padding:'9px 12px',borderRadius:8,border:'1.5px solid '+c.ln,background:c.cd,fontSize:13,color:c.tx,outline:'none'}}
        onFocus={e=>e.target.style.borderColor='#7c5cbf'} onBlur={e=>e.target.style.borderColor=c.ln}
      />
      {err && <div style={{fontSize:12,color:'#ef4444',padding:'6px 10px',background:'#fef2f2',borderRadius:6}}>{err}</div>}
      {ok  && <div style={{fontSize:12,color:'#059669',padding:'6px 10px',background:'#f0fdf4',borderRadius:6}}>{ok}</div>}
      <button
        onClick={handle} disabled={saving || !nw || !conf}
        style={{padding:'9px',borderRadius:8,border:'none',background:saving||!nw||!conf?'#d1d5db':'linear-gradient(135deg,#7c5cbf,#a78bdb)',color:'#fff',fontSize:13,fontWeight:700,cursor:saving||!nw||!conf?'not-allowed':'pointer'}}
      >
        {saving ? 'Updating...' : 'Update Password'}
      </button>
    </div>
  );
}

function App({ authUser }) {
  const W=useW();
  const mob=W<768;
  const [dark,setDark]=useState(true);
  const c=mk(dark);

  const sse=useSSE();
  const agentOnline=useAgentOnline();
  const {crmUrl,contactsUrl}=useCRMLink();
  const {messages,setMessages,send,sendFiles,sendFilesEncoded,loading,workingStatus,sessions,currentSessionId,newSession,loadSession,deleteSession,fetchSessions,stopSarah,sid,agents,currentAgentId,currentAgent,switchAgent}=useSarahChat();
  // Periodically refresh session titles (AI title generates async after first message)
  useEffect(()=>{ const t=setInterval(fetchSessions,8000); return()=>clearInterval(t); },[]);
  const connected=agentOnline; // true online/offline from health poll

  // ── CONFERENCE MODE (group chat with all agents) ──────────────────────
  const [conferenceMode,setConferenceMode]=useState(false);
  const [confMessages,setConfMessages]=useState([]);
  const [confInput,setConfInput]=useState('');
  const [confSending,setConfSending]=useState(false);
  const [confSessionsList,setConfSessionsList]=useState([]);
  const confSessionRef=useRef('conf-'+Date.now());
  const confEndRef=useRef(null);

  useEffect(()=>{confEndRef.current?.scrollIntoView({behavior:'smooth'});},[confMessages,confSending]);

  // Load conference history when entering conference mode
  useEffect(()=>{
    if(!conferenceMode) return;
    (async()=>{
      try{
        const h=await getAuthHeaders();
        const r=await fetch('/api/chat/sessions?conference=true',{headers:h});
        const d=await r.json();
        const confSessions=d.sessions||[];
        // Group conference sub-sessions by their base ID (strip agent suffix)
        const confGroups=new Map();
        for(const cs of confSessions){
          const base=cs.id.replace(/-[a-f0-9]{8}$/,'');
          if(!confGroups.has(base)){
            confGroups.set(base,{id:base,title:cs.title||'Team Conference',updated_at:cs.updated_at,created_at:cs.created_at,subSessions:[cs]});
          }else{
            confGroups.get(base).subSessions.push(cs);
            if(new Date(cs.updated_at)>new Date(confGroups.get(base).updated_at))confGroups.get(base).updated_at=cs.updated_at;
          }
        }
        setConfSessionsList(Array.from(confGroups.values()).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)));
        if(confSessions.length>0){
          // Use the current ref if it matches an existing session, otherwise use latest
          const currentBase=confSessionRef.current;
          const matchesCurrent=currentBase&&confSessions.some(cs=>cs.id.startsWith(currentBase));
          if(!matchesCurrent){
            const latest=confSessions[0];
            confSessionRef.current=latest.id.replace(/-[a-f0-9]{8}$/,'');
          }
          const activeBase=confSessionRef.current;
          // MASTER RECORD APPROACH:
          // - User messages come from the -user sub-session (clean, saved once)
          // - Agent responses come from each agent's sub-session
          // - For legacy sessions (no -user sub-session), fall back to extracting from context strings
          const matchingSessions=confSessions.filter(cs=>cs.id.startsWith(activeBase));
          const userSession=matchingSessions.find(cs=>cs.id.endsWith('-user'));
          const agentSessions=matchingSessions.filter(cs=>!cs.id.endsWith('-user'));

          const userMessages=[];
          const agentMessages=[];

          // 1. Load user messages from -user session (master record)
          if(userSession){
            try{
              const r3=await fetch('/api/chat/sessions/'+userSession.id,{headers:h});
              const d3=await r3.json();
              for(const m of(d3.messages||[])){
                if(m.role==='user'){
                  userMessages.push({id:m.id,from:'user',text:m.content,time:new Date(m.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),_ts:new Date(m.created_at).getTime()});
                }
              }
            }catch{}
          }

          // 2. Load agent responses from agent sub-sessions
          for(const cs of agentSessions){
            try{
              const r3=await fetch('/api/chat/sessions/'+cs.id,{headers:h});
              const d3=await r3.json();
              const agentName=agents.find(a=>cs.id.includes(a.id.slice(0,8)))?.name||'Agent';
              const agentAvatar=agents.find(a=>cs.id.includes(a.id.slice(0,8)))?.avatar_url;
              const agentId=agents.find(a=>cs.id.includes(a.id.slice(0,8)))?.id;
              for(const m of(d3.messages||[])){
                if(m.role==='assistant'){
                  agentMessages.push({id:m.id,from:'agent',fromAgent:agentName,agentId,avatar:agentAvatar,text:m.content,time:new Date(m.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),_ts:new Date(m.created_at).getTime()});
                }
              }
            }catch{}
          }

          // 3. LEGACY FALLBACK: if no -user session exists (old conferences), extract from context strings
          if(!userSession&&agentSessions.length>0){
            const extractUserMsg=(ctxText)=>{
              if(!ctxText)return null;
              if(ctxText.startsWith('[You are ')){
                const threadMatch=ctxText.match(/(?:Thread so far|Here is the conversation so far):\n([\s\S]*?)\n\nRespond naturally/);
                if(!threadMatch)return null;
                const lines=threadMatch[1].split('\n');
                for(let i=lines.length-1;i>=0;i--){
                  if(lines[i].startsWith('Client: '))return lines[i].slice(8);
                }
                return null;
              }
              // Old format: raw transcript pasted as message — extract Client: lines
              const lines=ctxText.split('\n');
              for(let i=lines.length-1;i>=0;i--){
                if(lines[i].startsWith('Client: '))return lines[i].slice(8);
                // Also try: "New message from client:]" format
                if(lines[i].startsWith('New message from client:'))return lines[i+1]?.trim()||null;
              }
              return null;
            };
            // Only pull user messages from the FIRST agent session
            try{
              const cs=agentSessions[0];
              const r3=await fetch('/api/chat/sessions/'+cs.id,{headers:h});
              const d3=await r3.json();
              const seenTexts=new Set();
              for(const m of(d3.messages||[])){
                if(m.role==='user'){
                  const realText=extractUserMsg(m.content);
                  if(realText&&!seenTexts.has(realText.slice(0,200))){
                    seenTexts.add(realText.slice(0,200));
                    userMessages.push({id:m.id,from:'user',text:realText,time:new Date(m.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),_ts:new Date(m.created_at).getTime()});
                  }
                }
              }
            }catch{}
          }

          // Merge and sort by timestamp
          const deduped=[...userMessages,...agentMessages].sort((a,b)=>a._ts-b._ts);
          if(deduped.length>0)setConfMessages(deduped);
        }
      }catch(e){console.error('Failed to load conference history:',e);}
    })();
  },[conferenceMode,agents]);

  const sendConfMessage=async()=>{
    const text=confInput.trim(); if(!text||confSending||!agents.length)return;
    setConfInput('');setConfSending(true);
    const tstamp=()=>new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    setConfMessages(p=>[...p,{id:'cu-'+Date.now(),from:'user',text,time:tstamp()}]);

    // Save user message ONCE to a dedicated -user sub-session (master record)
    try{
      const h=await getAuthHeaders();
      await fetch('/api/chat/conference/user-message',{method:'POST',headers:h,body:JSON.stringify({text,sessionId:confSessionRef.current+'-user'})});
    }catch(e){console.error('Failed to save conference user message:',e);}

    // Helper: detect which agents are mentioned in text (excluding the speaker)
    const detectMentions=(msg,excludeAgent)=>{
      const lower=msg.toLowerCase();
      return agents.filter(a=>{
        if(excludeAgent&&a.id===excludeAgent.id)return false;
        const first=a.name.split(' ')[0].toLowerCase();
        return lower.includes(first)||lower.includes(a.name.toLowerCase());
      });
    };

    // Helper: send to one agent and get response (skipUserSave — user msg already saved in -user session)
    const sendToOne=async(a,thread)=>{
      const ctx=`[You are ${a.name} in a group chat with the client and ${agents.filter(x=>x.id!==a.id).map(x=>x.name).join(', ')}. Thread so far:\n${thread}\n\nRespond naturally as ${a.name}. If another team member asked you a question or made a point, engage with them directly — you can talk to each other without waiting for the client. Keep it conversational and collaborative. If the message has nothing to do with you, stay silent.]`;
      try{
        const h=await getAuthHeaders();
        const r=await fetch('/api/chat/message',{method:'POST',headers:h,body:JSON.stringify({message:ctx,sessionId:confSessionRef.current+'-'+a.id.slice(0,8),agentId:a.id,skipUserSave:true})});
        const d=await r.json();
        let rt=(d.response||d.message||'').replace(/\s*\[Session context[\s\S]*$/,'').replace(/\s*\[Tool:.*?\]\s*/g,'').trim();
        rt=rt.replace(/^\[You are[\s\S]*?conversational\.\]\s*/,'').trim();
        if(rt&&!rt.match(/^(\*stays silent\*|\*silent\*|\.\.\.|\*no response\*)/i))return{rt,skills:d.skillsUsed||[]};
      }catch(e){console.error('Conference send to '+a.name+' failed:',e);}
      return null;
    };

    // Smart routing: only addressed agents respond
    const addressed=detectMentions(text,null);
    const responding=addressed.length>0?addressed:agents;

    // Build thread context
    const recent=[...confMessages.slice(-30),{from:'user',text}];
    let running=recent.map(m=>m.from==='user'?`Client: ${m.text}`:`${m.fromAgent||'Agent'}: ${m.text}`).join('\n');

    // Phase 1: Initial agent responses
    let lastResponders=[];
    for(const a of responding){
      const res=await sendToOne(a,running);
      if(res){
        const msg={id:'ca-'+a.id.slice(0,8)+'-'+Date.now(),from:'agent',fromAgent:a.name,agentId:a.id,avatar:a.avatar_url,text:res.rt,time:tstamp(),skills:res.skills,hasArtifact:!!res.rt.match(/Created "|I've created|I created|saved as|saved it to|in your Files tab|saved to.*Files/i)};
        setConfMessages(p=>[...p,msg]);
        running+=`\n${a.name}: ${res.rt}`;
        lastResponders.push({agent:a,text:res.rt});
      }
    }

    // Phase 2: Auto-continuation — if an agent addressed another agent, trigger them
    for(let round=0;round<8;round++){
      if(!lastResponders.length)break;
      const nextMap=new Map();
      for(const{agent:resp,text:rText}of lastResponders){
        for(const m of detectMentions(rText,resp)){if(!nextMap.has(m.id))nextMap.set(m.id,m);}
      }
      if(!nextMap.size)break;
      lastResponders=[];
      for(const[,a]of nextMap){
        const res=await sendToOne(a,running);
        if(res){
          const msg={id:'ca-'+a.id.slice(0,8)+'-'+Date.now()+'-r'+round,from:'agent',fromAgent:a.name,agentId:a.id,avatar:a.avatar_url,text:res.rt,time:tstamp(),skills:res.skills,hasArtifact:!!res.rt.match(/Created "|I've created|I created|saved as|saved it to|in your Files tab|saved to.*Files/i)};
          setConfMessages(p=>[...p,msg]);
          running+=`\n${a.name}: ${res.rt}`;
          lastResponders.push({agent:a,text:res.rt});
        }
      }
    }

    setConfSending(false);
  };

  const [pg,setPg]=useState("chat");
  const [tx,setTx]=useState("");
  const [isNew,setNew]=useState(true);
  const [vcRec,setVcRec]=useState(false);
  const [showPlusMenu,setShowPlusMenu]=useState(false);
  const plusMenuRef=useRef(null);
  const [oauthToast,setOauthToast]=useState(null);
  const [activeConnectors,setActiveConnectors]=useState({ghl:true});

  // Extracted so it can be called both on mount and after OAuth success
  const loadActiveConnectors = () => {
    // Multi-tenant: resolve org from logged-in user's profile, not hardcoded BLOOM org
    const orgId = meProfile?.orgId || 'a1000000-0000-0000-0000-000000000001';
    fetch(`/api/connectors/active?orgId=${orgId}`)
      .then(r=>r.ok?r.json():null)
      .then(data=>{
        if(data?.connectors){
          const map={ghl:true};
          data.connectors.forEach(c=>{ map[c.slug]=true; });
          setActiveConnectors(map);
        }
      })
      .catch(()=>{});
  };

  useEffect(()=>{ loadActiveConnectors(); },[]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const success=params.get('oauth_success');
    const error=params.get('oauth_error');
    const connector=params.get('connector');
    if(success){
      setOauthToast({type:'success',msg:`${connector||success} connected!`});
      setPg('customize');
      window.history.replaceState({},'',window.location.pathname);
      // Re-fetch connector status so the UI updates immediately
      loadActiveConnectors();
      setTimeout(()=>setOauthToast(null),5000);
    } else if(error){
      const errMsg = decodeURIComponent(error);
      // Show friendly message for coming-soon connectors
      const displayMsg = errMsg.includes('coming soon') ? errMsg : `Connection failed: ${errMsg}`;
      setOauthToast({type:'error',msg:displayMsg});
      setPg('customize');
      window.history.replaceState({},'',window.location.pathname);
      setTimeout(()=>setOauthToast(null),6000);
    }
  },[]);
  
  // Projects state
  const [projects,setProjects]=useState([]);
  const [loadingProjects,setLoadingProjects]=useState(false);
  const [showProjectModal,setShowProjectModal]=useState(false);
  const [newProjectName,setNewProjectName]=useState('');
  const [newProjectDesc,setNewProjectDesc]=useState('');
  const [selectedProject,setSelectedProject]=useState(null);
  const [projectConversations,setProjectConversations]=useState([]);
  
  // Fetch projects when Projects page is opened
  useEffect(()=>{
    if(pg==="projects" && projects.length===0 && !loadingProjects){
      setLoadingProjects(true);
      withAuth().then(h=>fetch('/api/projects',h))
        .then(r=>r.json())
        .then(data=>{
          if(data.success){
            setProjects(data.projects);
          }
        })
        .catch(err=>console.error('Failed to load projects:',err))
        .finally(()=>setLoadingProjects(false));
    }
  },[pg]);
  
  const [scrM,setScrM]=useState("docked");
  const [rightTab,setRightTab]=useState("browser"); // "browser" | "artifact"
  const [activeArtifact,setActiveArtifact]=useState(null); // {name, content, fileId}
  const [chatLightbox,setChatLightbox]=useState(null);

  // Auto-open Files panel when Sarah creates an artifact
  useEffect(()=>{
    if(!messages.length) return;
    const last = messages[messages.length-1];
    if(last?.b && last?.hasArtifact && scrM==="docked"){
      setTimeout(()=>setRightTab("artifact"),600);
    }
  },[messages]);
  const [sbO,setSbO]=useState(!mob?"full":"closed");
  const [openChatMenu,setOpenChatMenu]=useState(null); // Track which chat's menu is open
  const [stab,setStab]=useState("General");
  const [tgEnabled,setTgEnabled]=useState(false);
  const [tgLoading,setTgLoading]=useState(false);
  const [hlpO,setHlpO]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const [profileData,setProfileData]=useState(null);
  const [scheduledTasks,setScheduledTasks]=useState([]);
  const [taskFormOpen,setTaskFormOpen]=useState(false);
  const [editingProfile,setEditingProfile]=useState(false);
  const [editTitle,setEditTitle]=useState('');
  const [editDesc,setEditDesc]=useState('');
  const [newTask,setNewTask]=useState({name:'',instruction:'',taskType:'content',frequency:'daily',runTime:'09:00'});
  const [actTab,setActTab]=useState("scheduled"); // scheduled | history | calendar
  const [taskRuns,setTaskRuns]=useState([]);
  const [expandedRun,setExpandedRun]=useState(null);
  const [editTask,setEditTask]=useState(null); // task being edited
  const [editForm,setEditForm]=useState({name:'',instruction:'',taskType:'custom',frequency:'daily',runTime:'09:00'});
  const [previewFileIdx,setPreviewFileIdx]=useState(null);
  const [bulkImportOpen,setBulkImportOpen]=useState(false);
  const [bulkText,setBulkText]=useState('');
  const [calMonth,setCalMonth]=useState(new Date());
  const [calSelDay,setCalSelDay]=useState(null);
  const [calTask,setCalTask]=useState({name:'',instruction:'',frequency:'daily',runTime:'09:00'});

  // ── MODEL CONFIG STATE ──
  const [modelConfig,setModelConfig]=useState(null);
  const [modelSaving,setModelSaving]=useState(false);

  // ── IMAGE ENGINE CONFIG STATE ──
  const [imgEngineConfig,setImgEngineConfig]=useState(null);
  const [imgEngineSaving,setImgEngineSaving]=useState(false);

  // Fetch trust gate status + model config + image engine config on mount
  useEffect(()=>{
    withAuth().then(h=>fetch("/api/dashboard/trust-gate-status",h)).then(r=>r.ok?r.json():null).then(d=>{if(d)setTgEnabled(d.enabled)}).catch(()=>{});
    withAuth().then(h=>fetch("/api/dashboard/model-config",h)).then(r=>r.ok?r.json():null).then(d=>{if(d)setModelConfig(d)}).catch(()=>{});
    withAuth().then(h=>fetch("/api/dashboard/image-engine-config",h)).then(r=>r.ok?r.json():null).then(d=>{if(d)setImgEngineConfig(d)}).catch(()=>{});
  },[]);

  const toggleTrustGate=async()=>{
    setTgLoading(true);
    try{
      const r=await fetch("/api/dashboard/trust-gate-status", await withAuth({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:!tgEnabled})});
      if(r.ok){const d=await r.json();setTgEnabled(d.enabled);}
    }catch{}
    setTgLoading(false);
  };

  const handleCSVFile=(file)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      const text=e.target.result;
      // Skip header row if it starts with "Task Name"
      const lines=text.split('\n').filter(l=>l.trim()&&!l.match(/^task name/i));
      setBulkText(lines.join('\n'));
    };
    reader.readAsText(file);
  };
  const [agentImgUrl,setAgentImgUrl]=useState(null);

  const loadProfile = async (agentId) => {
    try {
      const aid = agentId || currentAgentId;
      const qs = aid ? `?agentId=${aid}` : '';
      const [pRes, tRes] = await Promise.all([
        fetch('/api/agent/profile'+qs).then(r=>r.json()),
        fetch('/api/agent/tasks', await withAuth()).then(r=>r.json())
      ]);
      setProfileData(pRes);
      setScheduledTasks(tRes.tasks||[]);
      if(pRes.profile){
        setEditTitle(pRes.profile.jobTitle||'');
        setEditDesc(pRes.profile.jobDescription||'');
        if(pRes.profile.avatarUrl) setAgentImgUrl(pRes.profile.avatarUrl);
      }
    } catch(e){ console.error('Failed to load profile',e); }
  };

  // Reload profile/activity when agent changes while on those pages
  useEffect(()=>{
    if(!currentAgentId) return;
    if(pg==="profile"){
      setProfileData(null);
      loadProfile(currentAgentId);
    }
    if(pg==="activity"){
      loadActivity(currentAgentId);
    }
  },[currentAgentId]);

  const loadActivity = async (agentId) => {
    try {
      const aid = agentId || currentAgentId || '';
      const qs = aid ? `?agentId=${aid}` : '';
      const [tRes, rRes] = await Promise.all([
        fetch(`/api/agent/tasks${qs}`, await withAuth()).then(r=>r.json()),
        fetch(`/api/agent/tasks/runs${qs}`, await withAuth()).then(r=>r.json()).catch(()=>({runs:[]}))
      ]);
      setScheduledTasks(tRes.tasks||[]);
      setTaskRuns(rRes.runs||[]);
    } catch(e){ console.error('Failed to load activity',e); }
  };
  const [umO,setUmO]=useState(false);
  const [searchQuery,setSearchQuery]=useState(""); // Search conversations
  const [userImg,setUserImg]=useState(null);
  const userImgRef=useRef(null);
  // Dynamic user profile from /api/agent/me (replaces hardcoded Kimberly/Owner/K)
  const [meProfile,setMeProfile]=useState(null);
  const meDisplayName = meProfile?.fullName || authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'User';
  const meInitial = meDisplayName.charAt(0).toUpperCase();
  const meRole = meProfile?.role || 'member';
  const isOwner = meRole === 'owner';
  const updateModel=async(newModel)=>{
    if(!isOwner)return;
    setModelSaving(true);
    try{
      const r=await fetch("/api/dashboard/model-config", await withAuth({method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:newModel})});
      if(r.ok){const d=await r.json();setModelConfig(prev=>({...prev,model:d.model,reason:'dashboard override'}));}
    }catch{}
    setModelSaving(false);
  };
  const updateImgEngine=async(contentType,engine)=>{
    if(!isOwner)return;
    setImgEngineSaving(true);
    try{
      const r=await fetch("/api/dashboard/image-engine-config", await withAuth({method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({[contentType]:engine})});
      if(r.ok){const d=await r.json();setImgEngineConfig(d.config);}
    }catch{}
    setImgEngineSaving(false);
  };
  const meOrgName = meProfile?.orgName || null;
  const meOrgLogo = meProfile?.orgLogoUrl || null;

  // Load authenticated user profile on mount
  useEffect(()=>{
    (async()=>{
      try{
        const headers=await getAuthHeaders();
        const r=await fetch('/api/agent/me',{headers});
        const d=await r.json();
        if(d.user){
          setMeProfile(d.user);
          if(d.user.avatarUrl) setUserImg(d.user.avatarUrl);
          if(d.user.orgName) { setBizName(d.user.orgName); setActiveProj(d.user.orgName); }
          if(d.user.orgLogoUrl) setBizLogo(d.user.orgLogoUrl);
        }
      }catch(e){ console.error('Failed to load user profile',e); }
    })();
  },[]);

  // Fallback: Load user avatar from old endpoint if /me didn't provide one
  useEffect(()=>{
    if(userImg) return; // already loaded from /me
    withAuth().then(h=>fetch('/api/dashboard/user-avatar',h)).then(r=>r.json()).then(d=>{if(d.avatar)setUserImg(d.avatar);}).catch(()=>{});
  },[]);
  // Load agent avatar when agent changes
  useEffect(()=>{
    if(!currentAgentId) return;
    withAuth().then(h=>fetch('/api/agent/profile?agentId='+currentAgentId,h)).then(r=>r.json()).then(d=>{if(d.profile?.avatarUrl)setAgentImgUrl(d.profile.avatarUrl); else setAgentImgUrl(null);}).catch(()=>{});
  },[currentAgentId]);
  const [projO,setProjO]=useState(false);
  const [activeProj,setActiveProj]=useState("My Business");
  const [bizLogo,setBizLogo]=useState(null);
  const [bizName,setBizName]=useState(null);

  // Fallback: Load business profile for logo (only if /me didn't provide org info)
  useEffect(()=>{
    if(meOrgName) return; // already got org from /me
    withAuth().then(h=>fetch('/api/dashboard/business-profile',h)).then(r=>r.json()).then(d=>{
      if(d.profile?.logoUrl)setBizLogo(d.profile.logoUrl);
      if(d.profile?.name){setBizName(d.profile.name);setActiveProj(d.profile.name);}
    }).catch(()=>{});
  },[meOrgName]);
  const [files,setFiles]=useState([]);
  const [filesLoading,setFilesLoading]=useState(false);
  const [filesSearch,setFilesSearch]=useState('');
  const [filesRefresh,setFilesRefresh]=useState(0);
  const [previewFile,setPreviewFile]=useState(null); // {name, content, fileId}

  // Clear files immediately when switching agents (prevents stale data flash)
  useEffect(()=>{ setFiles([]); setFilesRefresh(r=>r+1); },[currentAgentId]);
  const [pageEditor,setPageEditor]=useState(null); // {fileId, name, content} — GrapesJS editor
  const [editMode,setEditMode]=useState(false);
  const [editContent,setEditContent]=useState('');
  const [editSaving,setEditSaving]=useState(false);
  const [editorFullscreen,setEditorFullscreen]=useState(false);
  const [publishOpen,setPublishOpen]=useState(false);
  const [publishSlug,setPublishSlug]=useState('');
  const [publishError,setPublishError]=useState('');
  const [publishedUrl,setPublishedUrl]=useState(null);
  const [publishUrl,setPublishUrl]=useState(null);
  const [heartbeatInterval,setHeartbeatInterval]=useState("0 */6 * * *");
  const [heartbeatEnabled,setHeartbeatEnabled]=useState(true);
  const [cronJobs,setCronJobs]=useState([
    {id:"c1",nm:"GHL contact sync",ic:"👥",freq:"Every 15min",next:"—",last:"—",ok:true,on:true},
    {id:"c2",nm:"Proactive check-in",ic:"💬",freq:"Every 6hrs",next:"—",last:"—",ok:true,on:true},
    {id:"c3",nm:"System health scan",ic:"🔍",freq:"Every 30min",next:"—",last:"—",ok:true,on:true},
    {id:"c4",nm:"Task completion scan",ic:"✅",freq:"Hourly",next:"—",last:"—",ok:true,on:true},
  ]);

  // Fetch deliverables when files tab opens, after approval, or when agent changes
  // In conference mode, show files from ALL agents (no agentId filter)
  useEffect(()=>{
    if(pg!=="artifacts") return;
    setFilesLoading(true);
    const url = conferenceMode
      ? "/api/files/artifacts?limit=100"
      : currentAgentId ? `/api/files/artifacts?limit=100&agentId=${currentAgentId}` : "/api/files/artifacts?limit=100";
    // Send auth headers so server resolves correct org from JWT — critical for multi-tenant
    getAuthHeaders().then(headers => {
      fetch(url, { headers })
        .then(r=>r.ok?r.json():null)
        .then(d=>{ setFiles(d?.artifacts||[]); })
        .catch(()=>{})
        .finally(()=>setFilesLoading(false));
    });
  },[pg,filesRefresh,currentAgentId,conferenceMode]);
  const btm=useRef(null);
  const fRef=useRef(null);
  const [pendingFiles,setPendingFiles]=useState([]);
  const sbOpen=sbO==="full"||sbO==="mini";

  const agent={nm:currentAgent?.name||"Sarah Rodriguez",role:currentAgent?.role||"Marketing & Operations Executive",img:agentImgUrl||currentAgent?.avatar_url||null,grad:"linear-gradient(135deg,#F4A261,#E76F8B)"};
  const aFN=(currentAgent?.name||"Sarah").split(" ")[0]; // agent first name for dynamic UI text
  const fmtFreq=(f)=>({every_10_min:"Every 10 min",every_30_min:"Every 30 min",hourly:"Hourly",daily:"Daily",weekdays:"Weekdays",weekly:"Weekly",monthly:"Monthly"}[f]||f);

  useEffect(()=>{ if(btm.current) setTimeout(()=>btm.current?.scrollIntoView({behavior:"smooth"}),100); },[messages]);

  useEffect(()=>{
    if(!umO) return;
    const h=()=>setUmO(false);
    setTimeout(()=>document.addEventListener("click",h),0);
    return()=>document.removeEventListener("click",h);
  },[umO]);

  const takeScreenshot=async()=>{
    setShowPlusMenu(false);
    try {
      // CaptureController.setFocusBehavior("no-focus-change") prevents browser from
      // switching focus to the captured tab/window — keeps user on dashboard
      const controller = typeof CaptureController !== 'undefined' ? new CaptureController() : null;
      const streamOptions = controller ? { controller, video: true, audio: false } : { video: true, audio: false };
      const stream = await navigator.mediaDevices.getDisplayMedia(streamOptions);
      const track = stream.getVideoTracks()[0];
      // Immediately lock focus to capturing app (must be called right after promise resolves)
      if (controller) {
        try { controller.setFocusBehavior('no-focus-change'); } catch(e) { /* monitor surface throws — ignore */ }
      }
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();
      // Cap at 1920px wide — 4K screenshots balloon to 20MB+ as PNG
      const MAX_W = 1920;
      let drawW = bitmap.width;
      let drawH = bitmap.height;
      if (drawW > MAX_W) {
        drawH = Math.round(drawH * MAX_W / drawW);
        drawW = MAX_W;
      }
      const canvas = document.createElement('canvas');
      canvas.width = drawW;
      canvas.height = drawH;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, drawW, drawH);
      // toBlob is async and waits for full render — toDataURL can silently return corrupt data
      canvas.toBlob(blob => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          const base64 = dataUrl.split(',')[1];
          setPendingFiles(prev => [...prev, { name: 'screenshot.png', type: 'image/png', preview: dataUrl, base64 }]);
        };
        reader.readAsDataURL(blob);
      }, 'image/png');
    } catch(err) {
      if(err.name !== 'NotAllowedError') console.error('Screenshot failed:', err);
    }
  };

  const doSend=async()=>{
    if((!tx.trim()&&pendingFiles.length===0)||loading) return;
    const text=tx.trim(); setTx(""); setNew(false);
    if(pendingFiles.length > 0) {
      // Send files + message together
      // Some files (screenshots) already have base64 encoded — pass them directly
      // Others (file picker) have a File object — FileReader will encode them
      const hasPreEncoded = pendingFiles.some(p => p.base64);
      setPendingFiles([]);
      if(hasPreEncoded) {
        // Build encoded array directly, mixing pre-encoded and File-based entries
        const encoded = await Promise.all(pendingFiles.map(async p => {
          if(p.base64) {
            return { name: p.name, type: p.type || 'image/png', data: p.base64, dataUrl: p.preview };
          }
          return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res({ name: p.file.name, type: p.file.type, data: r.result.split(',')[1], dataUrl: r.result });
            r.onerror = rej;
            r.readAsDataURL(p.file);
          });
        }));
        // Call sendFiles with pre-encoded — pass encoded array directly via sendFilesEncoded
        await sendFilesEncoded(encoded, text);
      } else {
        const files = pendingFiles.map(p => p.file);
        await sendFiles(files, text);
      }
    } else {
      await send(text);
    }
  };

  const toggleVoice=()=>{
    if(vcRec){setVcRec(false);return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) return;
    const r=new SR(); r.continuous=false; r.interimResults=true; r.lang="en-US";
    r.onresult=(ev)=>{ let t=""; for(let i=0;i<ev.results.length;i++) t+=ev.results[i][0].transcript; setTx(t); };
    r.onend=()=>setVcRec(false); r.onerror=()=>setVcRec(false);
    r.start(); setVcRec(true);
  };

  const toggleCron=(id)=>setCronJobs(p=>p.map(j=>j.id===id?{...j,on:!j.on}:j));

  // Modern icon components
  const ChatIcon = ({active,sz=16}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={active?c.tx:c.so} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
  const StatusIcon = ({active,sz=16}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={active?c.tx:c.so} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
    </svg>
  );
  const FilesIcon = ({active,sz=16}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={active?c.tx:c.so} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  );
  const ActivityIcon = ({active,sz=16}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={active?c.tx:c.so} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
  const CallsIcon = ({active,sz=16}) => (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={active?c.tx:c.so} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  );

  const navTabs=[
    {k:"chat",l:"Chat",icon:ChatIcon},
    {k:"monitor",l:"Status",icon:StatusIcon},
    {k:"docs",l:"Docs",icon:FilesIcon},
    {k:"activity",l:"Activity",icon:ActivityIcon},
    {k:"mobile",l:"Mobile",icon:CallsIcon},
  ];

  return(
    <div style={{minHeight:"100vh",background:c.bg,fontFamily:"'Inter',system-ui,-apple-system,sans-serif",color:c.tx}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bloomGlow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
        @keyframes bloomieWiggle{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus,button:focus{outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:${c.ln};border-radius:10px}
      `}</style>
      {/* ── OAuth Toast ── */}
      {oauthToast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"12px 20px",borderRadius:12,background:oauthToast.type==="success"?"linear-gradient(135deg,#F4A261,#E76F8B)":"#ea4335",color:"#fff",fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:10,whiteSpace:"nowrap"}}>
          {oauthToast.type==="success"
            ?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            :<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
          {oauthToast.msg}
        </div>
      )}
      <input ref={fRef} type="file" multiple accept="image/*,.pdf,.csv,.txt,.docx,.xlsx,.json,.md" style={{display:"none"}} onChange={async(e)=>{
        const files=[...e.target.files];
        if(!files.length) return;
        // Stage files — don't send yet. User types a message first, then hits Send.
        const previews = await Promise.all(files.map(async f => {
          const url = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
          return { file: f, name: f.name, type: f.type, preview: url };
        }));
        setPendingFiles(prev => [...prev, ...previews]);
        e.target.value="";
      }}/>

      {/* ── HEADER — exact Jaden layout ── */}
      <div style={{padding:mob?"8px 12px":"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:c.cd,borderBottom:"1px solid "+c.ln,position:"sticky",top:0,zIndex:60,gap:8,paddingTop:"max(10px, calc(10px + env(safe-area-inset-top)))"}}>
        <div style={{display:"flex",alignItems:"center",gap:mob?6:10}}>
          {pg==="chat"&&<button onClick={()=>setSbO(sbO==="full"?"mini":sbO==="mini"?"closed":"full")} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:c.so,flexShrink:0}}>☰</button>}
          <div style={{cursor:"pointer",display:"flex",alignItems:"center",gap:mob?4:8}} onClick={()=>setPg("chat")}>
            <Bloom sz={mob?28:32} glow/>
            {!mob&&<span style={{fontSize:16,fontWeight:700,color:c.tx}}>Bloomie</span>}
            {!mob&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"#E76F8B20",color:"#E76F8B",letterSpacing:0.5}}>BETA</span>}
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:mob?6:12,flexWrap:"nowrap"}}>
          <div style={{display:"flex",gap:mob?2:4,background:c.sf,padding:3,borderRadius:10}}>
            {navTabs.map(t=>(
              <button key={t.k} onClick={()=>{setPg(t.k);if(t.k==="activity")loadActivity();if(t.k==="profile")loadProfile();}} style={{padding:mob?"7px 10px":"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:pg===t.k?c.cd:"transparent",color:pg===t.k?c.tx:c.so,boxShadow:pg===t.k?"0 1px 4px rgba(0,0,0,.06)":"none",display:"flex",alignItems:"center",gap:6,transition:"all .15s"}}>
                <t.icon active={pg===t.k} sz={14}/>
                {!mob&&<span>{t.l}</span>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:12,background:connected?c.gf:"#fef2f2",border:"1px solid "+(connected?c.gr+"30":"#fecaca")}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:connected?c.gr:"#ef4444",animation:connected?"pulse 1.5s ease infinite":"none"}}/>
            <span style={{fontSize:10,fontWeight:600,color:connected?c.gr:"#dc2626"}}>{connected?"Connected":"Offline"}</span>
          </div>
          <a href={`https://app.gohighlevel.com`} target="_blank" rel="noopener" style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:8,border:"1.5px solid transparent",backgroundImage:"linear-gradient("+c.cd+","+c.cd+"), linear-gradient(135deg,#F4A261,#E76F8B)",backgroundOrigin:"border-box",backgroundClip:"padding-box, border-box",fontSize:10,fontWeight:700,textDecoration:"none",cursor:"pointer",background:c.cd}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="url(#crmGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <defs><linearGradient id="crmGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F4A261"/><stop offset="100%" stopColor="#E76F8B"/></linearGradient></defs>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            <span style={{background:"linear-gradient(135deg,#F4A261,#E76F8B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>BLOOM CRM</span>
          </a>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {scrM==="hidden"&&<button onClick={()=>setScrM("docked")} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}} title="Show side panel">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="2"><path d="M10 3l-5 5 5 5"/></svg>
          </button>}
          <div style={{width:36,height:36,borderRadius:"50%",background:userImg?"transparent":"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",overflow:"hidden"}}>{userImg?<img src={userImg} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:meInitial}</div>
        </div>
      </div>

      <div style={{display:"flex",position:"relative"}}>
        {pg==="chat"&&sbO==="full"&&mob&&<div onClick={()=>setSbO("closed")} style={{position:"fixed",inset:0,top:52,background:"rgba(0,0,0,.3)",zIndex:45}}/>}

        {/* ── SIDEBAR — session history like Claude (visible on all pages) ── */}
        {sbOpen&&(
          <div style={mob?{position:"fixed",top:52,left:0,bottom:0,zIndex:50}:{}}>
            <div style={{width:sbO==="mini"?60:260,height:"calc(100vh - 52px)",background:c.cd,borderRight:"1px solid "+c.ln,display:"flex",flexDirection:"column",flexShrink:0,transition:"width .2s ease",overflow:"hidden"}}>

              {/* MINI sidebar */}
              {sbO==="mini"&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"12px 0",gap:4,flex:1}}>
                  <button onClick={()=>{newSession();setNew(true);}} title="New chat" style={{width:40,height:40,borderRadius:10,border:"1.5px dashed "+c.ln,background:"transparent",cursor:"pointer",fontSize:18,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  <div style={{width:32,height:1,background:c.ln,margin:"4px 0"}}/>
                  {sessions.slice(0,6).map(s=>(
                    <button key={s.id} onClick={()=>{loadSession(s.id);setNew(false);}} title={s.title||"Chat"} style={{width:40,height:40,borderRadius:10,border:currentSessionId===s.id?"2px solid "+c.ac:"1px solid "+c.ln,background:currentSessionId===s.id?c.ac+"12":"transparent",cursor:"pointer",fontSize:11,fontWeight:700,color:currentSessionId===s.id?c.ac:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {(s.title||"C").charAt(0).toUpperCase()}
                    </button>
                  ))}
                  <button onClick={()=>setSbO("full")} style={{width:40,height:40,borderRadius:10,border:"none",background:c.sf,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:c.tx,marginTop:"auto"}}>{userImg?<img src={userImg} style={{width:"100%",height:"100%",borderRadius:10,objectFit:"cover"}} alt=""/>:meInitial}</button>
                </div>
              )}

              {/* FULL sidebar */}
              {sbO==="full"&&(
                <>
                  {/* Project switcher */}
                  <div style={{padding:"10px 14px 0",flexShrink:0,position:"relative"}}>
                    <button onClick={()=>setProjO(!projO)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:"1px solid "+c.ln,background:c.sf,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,fontWeight:600,color:c.so}}>
                      <span style={{display:"flex",alignItems:"center",gap:6}}>{bizLogo?<img src={bizLogo} style={{width:18,height:18,borderRadius:4,objectFit:"contain"}} alt=""/>:<span style={{fontSize:14}}>🏢</span>}<span style={{color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{activeProj}</span></span>
                      <span style={{fontSize:10,transition:"transform .2s",display:"inline-block",transform:projO?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
                    </button>
                    {projO&&(
                      <div style={{position:"absolute",top:"100%",left:14,right:14,zIndex:70,background:c.cd,border:"1px solid "+c.ln,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.15)",overflow:"hidden",marginTop:4}}>
                        {projects.map(p=>(
                          <button key={p.id||p.name} onClick={()=>{setActiveProj(p.name);setProjO(false);setPg("projects");}} style={{width:"100%",textAlign:"left",padding:"9px 12px",border:"none",cursor:"pointer",background:activeProj===p.name?c.ac+"15":"transparent",fontSize:12,fontWeight:activeProj===p.name?600:500,color:activeProj===p.name?c.ac:c.tx,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>{if(activeProj!==p.name)e.currentTarget.style.background=c.hv;}} onMouseLeave={e=>{if(activeProj!==p.name)e.currentTarget.style.background="transparent";}}>
                            {activeProj===p.name&&<span style={{fontSize:10,color:c.ac}}>✓</span>}
                            <span>{p.name}</span>
                          </button>
                        ))}
                        <div style={{borderTop:"1px solid "+c.ln,padding:"7px 12px"}}>
                          <button onClick={()=>{setProjO(false);setPg("projects");}} style={{width:"100%",textAlign:"left",padding:"4px 0",border:"none",background:"transparent",cursor:"pointer",fontSize:11,color:c.so,display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.color=c.ac} onMouseLeave={e=>e.currentTarget.style.color=c.so}>
                            <span>+</span><span>Manage projects</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Agent switcher — switch between Bloomies + Conference */}
                  {agents.length>0&&(
                    <div style={{padding:"6px 14px 0",flexShrink:0}}>
                      <select value={conferenceMode?"conference":currentAgentId||""} onChange={e=>{
                        if(e.target.value==='conference'){setConferenceMode(true);}
                        else{setConferenceMode(false);switchAgent(e.target.value);}
                      }} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid "+(conferenceMode?c.ac:c.ln),background:conferenceMode?"rgba(244,162,97,0.08)":c.sf,color:conferenceMode?c.ac:c.tx,fontSize:12,fontWeight:600,cursor:"pointer",appearance:"auto"}}>
                        {agents.map(a=><option key={a.id} value={a.id}>{a.name} — {a.role||'AI Employee'}</option>)}
                        {agents.length>1&&<option value="conference">Team Conference — All Bloomies</option>}
                      </select>
                    </div>
                  )}

                  {/* Agent identity card */}
                  <div style={{padding:"12px 14px 8px",borderBottom:"1px solid "+c.ln,flexShrink:0}}>
                    <div onClick={()=>{loadProfile();setPg("profile");}} style={{padding:"10px 12px",borderRadius:12,background:c.sf,border:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:10,marginBottom:10,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background=c.sf}>
                      <div style={{animation:"bloomieWiggle 3s ease-in-out infinite"}}><Face sz={34} agent={agent}/></div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{agent.nm}</div>
                        <div style={{fontSize:10,color:connected?c.gr:c.fa,display:"flex",alignItems:"center",gap:4,marginTop:1}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:connected?c.gr:c.fa,animation:connected?"pulse 1.5s ease infinite":"none"}}/>
                          {connected?"Online":"Offline"}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={()=>{newSession();setNew(true);}}
                      style={{width:"100%",padding:"9px 0",borderRadius:10,border:"1.5px dashed "+c.ln,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,color:c.so,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                    >
                      <span style={{fontSize:16}}>+</span> New chat
                    </button>

                    {/* Search conversations */}
                    <div style={{padding:"8px 0"}}>
                      <div style={{position:"relative"}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}>
                          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e=>setSearchQuery(e.target.value)}
                          placeholder="Search"
                          style={{width:"100%",padding:"8px 10px 8px 36px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,color:c.tx,fontSize:13,fontFamily:"inherit",outline:"none"}}
                          onFocus={e=>e.currentTarget.style.borderColor=c.ac}
                          onBlur={e=>e.currentTarget.style.borderColor=c.ln}
                        />
                      </div>
                    </div>

                    {/* Sidebar navigation menu */}
                    <div style={{padding:"4px 0",marginBottom:8,borderBottom:"1px solid "+c.ln}}>
                      <button onClick={()=>{setPg("customize");if(window.innerWidth<768)setSbO("closed");}} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",background:pg==="customize"?c.sf:"transparent",color:pg==="customize"?c.tx:c.so,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"background .15s"}} onMouseEnter={e=>{ if(pg!=="customize") e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(pg!=="customize") e.currentTarget.style.background="transparent"; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>Customize</span>
                      </button>
                      <button onClick={()=>{setPg("chat");if(window.innerWidth<768)setSbO("closed");}} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",background:pg==="chat"?c.sf:"transparent",color:pg==="chat"?c.tx:c.so,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"background .15s"}} onMouseEnter={e=>{ if(pg!=="chat") e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(pg!=="chat") e.currentTarget.style.background="transparent"; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <span>Chats</span>
                      </button>
                      <button onClick={()=>{setPg("projects");if(window.innerWidth<768)setSbO("closed");}} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",background:pg==="projects"?c.sf:"transparent",color:pg==="projects"?c.tx:c.so,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"background .15s"}} onMouseEnter={e=>{ if(pg!=="projects") e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(pg!=="projects") e.currentTarget.style.background="transparent"; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        <span>Projects</span>
                      </button>
                      <button onClick={()=>{setPg("artifacts");if(window.innerWidth<768)setSbO("closed");}} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",background:pg==="artifacts"?c.sf:"transparent",color:pg==="artifacts"?c.tx:c.so,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"background .15s"}} onMouseEnter={e=>{ if(pg!=="artifacts") e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(pg!=="artifacts") e.currentTarget.style.background="transparent"; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>Files</span>
                      </button>
                      <button onClick={()=>{setPg("dispatch");if(window.innerWidth<768)setSbO("closed");}} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",background:pg==="dispatch"?c.sf:"transparent",color:pg==="dispatch"?c.tx:c.so,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"background .15s"}} onMouseEnter={e=>{ if(pg!=="dispatch") e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(pg!=="dispatch") e.currentTarget.style.background="transparent"; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C9.8 2 8 3.8 8 6s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z"/><path d="M12 14c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z"/><path d="M2 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z"/><path d="M14 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z"/></svg>
                        <span>Dispatch</span>
                      </button>
                      <button onClick={()=>{setPg("mobile");if(window.innerWidth<768)setSbO("closed");}} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",background:pg==="mobile"?c.sf:"transparent",color:pg==="mobile"?c.tx:c.so,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"background .15s"}} onMouseEnter={e=>{ if(pg!=="mobile") e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(pg!=="mobile") e.currentTarget.style.background="transparent"; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        <span>Mobile</span>
                      </button>
                    </div>
                  </div>

                  {/* Session list - only show on Chat page */}
                  {pg==="chat"&&(
                  <div style={{flex:1,overflowY:"auto",padding:"8px 8px"}}>
                    {conferenceMode?(
                      /* Conference mode: show conference sessions */
                      confSessionsList.length===0?(
                        <div style={{padding:"20px 8px",textAlign:"center",fontSize:11,color:c.fa}}>No conference chats yet</div>
                      ):confSessionsList.filter(s=>{
                        if(!searchQuery.trim()) return true;
                        return (s.title||'Team Conference').toLowerCase().includes(searchQuery.toLowerCase());
                      }).map(s=>{
                        const isActive=confSessionRef.current===s.id;
                        const title=s.title||'Team Conference';
                        const when=new Date(s.updated_at);
                        const now=new Date();
                        const diff=now-when;
                        const timeLabel=diff<60000?"Just now":diff<3600000?Math.floor(diff/60000)+"m ago":diff<86400000?Math.floor(diff/3600000)+"h ago":diff<604800000?Math.floor(diff/86400000)+"d ago":when.toLocaleDateString([],{month:"short",day:"numeric"});
                        return(
                          <div key={s.id} style={{position:"relative",marginBottom:2}}>
                            <button
                              onClick={()=>{confSessionRef.current=s.id;/* reload this conference */setConfMessages([]);/* trigger re-load by toggling conferenceMode */setConferenceMode(false);setTimeout(()=>setConferenceMode(true),50);}}
                              style={{width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:10,border:"none",cursor:"pointer",background:isActive?c.ac+"15":"transparent",transition:"background .15s"}}
                              onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=c.hv;}}
                              onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="transparent";}}
                            >
                              <div style={{fontSize:15,fontWeight:isActive?600:500,color:isActive?c.ac:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
                              <div style={{fontSize:10,color:c.fa,marginTop:2}}>{timeLabel}</div>
                            </button>
                          </div>
                        );
                      })
                    ):(
                    /* Individual mode: show agent sessions */
                    sessions.filter(s=>{
                      if(!searchQuery.trim()) return true;
                      const title = s.title || "New conversation";
                      return title.toLowerCase().includes(searchQuery.toLowerCase());
                    }).length===0?(
                      <div style={{padding:"20px 8px",textAlign:"center",fontSize:11,color:c.fa}}>{searchQuery.trim()?"No chats found":"No chats yet"}</div>
                    ):sessions.filter(s=>{
                      if(!searchQuery.trim()) return true;
                      const title = s.title || "New conversation";
                      return title.toLowerCase().includes(searchQuery.toLowerCase());
                    }).map(s=>{
                      const isActive = currentSessionId===s.id;
                      const title = s.title || "New conversation";
                      const when = new Date(s.updated_at);
                      const now = new Date();
                      const diff = now - when;
                      const timeLabel = diff < 60000 ? "Just now"
                        : diff < 3600000 ? Math.floor(diff/60000)+"m ago"
                        : diff < 86400000 ? Math.floor(diff/3600000)+"h ago"
                        : diff < 604800000 ? Math.floor(diff/86400000)+"d ago"
                        : when.toLocaleDateString([],{month:"short",day:"numeric"});
                      const menuOpen = openChatMenu === s.id;
                      return(
                        <div key={s.id} style={{position:"relative",marginBottom:2}} className="session-row">
                          <button
                            onClick={()=>{loadSession(s.id);setNew(false);}}
                            style={{width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:10,border:"none",cursor:"pointer",background:isActive?c.ac+"15":"transparent",transition:"background .15s"}}
                            onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background=c.hv; }}
                            onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background="transparent"; }}
                          >
                            <div style={{fontSize:15,fontWeight:isActive?600:500,color:isActive?c.ac:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:30}}>{title}</div>
                            <div style={{fontSize:10,color:c.fa,marginTop:2,display:"flex",gap:6}}>
                              <span>{timeLabel}</span>
                              {s.message_count>0&&<span>· {Math.floor(s.message_count/2)} msg{s.message_count>2?"s":""}</span>}
                            </div>
                          </button>
                          <button
                            onClick={e=>{e.stopPropagation();setOpenChatMenu(menuOpen ? null : s.id);}}
                            title="Options"
                            style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",width:28,height:28,borderRadius:6,border:"none",background:menuOpen?c.sf:"transparent",cursor:"pointer",fontSize:20,color:c.tx,opacity:menuOpen?1:0.5,transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center"}}
                            onMouseEnter={e=>{e.currentTarget.style.opacity="1";if(!menuOpen)e.currentTarget.style.background=c.sf;}}
                            onMouseLeave={e=>{if(!menuOpen){e.currentTarget.style.opacity="0.5";e.currentTarget.style.background="transparent";}}}
                          >⋮</button>
                          {menuOpen&&(
                            <>
                              <div onClick={()=>setOpenChatMenu(null)} style={{position:"fixed",inset:0,zIndex:999}}/>
                              <div style={{position:"absolute",right:8,top:"calc(50% + 20px)",background:c.cd,border:"1px solid "+c.ln,borderRadius:8,padding:4,zIndex:1000,minWidth:140,boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>
                                <button onClick={()=>{setOpenChatMenu(null);setOauthToast({type:'success',msg:'⭐ Star feature coming soon'}); setTimeout(()=>setOauthToast(null),3000);}} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:c.tx,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.tx} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                  Star
                                </button>
                                <button onClick={()=>{setOpenChatMenu(null);setOauthToast({type:'success',msg:'✏️ Rename feature coming soon'}); setTimeout(()=>setOauthToast(null),3000);}} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:c.tx,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.tx} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Rename
                                </button>
                                <button onClick={async()=>{
                                  setOpenChatMenu(null);
                                  if(projects.length===0){
                                    setOauthToast({type:'error',msg:'No projects yet — create one first'}); setTimeout(()=>setOauthToast(null),4000);
                                    return;
                                  }
                                  // Show project selection
                                  const projList=projects.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
                                  const choice=prompt(`Add this chat to which project?\n\n${projList}\n\nEnter number (1-${projects.length}):`);
                                  if(!choice) return;
                                  const idx=parseInt(choice)-1;
                                  if(idx<0||idx>=projects.length){setOauthToast({type:'error',msg:'Invalid choice'}); setTimeout(()=>setOauthToast(null),3000);return;}
                                  const selectedProj=projects[idx];
                                  try{
                                    const res=await fetch(`/api/projects/${selectedProj.id}/conversations`, await withAuth({
                                      method:'PATCH',
                                      headers:{'Content-Type':'application/json'},
                                      body:JSON.stringify({action:'add',sessionIds:[s.id]})
                                    });
                                    const data=await res.json();
                                    if(data.success){
                                      setOauthToast({type:'success',msg:`Added to "${selectedProj.name}"`}); setTimeout(()=>setOauthToast(null),3000);
                                      fetchSessions(); // Refresh to show project assignment
                                    }else{
                                      setOauthToast({type:'error',msg:'Failed: '+(data.error||'Unknown error')}); setTimeout(()=>setOauthToast(null),4000);
                                    }
                                  }catch(err){
                                    setOauthToast({type:'error',msg:'Error: '+err.message}); setTimeout(()=>setOauthToast(null),4000);
                                  }
                                }} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:c.tx,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.tx} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                  Add to project
                                </button>
                                <button onClick={()=>{setOpenChatMenu(null);if(confirm('Delete this conversation?'))deleteSession(s.id);}} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:"#ef4444",display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                    )}
                  </div>
                  )}

                  {/* Bottom — Kimberly expandable menu */}
                  <div style={{padding:"10px 14px",borderTop:"1px solid "+c.ln,flexShrink:0,position:"relative"}}>
                    {/* Autopilot status */}
                    <div style={{padding:"6px 10px",borderRadius:8,background:c.sf,border:"1px solid "+c.ln,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:c.gr,animation:"pulse 1.5s ease infinite",flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:600,color:c.gr}}>Autopilot</span>
                      <span style={{fontSize:11,color:c.so,marginLeft:"auto"}}>✓ All OK</span>
                    </div>
                    <button onClick={()=>setUmO(!umO)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",background:umO?c.sf:"transparent",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background=umO?c.sf:"transparent"}>
                      <div style={{width:30,height:30,borderRadius:8,background:userImg?"transparent":"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden",pointerEvents:"none"}}>
                        {userImg?<img src={userImg} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:meInitial}
                      </div>
                      <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:13,fontWeight:600,color:c.tx}}>{meDisplayName}</div><div style={{fontSize:11,color:c.so,textTransform:"capitalize"}}>{meRole}</div></div>
                      <span style={{fontSize:12,color:c.so,transform:umO?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s"}}>▾</span>
                    </button>
                    {umO&&(
                      <div style={{position:"absolute",bottom:"100%",left:14,right:14,background:c.cd,border:"1px solid "+c.ln,borderRadius:12,boxShadow:"0 -8px 24px rgba(0,0,0,.15)",overflow:"hidden",marginBottom:4,zIndex:70}}>
                        {[
                          {ic:"🏢",l:"Business Profile",fn:()=>{setPg("business");setUmO(false);}},
                          {ic:"💳",l:"Billing",fn:()=>{setPg("billing");setUmO(false);}},
                          {ic:"🧠",l:"Skills",fn:()=>{setPg("skills");setUmO(false);}},
                          {ic:"⚙️",l:"Settings",fn:()=>{setPg("settings");setUmO(false);}},
                          {ic:"🔧",l:"Developer Mode",fn:()=>setUmO(false)},
                          {ic:dark?"☀️":"🌙",l:dark?"Light Mode":"Dark Mode",fn:()=>{setDark(!dark);setUmO(false);}},
                          {ic:"🚪",l:"Log out",fn:async()=>{setUmO(false);await supabase.auth.signOut();}},
                        ].map((item,i,arr)=>(
                          <button key={i} onClick={item.fn} style={{width:"100%",textAlign:"left",padding:"11px 14px",border:"none",cursor:"pointer",background:"transparent",fontSize:13,color:i===arr.length-1?"#ef4444":c.tx,display:"flex",alignItems:"center",gap:10,borderBottom:i<arr.length-1?"1px solid "+c.ln+"60":"none"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <span style={{fontSize:15}}>{item.ic}</span>{item.l}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <div style={{flex:1,minWidth:0,height:"calc(100vh - 52px)",overflow:pg==="chat"?"hidden":"auto"}}>

          {/* ══ CHAT ══ */}
          {pg==="chat"&&conferenceMode&&(
            <div style={{height:"calc(100vh - 52px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {/* Conference header — shows all agents */}
              <div style={{padding:mob?"8px 12px":"10px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid "+c.ln,background:c.cd,flexShrink:0}}>
                <div style={{display:"flex",gap:-4}}>
                  {agents.map((a,i)=><div key={a.id} style={{marginLeft:i>0?-8:0,zIndex:agents.length-i}}><Face sz={mob?28:32} agent={{nm:a.name,img:a.avatar_url,grad:c.gradient}}/></div>)}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:mob?14:15,fontWeight:700,color:c.tx}}>Team Conference</div>
                  <div style={{fontSize:11,color:c.so}}>{agents.map(a=>a.name.split(' ')[0]).join(', ')} + You</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:c.gr,animation:"pulse 1.5s ease infinite"}}/>
                  <span style={{fontSize:11,color:c.gr}}>{agents.length} online</span>
                </div>
              </div>

              {/* Conference messages */}
              <div style={{flex:1,overflowY:"auto",padding:mob?"12px":"16px 20px",display:"flex",flexDirection:"column",gap:8}}>
                {confMessages.length===0?(
                  <div style={{textAlign:"center",margin:"auto",padding:"40px 20px"}}>
                    <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:16}}>
                      {agents.map(a=><Face key={a.id} sz={40} agent={{nm:a.name,img:a.avatar_url,grad:c.gradient}}/>)}
                    </div>
                    <div style={{fontSize:18,fontWeight:700,color:c.tx,marginBottom:6}}>Team Conference</div>
                    <div style={{fontSize:13,color:c.so,lineHeight:1.6,maxWidth:400,margin:"0 auto"}}>
                      Message all {agents.length} Bloomie{agents.length>1?"s":""} at once. They'll respond in order and can see each other's replies — like a group chat.
                    </div>
                  </div>
                ):confMessages.map(msg=>(
                  <div key={msg.id}>
                    {msg.from==='user'?(
                      <div style={{display:'flex',justifyContent:'flex-end',padding:'2px 0'}}>
                        <div style={{maxWidth:'75%',padding:'10px 16px',borderRadius:'18px 18px 4px 18px',background:c.gradient,color:'#fff',fontSize:14,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                          {msg.text}
                          <div style={{fontSize:10,color:'rgba(255,255,255,0.6)',marginTop:4,textAlign:'right'}}>{msg.time}</div>
                        </div>
                      </div>
                    ):(
                      <div style={{display:'flex',gap:8,alignItems:'flex-start',padding:'2px 0'}}>
                        <Face sz={28} agent={{nm:msg.fromAgent,img:msg.avatar,grad:c.gradient}}/>
                        <div style={{maxWidth:'70%'}}>
                          <div style={{fontSize:11,fontWeight:700,color:c.ac,marginBottom:2}}>{msg.fromAgent}</div>
                          <div style={{padding:'10px 14px',borderRadius:'4px 18px 18px 18px',background:c.cd,border:'1px solid '+c.ln,color:c.tx,fontSize:14,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                            {msg.text}
                            {msg.hasArtifact&&<div style={{marginTop:6,padding:'4px 8px',borderRadius:6,background:c.sf,border:'1px solid '+c.ln,fontSize:11,color:c.ac,fontWeight:600}}>📎 File created — check {msg.fromAgent.split(' ')[0]}'s Files tab</div>}
                            <div style={{fontSize:10,color:c.fa,marginTop:4}}>{msg.time}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {confSending&&<div style={{display:'flex',gap:8,alignItems:'center',padding:'4px 0'}}><div style={{fontSize:12,color:c.so,fontStyle:'italic'}}>Team is responding...</div></div>}
                <div ref={confEndRef}/>
              </div>

              {/* Conference input */}
              <div style={{padding:mob?"8px 12px":"10px 16px",borderTop:"1px solid "+c.ln,background:c.cd,flexShrink:0}}>
                <div style={{display:"flex",alignItems:"flex-end",gap:8,padding:"10px 14px",borderRadius:20,border:"1.5px solid "+c.ln,background:c.inp}}>
                  <textarea value={confInput} onChange={e=>setConfInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendConfMessage();}}}
                    placeholder="Message the team..." rows={1}
                    style={{flex:1,border:"none",background:"transparent",color:c.tx,fontSize:mob?15:16,fontFamily:"inherit",resize:"none",maxHeight:120,lineHeight:1.4,outline:"none",padding:0}}/>
                  <button onClick={sendConfMessage} disabled={!confInput.trim()||confSending}
                    style={{width:34,height:34,borderRadius:17,border:"none",background:(!confInput.trim()||confSending)?"transparent":c.gradient,display:"flex",alignItems:"center",justifyContent:"center",cursor:(!confInput.trim()||confSending)?"default":"pointer",flexShrink:0}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          )}
          {pg==="chat"&&!conferenceMode&&(
            <div style={{height:"calc(100vh - 52px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {!isNew&&(
                <div style={{padding:mob?"8px 12px":"10px 16px",display:"flex",alignItems:"center",gap:mob?8:10,borderBottom:"1px solid "+c.ln,background:c.cd,flexShrink:0}}>
                  <Face sz={mob?28:32} agent={agent} onClick={()=>{loadProfile();setProfileOpen(true);}} style={{cursor:'pointer'}}/>
                  <div style={{flex:1}}>
                    <div onClick={()=>{loadProfile();setProfileOpen(true);}} style={{fontSize:mob?14:15,fontWeight:700,color:c.tx,cursor:'pointer'}}>{agent.nm}</div>
                    <div style={{fontSize:11,color:connected?c.gr:c.fa,display:"flex",alignItems:"center",gap:5}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:connected?c.gr:c.fa,animation:connected?"pulse 1.5s ease infinite":"none"}}/>
                      {connected?"Online":"Offline"}
                    </div>
                  </div>
                  {!mob&&scrM==="hidden"&&(
                    <button onClick={()=>setScrM("docked")} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:600,color:c.so,flexShrink:0,transition:"background .15s,color .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=c.sf;e.currentTarget.style.color=c.tx;}} onMouseLeave={e=>{e.currentTarget.style.background=c.cd;e.currentTarget.style.color=c.so;}}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3l-5 5 5 5"/></svg>
                      Show Browser
                    </button>
                  )}
                </div>
              )}

              {isNew?(
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:mob?"20px 16px":"40px 20px"}}>
                  <div style={{width:"100%",maxWidth:620,textAlign:"center"}}>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:8}}>
                      <div style={{animation:"bloomieWiggle 3s ease-in-out infinite"}}><Face sz={mob?64:80} agent={agent}/></div>
                    </div>
                    <h2 style={{fontSize:mob?22:28,fontWeight:700,color:c.tx,marginTop:18,marginBottom:6}}>{currentAgent ? `Chat with ${currentAgent.name.split(" ")[0]}` : "Loading..."}</h2>
                    <p style={{fontSize:mob?13:15,color:c.so,marginBottom:28}}>{currentAgent ? `Give ${aFN} tasks, check their work, or ask what's going on` : ""}</p>
                    <div style={{position:"relative",marginBottom:20}}>
                      <div style={{display:"flex",alignItems:"flex-end",gap:8,padding:mob?"12px":"14px 16px",borderRadius:20,border:"1.5px solid "+(vcRec?c.ac:c.ln),background:c.inp,transition:"border-color .2s"}}>
                        <div ref={plusMenuRef} style={{position:"relative",flexShrink:0,marginBottom:2}}>
                          <button onClick={()=>setShowPlusMenu(p=>!p)} title="Add" style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:showPlusMenu?c.sf:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"background .15s"}}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={showPlusMenu?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          {showPlusMenu&&(
                            <>
                              <div onClick={()=>setShowPlusMenu(false)} style={{position:"fixed",inset:0,zIndex:998}}/>
                              <div style={{position:"absolute",bottom:46,left:0,zIndex:999,width:260,borderRadius:14,border:"1px solid "+c.ln,background:c.cd,boxShadow:"0 8px 32px rgba(0,0,0,0.25)",overflow:"hidden",padding:"6px 0"}}>
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Files</div>
                                {[
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>, label:"Add files or photos", action:()=>{fRef.current?.click();setShowPlusMenu(false);}},
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, label:"Take a screenshot", action:takeScreenshot},
                                ].map((item,i)=>(
                                  <button key={i} onClick={item.action} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",color:c.tx,fontSize:13,textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <span style={{color:c.so,flexShrink:0}}>{item.icon}</span>{item.label}
                                  </button>
                                ))}
                                <div style={{height:1,background:c.ln,margin:"4px 0"}}/>
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Connectors</div>
                                <button onClick={()=>{setPg("customize");setShowPlusMenu(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,textAlign:"left",fontWeight:700,transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <span style={{background:"linear-gradient(135deg,#F4A261,#E76F8B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",fontWeight:700,fontSize:13}}>Manage connectors →</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <textarea value={tx} onChange={e=>setTx(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}} placeholder={vcRec?"Listening…":"Ask anything..."} rows={1} style={{flex:1,padding:"10px 0",border:"none",fontSize:15,fontFamily:"inherit",background:"transparent",color:c.tx,resize:"none",lineHeight:1.4,maxHeight:120,overflowY:"auto",outline:"none"}}/>
                        <button onClick={toggleVoice} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:vcRec?c.ac+"18":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative",marginBottom:2}}>
                          {vcRec&&<span style={{position:"absolute",inset:-4,borderRadius:14,border:"2px solid "+c.ac,animation:"pulse 1.2s ease infinite",opacity:0.4}}/>}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={vcRec?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>
                        </button>
                        {loading?(
                          <button onClick={stopSarah} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:"rgba(234,67,53,0.15)",color:"#ea4335",fontSize:14,fontWeight:700,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}} title={"Stop "+aFN}>■</button>
                        ):(
                          <button onClick={doSend} disabled={!tx.trim()} style={{width:36,height:36,borderRadius:10,border:"none",cursor:tx.trim()?"pointer":"not-allowed",background:tx.trim()?"linear-gradient(135deg,#F4A261,#E76F8B)":"transparent",color:tx.trim()?"#fff":c.fa,fontSize:16,fontWeight:700,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}}>➜</button>
                        )}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                      {["What can you help me with?","Check my BLOOM CRM contacts","Show system health","What tasks are pending?"].map((s,i)=>(
                        <button key={i} onClick={()=>setTx(s)} style={{padding:"8px 16px",borderRadius:20,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,color:c.so,transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ):(
                <>
                  <div style={{flex:1,minHeight:0,display:"flex",minWidth:0}}>
                    <div style={{flex:1,minWidth:0,overflowY:"auto",overflowX:"hidden",background:c.bg,padding:mob?"14px 12px":"18px 24px",transition:"padding .25s ease"}}>
                      {messages.map((m)=>{
                        const cards=m.b?parseMessageCards(m.t):[];
                        const displayText=m.b?cleanMessageText(m.t):m.t;
                        const clarifyData=m.clarification||(m.b?parseClarification(m.t):null);
                        return (
                        <div key={m.id} style={{display:"flex",justifyContent:m.b?"flex-start":"flex-end",marginBottom:16,flexDirection:"column",alignItems:m.b?"flex-start":"flex-end"}}>
                          <div style={{display:"flex",justifyContent:m.b?"flex-start":"flex-end",width:"100%"}}>
                            {m.b&&<div style={{marginRight:8,marginTop:2,flexShrink:0}}><Face sz={mob?26:28} agent={agent}/></div>}
                            <div style={{maxWidth:mob?"88%":"75%",padding:"10px 14px",fontSize:mob?13:14,lineHeight:1.6,color:m.b?c.tx:"#fff",borderRadius:m.b?"4px 16px 16px 16px":"16px 4px 16px 16px",background:m.b?c.cd:"linear-gradient(135deg,#F4A261,#E76F8B)",border:m.b?"1px solid "+c.ln:"none",wordBreak:"break-word",overflowWrap:"anywhere",boxShadow:m.b?"none":"0 2px 8px rgba(244,162,97,0.25)"}}>
                              {/* File previews */}
                              {m.files&&m.files.length>0&&(
                                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:m.t?8:4}}>
                                  {m.files.map((f,fi)=>(
                                    f.type?.startsWith("image/") && f.dataUrl
                                      ? <img key={fi} src={f.dataUrl} alt={f.name} onClick={()=>setChatLightbox({src:f.dataUrl,alt:f.name})} style={{maxWidth:220,maxHeight:160,borderRadius:8,objectFit:"cover",border:"1px solid rgba(255,255,255,0.15)",cursor:"zoom-in"}}/>
                                      : <div key={fi} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.15)"}}>
                                          <span style={{fontSize:14}}>{f.type?.startsWith('image/') ? '🖼' : '📎'}</span>
                                          <span style={{fontSize:11,fontWeight:600,color:m.b?c.tx:'#fff',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                                        </div>
                                  ))}
                                </div>
                              )}
                              {displayText&&(m.b?(
                                <div className="sarah-msg" style={{fontSize:15,lineHeight:1.65,color:c.tx}}>
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      h1:({children})=><div style={{fontSize:17,fontWeight:700,margin:"18px 0 8px",color:c.tx}}>{children}</div>,
                                      h2:({children})=><div style={{fontSize:15,fontWeight:700,margin:"16px 0 6px",color:c.tx}}>{children}</div>,
                                      h3:({children})=><div style={{fontSize:14,fontWeight:700,margin:"14px 0 6px",color:c.tx}}>{children}</div>,
                                      p:({children})=><div style={{margin:"8px 0"}}>{children}</div>,
                                      strong:({children})=><strong>{children}</strong>,
                                      em:({children})=><em>{children}</em>,
                                      ul:({children})=><div style={{margin:"6px 0",paddingLeft:4}}>{children}</div>,
                                      ol:({children})=><div style={{margin:"6px 0",paddingLeft:4}}>{children}</div>,
                                      li:({children,index,ordered})=><div style={{display:"flex",gap:8,margin:"3px 0"}}><span style={{color:c.ac,flexShrink:0}}>{ordered?`${(index||0)+1}.`:"•"}</span><span>{children}</span></div>,
                                      img:({src,alt})=><img src={src} alt={alt} onClick={()=>setChatLightbox({src,alt:alt||''})} style={{maxWidth:"100%",height:"auto",borderRadius:8,margin:"10px 0",display:"block",cursor:"zoom-in"}}/>,
                                      code:({inline,className,children})=>{
                                        if(inline) return <code style={{background:c.bg,border:"1px solid "+c.ln,padding:"1px 6px",borderRadius:4,fontSize:"12.5px",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}}>{children}</code>;
                                        return <pre style={{background:c.bg,border:"1px solid "+c.ln,borderRadius:8,padding:"12px 16px",margin:"10px 0",overflowX:"auto",fontSize:"12.5px",lineHeight:1.5,fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}}><code>{children}</code></pre>;
                                      },
                                      hr:()=><hr style={{border:"none",borderTop:"1px solid "+c.ln,margin:"16px 0"}}/>,
                                      a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer" style={{color:c.ac,textDecoration:"underline"}}>{children}</a>,
                                      table:({children})=><div style={{overflowX:"auto",margin:"10px 0"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}>{children}</table></div>,
                                      th:({children})=><th style={{border:"1px solid "+c.ln,padding:"6px 10px",fontWeight:600,textAlign:"left",background:c.sf}}>{children}</th>,
                                      td:({children})=><td style={{border:"1px solid "+c.ln,padding:"6px 10px"}}>{children}</td>,
                                      blockquote:({children})=><div style={{borderLeft:"3px solid "+c.ac,paddingLeft:12,margin:"10px 0",color:c.so}}>{children}</div>,
                                    }}
                                  >{displayText}</ReactMarkdown>
                                </div>
                              ):(
                                <div style={{fontSize:14,lineHeight:1.65}}>{displayText}</div>
                              ))}
                              <div style={{fontSize:10,opacity:0.45,marginTop:5,textAlign:m.b?"left":"right"}}>{m.tm}</div>
                              {/* Skill badge — shows which skill Sarah used for this response */}
                              {m.b&&m.skills&&m.skills.length>0&&(
                                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                                  {m.skills.map((sk,si)=>(
                                    <div key={si} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:20,background:"rgba(168,85,247,0.1)",border:"1px solid rgba(168,85,247,0.25)",fontSize:10,fontWeight:600,color:"#a855f7",letterSpacing:"0.02em"}}>
                                      <span style={{fontSize:9}}>⚡</span>
                                      {sk.replace(/-/g," ")}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Clarification card — renders bloom_clarify as interactive buttons */}
                              {m.b&&clarifyData&&(
                                <ClarificationCardInline clarification={clarifyData} onSelect={(opt)=>send(`${opt.label}: ${opt.description||''}`)} c={c} disabled={loading||!!messages.find(mm=>mm.id>m.id&&!mm.b)}/>
                              )}
                            </div>
                          </div>
                          {/* Inline action cards — Sarah's messages only */}
                          {cards.length>0&&(
                            <div style={{marginLeft:m.b?(mob?34:36):0,marginRight:m.b?0:0,maxWidth:mob?"85%":"72%"}}>
                              {cards.map((cd2,ci)=>cd2.type==="task"
                                ? <TaskCard key={ci} name={cd2.name} c={c}/>
                                : cd2.type==="artifact"
                                ? <ArtifactCard key={ci} name={cd2.name} c={c}
                                    onOpenSide={(art)=>{setActiveArtifact(art);setRightTab("artifact");}}
                                    mob={mob}
                                  />
                                : <EmailCard key={ci} subject={cd2.subject} c={c} onReview={()=>{setOauthToast({type:'success',msg:'📧 Email review panel coming soon'}); setTimeout(()=>setOauthToast(null),3000);}}/>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                      {loading&&(
                        <div style={{display:"flex",justifyContent:"flex-start",marginBottom:14,alignItems:"flex-end",gap:8}}>
                          <div style={{marginRight:0,marginTop:2}}><Face sz={28} agent={agent}/></div>
                          <div style={{flex:1}}>
                            <div style={{padding:"14px 18px",borderRadius:"6px 18px 18px 18px",background:c.cd,border:"1px solid "+c.ln,minWidth:160}}>
                              {workingStatus==="Thinking..."?(
                                /* Casual chat — gentle thinking indicator */
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:"50%",background:c.ac,animation:`pulse 1.2s ease ${i*0.2}s infinite`}}/>)}
                                  <span style={{fontSize:12,color:c.so,marginLeft:4}}>Thinking...</span>
                                </div>
                              ):(
                                /* Work task — full working status */
                                <>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                                    <span style={{width:8,height:8,borderRadius:"50%",background:c.ac,animation:"pulse 1.2s ease infinite"}}/>
                                    <span style={{fontSize:13,fontWeight:600,color:c.tx}}>{aFN} is working</span>
                                  </div>
                                  <div style={{fontSize:11,color:c.so,lineHeight:1.5}}>
                                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                                      Loading...
                                      <span>{workingStatus||"Processing..."}</span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <button onClick={stopSarah} title={"Stop "+aFN} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:"#ea4335",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(234,67,53,0.1)"} onMouseLeave={e=>e.currentTarget.style.background=c.cd}>■</button>
                        </div>
                      )}
                      <div ref={btm}/>
                    </div>
                    {!mob&&scrM!=="hidden"&&(
                      <ResizablePanel c={c} defaultWidth={480} minWidth={280} maxWidth={800}>
                        <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
                          {/* ── Right panel tabs ── */}
                          <div style={{display:"flex",borderBottom:"1px solid "+c.ln,background:c.sf,flexShrink:0}}>
                            <button onClick={()=>setRightTab("browser")} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"none",borderBottom:rightTab==="browser"?"2px solid "+c.ac:"2px solid transparent",background:"transparent",color:rightTab==="browser"?c.tx:c.so,cursor:"pointer",letterSpacing:"0.5px"}}>Browser</button>
                            <button onClick={()=>setRightTab("artifact")} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"none",borderBottom:rightTab==="artifact"?"2px solid "+c.ac:"2px solid transparent",background:"transparent",color:rightTab==="artifact"?c.tx:c.so,cursor:"pointer",letterSpacing:"0.5px",position:"relative"}}>
                              Files
                              {activeArtifact&&<span style={{position:"absolute",top:4,right:"20%",width:6,height:6,borderRadius:"50%",background:c.ac}}/>}
                            </button>
                            <button onClick={()=>setScrM("hidden")} title="Collapse panel" style={{width:36,padding:"8px 0",fontSize:13,border:"none",borderBottom:"2px solid transparent",background:"transparent",color:c.so,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="2"><path d="M6 3l5 5-5 5"/></svg>
                            </button>
                          </div>

                          {/* ── Browser tab ── */}
                          {rightTab==="browser"&&(
                            <>
                              <Screen c={c} mob={false} mode="docked" setMode={setScrM} aFN={aFN}/>
                              <div style={{borderTop:"1px solid "+c.ln,background:c.cd,flexShrink:0}}>
                                <div style={{padding:"10px 16px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:8}}>
                                  <span style={{width:8,height:8,borderRadius:"50%",background:c.ac,animation:"pulse 1.5s ease infinite"}}/>
                                  <span style={{fontSize:12,fontWeight:700,color:c.tx}}>Active Tasks</span>
                                </div>
                                <ActiveTaskTracker c={c} sessionId={currentSessionId}/>
                              </div>
                            </>
                          )}

                          {/* ── Files tab ── */}
                          {rightTab==="artifact"&&(
                            activeArtifact?(
                              <ArtifactPane
                                art={activeArtifact}
                                c={c}
                                onClose={()=>setActiveArtifact(null)}
                                onRequestChanges={(name)=>{setRightTab("browser");setTx("I want to make changes to "+name);}}
                              />
                            ):(
                              sid.current ? (
                                <SessionFilesPanel c={c} sessionId={sid.current} setActiveArtifact={setActiveArtifact} aFN={aFN}/>
                              ) : (
                                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:c.so,fontSize:13}}>
                                  No active conversation
                                </div>
                              )
                            )
                          )}
                        </div>
                      </ResizablePanel>
                    )}
                  </div>
                  <div style={{flexShrink:0,padding:mob?"8px 12px 12px":"10px 20px 14px",background:c.cd,borderTop:"1px solid "+c.ln}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,paddingBottom:6}}>
                        <span style={{width:5,height:5,borderRadius:"50%",background:connected?c.gr:c.fa}}/>
                        <span style={{fontSize:11,color:c.fa}}>{connected?`Connected to ${aFN}'s API`:"Reconnecting…"}</span>
                      </div>
                      {/* Pending files preview */}
                      {pendingFiles.length>0&&(
                        <div style={{display:"flex",gap:6,padding:"8px 0",flexWrap:"wrap"}}>
                          {pendingFiles.map((pf,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,background:c.sf,border:"1px solid "+c.ln,fontSize:12,color:c.tx}}>
                              {pf.preview?<img src={pf.preview} style={{width:28,height:28,borderRadius:6,objectFit:"cover"}}/>:<span></span>}
                              <span style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pf.name}</span>
                              <button onClick={()=>setPendingFiles(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:c.fa,fontSize:14,padding:0,lineHeight:1}}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* ── Input pill — + and mic inside like Claude ── */}
                      <div style={{display:"flex",alignItems:"flex-end",gap:6,padding:"10px 12px 10px 8px",borderRadius:20,border:"1.5px solid "+(vcRec?c.ac:c.ln),background:c.inp,transition:"border-color .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.1)"}}>
                        {/* ── Claude-style + menu ── */}
                        <div ref={plusMenuRef} style={{position:"relative",flexShrink:0,marginBottom:2}}>
                          <button onClick={()=>setShowPlusMenu(p=>!p)} title="Add" style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:showPlusMenu?c.sf:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"background .15s"}}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={showPlusMenu?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          {showPlusMenu&&(
                            <>
                              {/* backdrop */}
                              <div onClick={()=>setShowPlusMenu(false)} style={{position:"fixed",inset:0,zIndex:998}}/>
                              {/* menu panel */}
                              <div style={{position:"absolute",bottom:46,left:0,zIndex:999,width:260,borderRadius:14,border:"1px solid "+c.ln,background:c.cd,boxShadow:"0 8px 32px rgba(0,0,0,0.25)",overflow:"hidden",padding:"6px 0"}}>
                                {/* Files section */}
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Files</div>
                                {[
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>, label:"Add files or photos", action:()=>{fRef.current?.click();setShowPlusMenu(false);}},
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, label:"Take a screenshot", action:takeScreenshot},
                                ].map((item,i)=>(
                                  <button key={i} onClick={item.action} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",color:c.tx,fontSize:13,textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <span style={{color:c.so,flexShrink:0}}>{item.icon}</span>{item.label}
                                  </button>
                                ))}
                                <div style={{height:1,background:c.ln,margin:"4px 0"}}/>
                                {/* Connectors section */}
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Connectors</div>
                                {/* Active connectors — loaded dynamically, shown as toggles */}
                                {[
                                  {slug:"gohighlevel",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label:"BLOOM CRM"},
                                  {slug:"google-calendar",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label:"Google Calendar"},
                                  {slug:"google-drive",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>, label:"Google Drive"},
                                  {slug:"gmail",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label:"Gmail"},
                                  {slug:"canva",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>, label:"Canva"},
                                ].filter(conn=>activeConnectors[conn.slug]||conn.slug==="gohighlevel").map((conn,i)=>(
                                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <div style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:c.tx}}>
                                      <span style={{color:activeConnectors[conn.slug]?"#F4A261":c.so,flexShrink:0}}>{conn.icon}</span>{conn.label}
                                    </div>
                                    <div style={{width:32,height:18,borderRadius:9,background:activeConnectors[conn.slug]?"linear-gradient(135deg,#F4A261,#E76F8B)":c.ln,position:"relative",transition:"all .2s",cursor:"pointer",flexShrink:0}}>
                                      <div style={{position:"absolute",top:2,left:activeConnectors[conn.slug]?14:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
                                    </div>
                                  </div>
                                ))}
                                <button onClick={()=>{setPg("customize");setShowPlusMenu(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,textAlign:"left",fontWeight:700,transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="url(#mgGrad)" strokeWidth="2" strokeLinecap="round"><defs><linearGradient id="mgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F4A261"/><stop offset="100%" stopColor="#E76F8B"/></linearGradient></defs><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                                  <span style={{background:"linear-gradient(135deg,#F4A261,#E76F8B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Manage connectors</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <textarea value={tx} onChange={e=>{setTx(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,200)+"px";}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}} placeholder={vcRec?"Listening…":mob?"Message…":`Tell ${aFN} what you need…`} rows={2} style={{flex:1,padding:"6px 4px",border:"none",fontSize:14,fontFamily:"inherit",background:"transparent",color:c.tx,resize:"none",lineHeight:1.6,minHeight:48,maxHeight:200,overflowY:"auto",outline:"none"}}/>
                        <button onClick={toggleVoice} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:vcRec?c.ac+"22":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative",marginBottom:2}}>
                          {vcRec&&<span style={{position:"absolute",inset:-3,borderRadius:12,border:"2px solid "+c.ac,animation:"pulse 1.2s ease infinite",opacity:0.4}}/>}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={vcRec?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>
                        </button>
                        {loading?(
                          <button onClick={stopSarah} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:"rgba(234,67,53,0.15)",color:"#ea4335",fontSize:13,fontWeight:700,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}} title="Stop">■</button>
                        ):(
                          <button onClick={doSend} disabled={!tx.trim()&&pendingFiles.length===0} style={{width:36,height:36,borderRadius:10,border:"none",cursor:(tx.trim()||pendingFiles.length>0)?"pointer":"not-allowed",background:(tx.trim()||pendingFiles.length>0)?"linear-gradient(135deg,#F4A261,#E76F8B)":"transparent",color:(tx.trim()||pendingFiles.length>0)?"#fff":c.fa,fontSize:16,fontWeight:700,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                        )}
                      </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ MONITOR — Sarah's functional cards, Jaden's visual style ══ */}
          {pg==="monitor"&&(
            <div style={{padding:mob?"16px 12px 40px":"20px 20px 40px"}}>
              <div style={{marginBottom:20,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div>
                  <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>Operations Monitor</h1>
                  <p style={{fontSize:13,color:c.so}}>Real-time visibility into {aFN}'s autonomous work</p>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <a href={contactsUrl} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"1px solid "+c.ln,background:c.cd,textDecoration:"none",color:c.tx,fontSize:12,fontWeight:600}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                    Verify Contacts
                  </a>
                  <a href={crmUrl} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",textDecoration:"none",color:"#fff",fontSize:12,fontWeight:600}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Open BLOOM CRM
                  </a>
                </div>
              </div>
              {/* Task Run Timeline — full width overview */}
              <div style={{marginBottom:16}}>
                <TaskRunTimeline c={c} agentId={currentAgentId}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16,marginBottom:16}}>
                <SystemHealth c={c} sse={sse}/>
                <TrustGate c={c} sse={sse}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16,marginBottom:16}}>
                <AgenticExecutions c={c} sse={sse}/>
                <SubAgents c={c} sse={sse}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16,marginBottom:16}}>
                <ToolPerformance c={c} sse={sse}/>
                <ContextAnalytics c={c} sse={sse}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16,marginBottom:16}}>
                <InternalTasks c={c} sse={sse} aFN={aFN}/>
                <ActionLog c={c} sse={sse}/>
              </div>
              <EscalationPanel c={c} sse={sse} agentId={currentAgentId}/>
            </div>
          )}


          {/* ══ CRON — Jaden's layout, Sarah's branding ══ */}
          {/* ══ ACTIVITY ══ */}
          {pg==="activity"&&(
            <div style={{padding:0}}>
              {/* Header */}
              <div style={{background:c.cd,borderBottom:"1px solid "+c.ln}}>
                <div style={{maxWidth:840,margin:"0 auto",padding:mob?"16px 16px 0":"20px 28px 0"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                    <div>
                      <h1 style={{fontSize:20,fontWeight:700,color:c.tx}}>Activity</h1>
                      <p style={{fontSize:13,color:c.so,marginTop:3}}>What {aFN}'s been working on</p>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      {taskRuns.some(r=>r.status==="pending")&&(
                        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,background:c.ac+"10",border:"1px solid "+c.ac+"20"}}>
                          <span style={{width:7,height:7,borderRadius:"50%",background:c.ac,animation:"pulse 1.5s ease infinite"}}/>
                          <span style={{fontSize:12,fontWeight:600,color:c.ac}}>{taskRuns.filter(r=>r.status==="pending").length} running</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    {[{key:"scheduled",label:"Scheduled Tasks",badge:scheduledTasks.filter(t=>t.enabled).length},{key:"calendar",label:"Calendar"},{key:"history",label:"Task History"}].map(tab=>(
                      <button key={tab.key} onClick={()=>setActTab(tab.key)} style={{
                        padding:"9px 18px",fontSize:13,fontWeight:600,border:"none",
                        borderBottom:actTab===tab.key?"2px solid "+c.ac:"2px solid transparent",
                        background:"transparent",color:actTab===tab.key?c.tx:c.so,cursor:"pointer",fontFamily:"inherit"
                      }}>
                        {tab.label}
                        {tab.badge>0&&<span style={{marginLeft:6,fontSize:11,fontWeight:700,color:c.ac}}>{tab.badge}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{maxWidth:840,margin:"0 auto",padding:mob?"0 16px 60px":"0 28px 60px"}}>
                {/* ── Scheduled Tasks ── */}
                {actTab==="scheduled"&&(
                  <div style={{paddingTop:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <span style={{fontSize:13,color:c.so}}>
                        {scheduledTasks.filter(t=>t.enabled).length} active · {scheduledTasks.filter(t=>!t.enabled).length} paused
                      </span>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{setBulkImportOpen(!bulkImportOpen);setTaskFormOpen(false);}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:13,fontWeight:600,color:c.tx,fontFamily:"inherit"}}>
                          {bulkImportOpen?"Cancel":"📋 Bulk Import"}
                        </button>
                        <button onClick={()=>{setTaskFormOpen(!taskFormOpen);setBulkImportOpen(false);}} style={{padding:"8px 18px",borderRadius:8,border:"none",background:c.gradient,cursor:"pointer",fontSize:13,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>
                          {taskFormOpen?"Cancel":"+ New Task"}
                        </button>
                      </div>
                    </div>

                    {/* New task form */}
                    {taskFormOpen&&(
                      <div style={{padding:16,borderRadius:12,border:"1px solid "+c.ln,background:c.sf,marginBottom:14}}>
                        <input value={newTask.name} onChange={e=>setNewTask(p=>({...p,name:e.target.value}))} placeholder="Task name..." style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,marginBottom:8,fontFamily:"inherit",boxSizing:"border-box"}}/>
                        <textarea value={newTask.instruction} onChange={e=>setNewTask(p=>({...p,instruction:e.target.value}))} placeholder={"What should "+aFN+" do?"} rows={3} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,marginBottom:8,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                        <div style={{display:"flex",gap:6,marginBottom:10}}>
                          <select value={newTask.taskType} onChange={e=>setNewTask(p=>({...p,taskType:e.target.value}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit"}}>
                            <option value="content">Content</option><option value="email">Email</option><option value="research">Research</option><option value="crm">CRM</option><option value="custom">Custom</option>
                          </select>
                          <select value={newTask.frequency} onChange={e=>setNewTask(p=>({...p,frequency:e.target.value}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit"}}>
                            <option value="every_10_min">Every 10 Min</option><option value="every_30_min">Every 30 Min</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                          </select>
                          <input type="time" value={newTask.runTime} onChange={e=>setNewTask(p=>({...p,runTime:e.target.value}))} style={{width:100,padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit"}}/>
                        </div>
                        <button onClick={async()=>{
                          if(!newTask.name||!newTask.instruction) return;
                          await fetch('/api/agent/tasks', await withAuth({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newTask)});
                          setNewTask({name:'',instruction:'',taskType:'content',frequency:'daily',runTime:'09:00'});
                          setTaskFormOpen(false);
                          loadActivity();
                        }} disabled={!newTask.name||!newTask.instruction} style={{width:"100%",padding:"10px 0",borderRadius:8,border:"none",background:newTask.name&&newTask.instruction?c.gradient:"#444",cursor:newTask.name&&newTask.instruction?"pointer":"not-allowed",fontSize:13,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>Create Task</button>
                      </div>
                    )}

                    {/* Bulk Import */}
                    {bulkImportOpen&&(
                      <div style={{padding:16,borderRadius:12,border:"1px solid "+c.ln,background:c.sf,marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                          <div style={{fontSize:14,fontWeight:700,color:c.tx}}>📋 Import Tasks</div>
                          <button onClick={()=>{
                            const csv="Task Name,Instruction,Frequency,Time\nMorning blog post,\"Write a 500-word blog about today's trending topic in our industry\",weekdays,08:00\nWeekly newsletter,\"Draft the weekly email newsletter summarizing this week's content and wins\",weekly,14:00\nCheck new leads,\"Review all new CRM contacts from the past 24 hours and send welcome emails\",daily,09:00\nSocial media post,\"Create and schedule an engaging social media post with a relevant image\",daily,10:00\nMonthly report,\"Generate a monthly performance report covering email opens and website traffic\",monthly,09:00";
                            const blob=new Blob([csv],{type:'text/csv'});
                            const url=URL.createObjectURL(blob);
                            const a=document.createElement('a');a.href=url;a.download='bloom-task-template.csv';a.click();
                            URL.revokeObjectURL(url);
                          }} style={{padding:"6px 12px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:11,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>
                            ↓ Download CSV Template
                          </button>
                        </div>

                        {/* Upload CSV */}
                        <label style={{display:"block",padding:20,borderRadius:10,border:"2px dashed "+c.ln,background:c.cd,textAlign:"center",cursor:"pointer",marginBottom:12,transition:"border-color .15s"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
                          onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}
                          onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=c.ac;}}
                          onDragLeave={e=>e.currentTarget.style.borderColor=c.ln}
                          onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=c.ln;const f=e.dataTransfer.files[0];if(f)handleCSVFile(f);}}>
                          
                          <div style={{fontSize:13,fontWeight:600,color:c.tx}}>Drop CSV file here or click to upload</div>
                          <div style={{fontSize:11,color:c.so,marginTop:4}}>Format: Task Name, Instruction, Frequency, Time</div>
                          <input type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)handleCSVFile(f);}}/>
                        </label>

                        {/* Or paste raw */}
                        <details style={{marginBottom:12}}>
                          <summary style={{fontSize:12,fontWeight:600,color:c.so,cursor:"pointer",marginBottom:8}}>Or paste raw text (one task per line)</summary>
                          <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder={"Task Name, Instruction, Frequency, Time\nMorning blog post, Write a blog about trending topics, weekdays, 08:00\nWeekly newsletter, Draft the weekly email, weekly, 14:00"} rows={5} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box"}}/>
                        </details>

                        {/* Preview parsed tasks */}
                        {bulkText.trim()&&(
                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:700,color:c.so,marginBottom:6}}>PREVIEW ({bulkText.split('\n').filter(l=>l.trim()&&!l.match(/^task name/i)).length} tasks)</div>
                            <div style={{maxHeight:150,overflowY:"auto",borderRadius:8,border:"1px solid "+c.ln}}>
                              {bulkText.split('\n').filter(l=>l.trim()&&!l.match(/^task name/i)).map((line,i)=>{
                                const parts=line.split(/[,|]/).map(p=>p.trim().replace(/^"|"$/g,''));
                                return <div key={i} style={{padding:"6px 10px",fontSize:11,borderBottom:"1px solid "+c.ln+"60",display:"flex",gap:8,color:c.tx}}>
                                  <span style={{fontWeight:600,minWidth:0,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{parts[0]}</span>
                                  <span style={{color:c.so,fontSize:10,flexShrink:0}}>{parts[2]||'daily'} · {parts[3]||'9:00'}</span>
                                </div>;
                              })}
                            </div>
                          </div>
                        )}

                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          <button onClick={async()=>{
                            const lines=bulkText.split('\n').map(l=>l.trim()).filter(l=>l&&!l.match(/^task name/i));
                            let created=0;
                            for(const line of lines){
                              const parts=line.split(/[,|]/).map(p=>p.trim().replace(/^"|"$/g,''));
                              const name=parts[0];const instruction=parts[1]||parts[0];
                              const frequency=(parts[2]||'daily').toLowerCase();const runTime=parts[3]||'09:00';
                              const taskType=instruction.match(/blog|post|write|content/i)?'content':instruction.match(/email|newsletter|campaign/i)?'email':instruction.match(/crm|contact|lead/i)?'crm':instruction.match(/research|search|find/i)?'research':'custom';
                              if(name){try{await fetch('/api/agent/tasks', await withAuth({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,instruction,taskType,frequency,runTime})});created++;}catch{}}
                            }
                            setBulkText('');setBulkImportOpen(false);loadActivity();
                          }} disabled={!bulkText.trim()} style={{padding:"10px 24px",borderRadius:8,border:"none",background:bulkText.trim()?c.gradient:"#444",cursor:bulkText.trim()?"pointer":"not-allowed",fontSize:13,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>
                            Import Tasks
                          </button>

                          {/* AI Decompose — for visionary task descriptions */}
                          <button onClick={async()=>{
                            const vision=prompt(`Describe what you want your AI employee to do — be as big-picture as you want:\n\nExample: 'I want ${aFN} to handle all my marketing. Blog posts, emails, social media, lead follow-up, and keep the CRM clean.'`);
                            if(!vision) return;
                            try{
                              const r=await fetch('/api/chat/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                                message:`SYSTEM TASK — Do NOT respond conversationally. Break this vision into specific recurring tasks. Return ONLY a CSV with no extra text, no markdown, no explanation. Format: Task Name,Instruction,Frequency,Time\n\nVision: "${vision}"\n\nRules:\n- Each task must be specific and actionable (not vague)\n- Include the exact instruction Sarah should follow each time\n- Default to daily unless it makes sense otherwise\n- Time should be spread across the day (not all at 9am)\n- 5-10 tasks max\n- Output ONLY the CSV rows, no headers, no backticks`,
                                sessionId:'system-decompose-'+Date.now(),
                                agentId:currentAgentId
                              })});
                              const d=await r.json();
                              if(d.response){
                                const cleaned=d.response.replace(/```csv?/g,'').replace(/```/g,'').replace(/^Task Name.*\n/i,'').trim();
                                setBulkText(cleaned);
                              }
                            }catch(e){setOauthToast({type:'error',msg:'Failed: '+e.message}); setTimeout(()=>setOauthToast(null),4000);}
                          }} style={{padding:"10px 18px",borderRadius:8,border:"1px solid "+c.ac,background:c.ac+"10",cursor:"pointer",fontSize:13,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>
                            ✨ AI Break Down a Vision
                          </button>
                        </div>
                        <div style={{fontSize:11,color:c.so,marginTop:8}}>Tip: Describe your big picture and let AI break it into specific daily/weekly tasks</div>
                      </div>
                    )}

                    {/* Task cards */}
                    {scheduledTasks.map((task,i)=>{
                      const typeIc={content:null,email:null,research:null,crm:null,custom:null}[task.taskType]||null;
                      return(
                        <div key={task.taskId} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:10,background:c.sf,border:"1px solid "+(editTask?.taskId===task.taskId?c.ac:c.ln),opacity:task.enabled?1:0.45,marginBottom:6,cursor:"pointer",transition:"border-color .15s"}} onClick={()=>{
                          if(editTask?.taskId===task.taskId){setEditTask(null);}else{
                            setEditTask(task);
                            setEditForm({name:task.name||'',instruction:task.instruction||task.description||'',taskType:task.taskType||'custom',frequency:task.frequency||'daily',runTime:task.runTime||'09:00'});
                          }
                        }}>
                          <button onClick={(e)=>{
                            e.stopPropagation();
                            (async()=>{await fetch(`/api/agent/tasks/${task.taskId}`, await withAuth({method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!task.enabled})});loadActivity();})();
                          }} style={{width:38,height:22,borderRadius:11,border:"none",background:task.enabled?c.gr:"#444",cursor:"pointer",position:"relative",flexShrink:0}}>
                            <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:task.enabled?19:3,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                          </button>
                          <span style={{fontSize:18,flexShrink:0}}>{typeIc}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:14,fontWeight:600,color:c.tx}}>{task.name}</div>
                            <div style={{fontSize:12,color:c.so,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.description||task.instruction}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                            <div style={{fontSize:11,fontWeight:600,color:c.tx}}>{fmtFreq(task.frequency)} · {task.runTime||"9:00"}</div>
                            <div style={{fontSize:11,color:task.enabled?c.so:c.fa,marginTop:2}}>{task.enabled?"Active":"Paused"}</div>
                            {task.runCount>0&&<div style={{fontSize:10,color:c.fa,marginTop:1}}>{task.runCount} runs</div>}
                          </div>
                          <button onClick={(e)=>{e.stopPropagation();if(confirm('Delete this task?')){(async()=>{await fetch(`/api/agent/tasks/${task.taskId}`, await withAuth({method:'DELETE'});loadActivity();})();}}} style={{width:28,height:28,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",color:c.fa,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
                        </div>
                      );
                    })}

                    {/* ── Task Edit Panel ── */}
                    {editTask&&(
                      <div style={{background:c.cd,border:"1px solid "+c.ac,borderRadius:12,padding:20,marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                          <div style={{fontSize:14,fontWeight:700,color:c.tx}}>Edit Task</div>
                          <button onClick={()=>setEditTask(null)} style={{background:"transparent",border:"none",color:c.fa,cursor:"pointer",fontSize:16,padding:4}}>✕</button>
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Task Name</div>
                          <input value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,fontFamily:"inherit",boxSizing:"border-box"}}/>
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Instructions</div>
                          <textarea value={editForm.instruction} onChange={e=>setEditForm(p=>({...p,instruction:e.target.value}))} rows={3} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                        </div>
                        <div style={{display:"flex",gap:8,marginBottom:14}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Type</div>
                            <select value={editForm.taskType} onChange={e=>setEditForm(p=>({...p,taskType:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit"}}>
                              <option value="content">Content</option><option value="email">Email</option><option value="research">Research</option><option value="crm">CRM</option><option value="custom">Custom</option>
                            </select>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Frequency</div>
                            <select value={editForm.frequency} onChange={e=>setEditForm(p=>({...p,frequency:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit"}}>
                              <option value="every_10_min">Every 10 Min</option><option value="every_30_min">Every 30 Min</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div style={{width:110}}>
                            <div style={{fontSize:11,fontWeight:600,color:c.so,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"}}>Run Time</div>
                            <input type="time" value={editForm.runTime} onChange={e=>setEditForm(p=>({...p,runTime:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit",boxSizing:"border-box"}}/>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,marginBottom:8}}>
                          <div style={{flex:1,fontSize:11,color:c.fa}}>
                            {editTask.lastRunAt?`Last run: ${new Date(editTask.lastRunAt).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'Never run'}
                            {editTask.nextRunAt?` · Next: ${new Date(editTask.nextRunAt).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:''}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={async()=>{
                            const body={};
                            if(editForm.name!==editTask.name) body.name=editForm.name;
                            if(editForm.instruction!==(editTask.instruction||editTask.description)) body.instruction=editForm.instruction;
                            if(editForm.frequency!==editTask.frequency) body.frequency=editForm.frequency;
                            if(editForm.runTime!==editTask.runTime) body.runTime=editForm.runTime;
                            if(Object.keys(body).length===0){setEditTask(null);return;}
                            await fetch(`/api/agent/tasks/${editTask.taskId}`, await withAuth({method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
                            setEditTask(null);
                            loadActivity();
                          }} style={{flex:1,padding:"10px 16px",borderRadius:8,border:"none",background:c.ac,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                            Save Changes
                          </button>
                          <button onClick={()=>setEditTask(null)} style={{padding:"10px 16px",borderRadius:8,border:"1px solid "+c.ln,background:"transparent",color:c.so,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {scheduledTasks.length===0&&!taskFormOpen&&(
                      <div style={{textAlign:"center",padding:60,color:c.so}}>
                        <div style={{fontSize:28,marginBottom:8,opacity:0.25}}>📋</div>
                        <div style={{fontSize:14,fontWeight:600,color:c.tx,marginBottom:4}}>No scheduled tasks yet</div>
                        <div style={{fontSize:13,marginBottom:16}}>Add one here or tell {aFN} in chat</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Calendar View ── */}
                {actTab==="calendar"&&(
                  <div style={{paddingTop:20}}>
                    {(()=>{
                      const y=calMonth.getFullYear(),m=calMonth.getMonth();
                      const firstDay=new Date(y,m,1).getDay();
                      const daysInMonth=new Date(y,m+1,0).getDate();
                      const today=new Date();
                      const isToday=(d)=>d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
                      const monthName=calMonth.toLocaleString('default',{month:'long',year:'numeric'});

                      // Map task runs to dates
                      const runsByDate={};
                      taskRuns.forEach(r=>{
                        if(!r.completedAt&&!r.createdAt) return;
                        const d=new Date(r.completedAt||r.createdAt);
                        if(d.getMonth()===m&&d.getFullYear()===y){
                          const day=d.getDate();
                          if(!runsByDate[day]) runsByDate[day]=[];
                          runsByDate[day].push(r);
                        }
                      });

                      // Map scheduled tasks to recurring days
                      const scheduledByDay={};
                      scheduledTasks.filter(t=>t.enabled).forEach(t=>{
                        for(let d=1;d<=daysInMonth;d++){
                          const dow=new Date(y,m,d).getDay();
                          const shouldRun=t.frequency==='daily'||t.frequency==='hourly'||t.frequency==='every_10_min'||t.frequency==='every_30_min'||(t.frequency==='weekdays'&&dow>=1&&dow<=5)||(t.frequency==='weekly'&&dow===1)||(t.frequency==='monthly'&&d===1);
                          if(shouldRun){
                            if(!scheduledByDay[d]) scheduledByDay[d]=[];
                            scheduledByDay[d].push(t);
                          }
                        }
                      });

                      const cells=[];
                      for(let i=0;i<firstDay;i++) cells.push(null);
                      for(let d=1;d<=daysInMonth;d++) cells.push(d);

                      return(
                        <>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                            <button onClick={()=>setCalMonth(new Date(y,m-1,1))} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
                            <span style={{fontSize:16,fontWeight:700,color:c.tx}}>{monthName}</span>
                            <button onClick={()=>setCalMonth(new Date(y,m+1,1))} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>→</button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
                            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
                              <div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:c.so,padding:"6px 0",textTransform:"uppercase",letterSpacing:"0.5px"}}>{d}</div>
                            ))}
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                            {cells.map((d,i)=>{
                              if(!d) return <div key={`e${i}`} style={{minHeight:mob?60:80}}/>;
                              const runs=runsByDate[d]||[];
                              const scheduled=scheduledByDay[d]||[];
                              const isPast=new Date(y,m,d)<new Date(today.getFullYear(),today.getMonth(),today.getDate());
                              const hasCompleted=runs.some(r=>r.status==="completed");
                              const hasFailed=runs.some(r=>r.status==="failed");
                              const hasPending=runs.some(r=>r.status==="pending");
                              return(
                                <div key={d} onClick={()=>setCalSelDay(calSelDay===d?null:d)} style={{minHeight:mob?60:80,borderRadius:8,border:calSelDay===d?"2px solid "+c.ac:isToday(d)?"2px solid "+c.ac+"80":"1px solid "+c.ln,background:calSelDay===d?c.ac+"12":isToday(d)?c.ac+"08":c.sf,padding:"4px 6px",overflow:"hidden",cursor:"pointer",transition:"border-color .15s, background .15s"}}>
                                  <div style={{fontSize:12,fontWeight:isToday(d)?700:500,color:isToday(d)?c.ac:isPast?c.fa:c.tx,marginBottom:3}}>{d}</div>
                                  {runs.map((r,ri)=>{
                                    const ic={content:null,email:null,research:null,crm:null,custom:null}[r.taskType]||null;
                                    const bg=r.status==="completed"?c.gr+"20":r.status==="failed"?c.err+"20":c.ac+"20";
                                    const tc=r.status==="completed"?c.gr:r.status==="failed"?c.err:c.ac;
                                    return ri<3?<div key={ri} style={{fontSize:10,padding:"2px 4px",borderRadius:4,background:bg,color:tc,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ic} {r.taskName}</div>:null;
                                  })}
                                  {runs.length>3&&<div style={{fontSize:9,color:c.so,textAlign:"center"}}>+{runs.length-3}</div>}
                                  {runs.length===0&&scheduled.length>0&&(
                                    <>
                                      {scheduled.slice(0,2).map((t,ti)=>{
                                        const ic={content:null,email:null,research:null,crm:null,custom:null}[t.taskType]||null;
                                        return <div key={ti} style={{fontSize:10,padding:"2px 4px",borderRadius:4,background:c.cd,color:isPast?c.fa:c.so,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:isPast?0.4:0.7}}>{ic} {t.name}</div>;
                                      })}
                                      {scheduled.length>2&&<div style={{fontSize:9,color:c.so}}>+{scheduled.length-2}</div>}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{display:"flex",gap:16,marginTop:12,justifyContent:"center"}}>
                            <span style={{fontSize:11,color:c.so,display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:c.gr+"40"}}/> Completed</span>
                            <span style={{fontSize:11,color:c.so,display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:c.err+"40"}}/> Failed</span>
                            <span style={{fontSize:11,color:c.so,display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:c.cd,border:"1px solid "+c.ln}}/> Scheduled</span>
                            <span style={{fontSize:11,color:c.fa}}>Click a day to add a task</span>
                          </div>

                          {/* Add task from calendar */}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* ── Calendar Day Modal ── */}
                {calSelDay&&actTab==="calendar"&&(
                  <div onClick={()=>setCalSelDay(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,maxHeight:"85vh",background:c.cd,borderRadius:16,border:"1px solid "+c.ln,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
                      {/* Header */}
                      <div style={{padding:"16px 20px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(135deg, rgba(244,162,97,0.08), rgba(231,111,139,0.08))",flexShrink:0}}>
                        <div>
                          <div style={{fontSize:18,fontWeight:700,color:c.tx}}>{new Date(calMonth.getFullYear(),calMonth.getMonth(),calSelDay).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
                          <div style={{fontSize:12,color:c.so,marginTop:2}}>
                            {(()=>{
                              const y=calMonth.getFullYear(),m=calMonth.getMonth();
                              const dayRuns=(taskRuns||[]).filter(r=>{const d=new Date(r.completedAt||r.createdAt);return d.getDate()===calSelDay&&d.getMonth()===m&&d.getFullYear()===y;});
                              const dow=new Date(y,m,calSelDay).getDay();
                              const dayScheduled=scheduledTasks.filter(t=>t.enabled).filter(t=>t.frequency==='daily'||t.frequency==='hourly'||t.frequency==='every_10_min'||t.frequency==='every_30_min'||(t.frequency==='weekdays'&&dow>=1&&dow<=5)||(t.frequency==='weekly'&&dow===1)||(t.frequency==='monthly'&&calSelDay===1));
                              return `${dayRuns.length} completed · ${dayScheduled.length} scheduled`;
                            })()}
                          </div>
                        </div>
                        <button onClick={()=>setCalSelDay(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:16,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                      </div>

                      {/* Scrollable content */}
                      <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
                        {/* Completed runs this day */}
                        {(()=>{
                          const y=calMonth.getFullYear(),m=calMonth.getMonth();
                          const dayRuns=(taskRuns||[]).filter(r=>{const d=new Date(r.completedAt||r.createdAt);return d.getDate()===calSelDay&&d.getMonth()===m&&d.getFullYear()===y;});
                          if(dayRuns.length>0) return(
                            <div style={{marginBottom:16}}>
                              <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Activity</div>
                              {dayRuns.map((r,i)=>{
                                const ic={content:null,email:null,research:null,crm:null,custom:null}[r.taskType]||null;
                                const sc={completed:c.gr,failed:c.err,pending:c.ac}[r.status]||c.so;
                                return(
                                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,background:c.sf,border:"1px solid "+c.ln,marginBottom:4}}>
                                    <span style={{fontSize:16}}>{ic}</span>
                                    <div style={{flex:1,minWidth:0}}>
                                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                                        <span style={{fontSize:13,fontWeight:600,color:c.tx}}>{r.taskName}</span>
                                        <span style={{fontSize:10,fontWeight:600,color:sc,textTransform:"capitalize"}}>{r.status}</span>
                                      </div>
                                      {r.result&&<div style={{fontSize:12,color:c.so,marginTop:3,lineHeight:1.5}}>{r.result.slice(0,200)}{r.result.length>200?'...':''}</div>}
                                      {r.duration&&<div style={{fontSize:10,color:c.fa,marginTop:2}}>{r.duration} · {r.time||''}</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                          return null;
                        })()}

                        {/* Scheduled tasks for this day */}
                        {(()=>{
                          const y=calMonth.getFullYear(),m=calMonth.getMonth();
                          const dow=new Date(y,m,calSelDay).getDay();
                          const dayScheduled=scheduledTasks.filter(t=>t.enabled).filter(t=>t.frequency==='daily'||t.frequency==='hourly'||t.frequency==='every_10_min'||t.frequency==='every_30_min'||(t.frequency==='weekdays'&&dow>=1&&dow<=5)||(t.frequency==='weekly'&&dow===1)||(t.frequency==='monthly'&&calSelDay===1));
                          if(dayScheduled.length>0) return(
                            <div style={{marginBottom:16}}>
                              <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Scheduled</div>
                              {dayScheduled.map((t,i)=>{
                                const ic={content:null,email:null,research:null,crm:null,custom:null}[t.taskType]||null;
                                return(
                                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:c.sf,border:"1px solid "+c.ln,marginBottom:4}}>
                                    <span style={{fontSize:16}}>{ic}</span>
                                    <div style={{flex:1}}>
                                      <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{t.name}</div>
                                      <div style={{fontSize:11,color:c.so,marginTop:1}}>{fmtFreq(t.frequency)} · {t.runTime||'9:00'}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                          return null;
                        })()}

                        {/* Add new task */}
                        <div style={{borderTop:"1px solid "+c.ln,paddingTop:16}}>
                          <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Add New Task</div>
                          <input value={calTask.name} onChange={e=>setCalTask(p=>({...p,name:e.target.value}))} placeholder="Task name..." style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,marginBottom:6,fontFamily:"inherit",boxSizing:"border-box"}}/>
                          <textarea value={calTask.instruction} onChange={e=>setCalTask(p=>({...p,instruction:e.target.value}))} placeholder={"What should "+aFN+" do?"} rows={2} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,marginBottom:6,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                          <div style={{display:"flex",gap:6,marginBottom:10}}>
                            <select value={calTask.frequency} onChange={e=>setCalTask(p=>({...p,frequency:e.target.value}))} style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit"}}>
                              <option value="every_10_min">Every 10 Min</option><option value="every_30_min">Every 30 Min</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                            </select>
                            <input type="time" value={calTask.runTime} onChange={e=>setCalTask(p=>({...p,runTime:e.target.value}))} style={{width:110,padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"inherit"}}/>
                          </div>
                          <button onClick={async()=>{
                            if(!calTask.name||!calTask.instruction) return;
                            const taskType=calTask.instruction.match(/blog|post|write|content/i)?'content':calTask.instruction.match(/email|newsletter/i)?'email':calTask.instruction.match(/crm|contact|lead/i)?'crm':'custom';
                            await fetch('/api/agent/tasks', await withAuth({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...calTask,taskType})});
                            setCalTask({name:'',instruction:'',frequency:'daily',runTime:'09:00'});
                            setCalSelDay(null);
                            loadActivity();
                          }} disabled={!calTask.name||!calTask.instruction} style={{width:"100%",padding:"10px 0",borderRadius:8,border:"none",background:calTask.name&&calTask.instruction?c.gradient:"#444",cursor:calTask.name&&calTask.instruction?"pointer":"not-allowed",fontSize:13,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>
                            Add to Schedule
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Task History ── */}
                {actTab==="history"&&(
                  <div style={{paddingTop:20}}>
                    {taskRuns.length===0?(
                      <div style={{textAlign:"center",padding:60,color:c.so}}>
                        <div style={{fontSize:28,marginBottom:8,opacity:0.25}}>📋</div>
                        <div style={{fontSize:14,fontWeight:600,color:c.tx,marginBottom:4}}>No activity yet</div>
                        <div style={{fontSize:13}}>Once {aFN} starts running scheduled tasks, their work will show up here.</div>
                      </div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        {taskRuns.map((run,i)=>{
                          const sdColors={queued:c.warn,pending:c.ac,completed:c.gr,failed:c.err};
                          const sdLabels={pending:"Running...",queued:"Queued",failed:"Failed",completed:"Completed"};
                          const typeIc={content:null,email:null,research:null,crm:null,custom:null}[run.taskType]||null;
                          const expanded=expandedRun===run.id;
                          const ev=run.evidence||{};
                          return(
                            <div key={run.id}>
                              <div onClick={()=>setExpandedRun(expanded?null:run.id)} style={{
                                display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:expanded?"10px 10px 0 0":10,
                                background:c.sf,border:"1px solid "+(run.status==="failed"?c.err+"40":c.ln),borderBottom:expanded?"1px solid "+c.ln+"60":"1px solid "+(run.status==="failed"?c.err+"40":c.ln),
                                cursor:"pointer",marginBottom:expanded?0:6
                              }}>
                                <span style={{width:8,height:8,borderRadius:"50%",background:sdColors[run.status]||c.so,flexShrink:0,animation:run.status==="pending"?"pulse 1.5s ease infinite":"none"}}/>
                                <span style={{fontSize:16,flexShrink:0}}>{typeIc}</span>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                                    <span style={{fontSize:13,fontWeight:600,color:c.tx}}>{run.taskName||'Unknown Task'}</span>
                                    <span style={{fontSize:11,color:sdColors[run.status],fontWeight:500}}>{sdLabels[run.status]||run.status}</span>
                                  </div>
                                  {run.status==="failed"&&run.result&&!expanded&&<div style={{fontSize:12,color:c.err,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{run.result}</div>}
                                  {run.status!=="failed"&&run.result&&!expanded&&<div style={{fontSize:12,color:c.so,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{run.result}</div>}
                                  {!run.result&&!expanded&&run.instruction&&<div style={{fontSize:12,color:c.so,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{run.instruction}</div>}
                                </div>
                                <div style={{textAlign:"right",flexShrink:0}}>
                                  <span style={{fontSize:11,color:c.fa}}>{run.time||""}</span>
                                  {run.duration&&<div style={{fontSize:10,color:c.fa,marginTop:1}}>{run.duration}</div>}
                                  {run.model&&<div style={{fontSize:10,color:c.fa,marginTop:1}}>{run.model}</div>}
                                </div>
                              </div>
                              {expanded&&(
                                <div style={{background:c.sf,borderRadius:"0 0 10px 10px",border:"1px solid "+c.ln,borderTop:"none",marginBottom:6}}>
                                  {run.instruction&&<div style={{padding:"10px 16px",borderBottom:"1px solid "+c.ln+"40"}}><div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Task Instructions</div><div style={{fontSize:12,color:c.tx,lineHeight:1.5}}>{run.instruction}</div>{run.frequency&&<div style={{fontSize:11,color:c.fa,marginTop:4}}>{fmtFreq(run.frequency)} at {run.runTime||'9:00'}</div>}</div>}
                                  {run.status==="failed"&&run.result&&<div style={{padding:"10px 16px",borderBottom:ev.actions?.length?"1px solid "+c.ln+"40":"none"}}><div style={{fontSize:11,fontWeight:700,color:c.err,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Error</div><div style={{fontSize:12,color:c.err,lineHeight:1.5,fontFamily:"monospace",background:c.cd,padding:8,borderRadius:6}}>{run.result}</div></div>}
                                  {run.status!=="failed"&&run.result&&<div style={{padding:"12px 16px",fontSize:13,color:c.tx,lineHeight:1.6,borderBottom:ev.actions?.length?"1px solid "+c.ln+"40":"none"}}>{run.result}</div>}
                                  {ev.actions?.length>0&&(
                                    <div style={{padding:"10px 16px"}}>
                                      <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>What {aFN} did</div>
                                      {ev.actions.map((a,ai)=>(
                                        <div key={ai} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:ai<ev.actions.length-1?"1px solid "+c.ln+"30":"none"}}>
                                          <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{a.icon||"•"}</span>
                                          <div>
                                            <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{a.label}</div>
                                            {a.detail&&<div style={{fontSize:12,color:c.so,marginTop:1}}>{a.detail}{a.crmLink&&<a href={a.crmLink} target="_blank" rel="noopener" style={{color:c.ac,textDecoration:"none",marginLeft:6}}>View in CRM →</a>}</div>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {ev.files?.length>0&&(
                                    <div style={{padding:"10px 16px",borderTop:"1px solid "+c.ln+"40"}}>
                                      <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Files created</div>
                                      {ev.files.map((f,fi)=>(
                                        <div key={fi} style={{borderRadius:8,border:"1px solid "+c.ln,overflow:"hidden",marginBottom:6}}>
                                          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:c.cd}}>
                                            <span></span>
                                            <span style={{flex:1,fontSize:13,fontWeight:600,color:c.gr}}>{f.name}</span>
                                            <button onClick={e=>{e.stopPropagation();setPreviewFileIdx(previewFileIdx===fi?null:fi);}} style={{padding:"3px 10px",borderRadius:5,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",fontSize:11,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>{previewFileIdx===fi?"Close":"Preview"}</button>
                                            <button style={{padding:"3px 10px",borderRadius:5,border:"none",background:c.gr+"15",cursor:"pointer",fontSize:11,fontWeight:600,color:c.gr,fontFamily:"inherit"}}>Open in Files →</button>
                                          </div>
                                          {previewFileIdx===fi&&f.preview&&<div style={{padding:"12px 16px",borderTop:"1px solid "+c.ln,maxHeight:200,overflowY:"auto",fontSize:13,lineHeight:1.7,color:c.tx+"cc"}} dangerouslySetInnerHTML={{__html:(f.preview||'').replace(/^# (.+)$/gm,'<div style="font-size:16px;font-weight:700;margin:10px 0 6px">$1</div>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n\n/g,'<br/><br/>')}}/>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ CALLS — Phone call transcripts + Sarah's actions ══ */}
          {pg==="calls"&&(
            <div style={{padding:mob?"16px 12px 60px":"32px 40px 60px",maxWidth:680,margin:"0 auto"}}>
              {/* Header */}
              <div style={{marginBottom:32}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                  <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                  </div>
                  <div>
                    <h1 style={{fontSize:mob?22:26,fontWeight:700,color:c.tx,margin:0}}>BLOOM Mobile</h1>
                    <p style={{fontSize:13,color:c.so,margin:0}}>Add {aFN} to your phone — no App Store needed</p>
                  </div>
                </div>
              </div>

              {/* Agent card */}
              <div style={{padding:20,borderRadius:16,background:c.cd,border:"1px solid "+c.ln,marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
                {agentImgUrl
                  ?<img src={agentImgUrl} alt={agent.nm} style={{width:56,height:56,borderRadius:14,objectFit:"cover",border:"2px solid "+c.ln,flexShrink:0}}/>
                  :<div style={{width:56,height:56,borderRadius:14,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>{agent.nm.charAt(0)}</div>
                }
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:16,fontWeight:700,color:c.tx}}>{agent.nm}</div>
                  <div style={{fontSize:12,color:c.so,marginTop:2}}>{currentAgent?.job_title||currentAgent?.role||"Your AI Employee"}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginTop:4}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#34a853",animation:"pulse 1.5s ease infinite"}}/>
                    <span style={{fontSize:11,color:"#34a853",fontWeight:600}}>Available on mobile</span>
                  </div>
                </div>
              </div>

              {/* How to install */}
              <div style={{padding:24,borderRadius:16,background:c.cd,border:"1px solid "+c.ln,marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:4}}>Add Bloomie to your home screen</div>
                <div style={{fontSize:12,color:c.so,marginBottom:4}}>You only have to do this once. After that, open Bloomie like any other app — no browser, no steps.</div>
                <div style={{fontSize:11,color:"#F4A261",fontWeight:600,marginBottom:20}}>⚠️ iPhone users: Safari is required for this step. Chrome on iPhone cannot add apps to your home screen.</div>

                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {[
                    {n:"1",title:"Open Safari on your iPhone",desc:"Just this once — open Safari (not Chrome) and go to:",highlight:window.location.origin},
                    {n:"2",title:"Tap the Share button",desc:"The box with an arrow pointing up — at the bottom of Safari. Tap it."},
                    {n:"3",title:"Scroll down and tap 'Add to Home Screen'",desc:"It's in the list that slides up. Scroll down a little if you don't see it right away."},
                    {n:"4",title:"Tap Add — done forever",desc:"Bloomie now lives on your home screen. Every time after this, just tap the icon. No browser, no URL, no steps."},
                  ].map((step,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0,marginTop:1}}>{step.n}</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{step.title}</div>
                        <div style={{fontSize:12,color:c.so,marginTop:2,lineHeight:1.5}}>{step.desc}</div>
                        {step.highlight&&<div style={{marginTop:6,padding:"6px 10px",borderRadius:6,background:c.sf,border:"1px solid "+c.ln,fontSize:11,fontFamily:"monospace",color:c.ac}}>{step.highlight}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Share the link */}
              <div style={{padding:20,borderRadius:16,background:c.cd,border:"1px solid "+c.ln,marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:4}}>Share with your team</div>
                <div style={{fontSize:12,color:c.so,marginBottom:14}}>Send this link to anyone on your team who needs mobile access to {aFN}.</div>
                <div style={{display:"flex",gap:6,marginBottom:14}}>
                  <div style={{flex:1,padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.sf,fontSize:12,fontFamily:"monospace",color:c.ac,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{window.location.origin}</div>
                  <button onClick={()=>{navigator.clipboard?.writeText(window.location.origin);setOauthToast({type:"success",msg:"Link copied"});setTimeout(()=>setOauthToast(null),2000);}} style={{padding:"10px 16px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",fontFamily:"inherit",flexShrink:0}}>Copy</button>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {[
                    {label:"Text / iMessage",href:"sms:?body="+encodeURIComponent("Chat with "+aFN+" from your phone: "+window.location.origin)},
                    {label:"Email",href:"mailto:?subject="+encodeURIComponent("Chat with "+aFN+" on mobile")+"&body="+encodeURIComponent("Use this link to chat with "+aFN+" from your phone: "+window.location.origin)},
                    {label:"WhatsApp",href:"https://wa.me/?text="+encodeURIComponent("Chat with "+aFN+" from your phone: "+window.location.origin)},
                  ].map((s,i)=>(
                    <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:12,fontWeight:600,color:c.tx,textDecoration:"none"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>
                      {s.label}
                    </a>
                  ))}
                </div>
              </div>

              {/* What you can do on mobile */}
              <div style={{padding:16,borderRadius:12,background:"linear-gradient(135deg,rgba(244,162,97,0.06),rgba(231,111,139,0.06))",border:"1px solid rgba(244,162,97,0.2)"}}>
                <div style={{fontSize:13,fontWeight:700,color:c.ac,marginBottom:8}}>What you can do from your phone</div>
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:6}}>
                  {["Give {aFN} tasks from anywhere","Check what {aFN} is working on","Approve content before it goes out","Review files {aFN} created","Start new conversations","Access your full chat history"].map((item,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:c.so}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:c.ac,flexShrink:0}}/>
                      {item.replace(/\{aFN\}/g,aFN)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ AGENT PROFILE (full page) ══ */}
          {pg==="profile"&&(
            <div style={{padding:0}}>
              {/* Header banner */}
              <div style={{background:c.gradient,padding:mob?"24px 16px":"32px 28px"}}>
                <div style={{maxWidth:840,margin:"0 auto",display:"flex",flexDirection:mob?"column":"row",alignItems:"center",gap:mob?16:20}}>
                  {/* Avatar with upload */}
                  <div style={{position:"relative"}}>
                    <Face sz={mob?72:88} agent={agent}/>
                    <label style={{position:"absolute",bottom:-2,right:-2,width:28,height:28,borderRadius:"50%",background:c.cd,border:"2px solid rgba(255,255,255,.3)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>
                      📷
                      <input type="file" accept="image/*" style={{display:"none"}} onChange={async(e)=>{
                        const file=e.target.files[0]; if(!file) return;
                        const reader=new FileReader();
                        reader.onload=async(ev)=>{
                          try{
                            // Resize image to keep payload small
                            const img=new Image();
                            await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=ev.target.result;});
                            const max=200,scale=Math.min(max/img.width,max/img.height,1);
                            const cv=document.createElement('canvas');
                            cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);
                            cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
                            const dataUrl=cv.toDataURL('image/jpeg',0.8);
                            setAgentImgUrl(dataUrl);
                            const r=await fetch('/api/agent/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatarUrl:dataUrl,agentId:currentAgentId})});
                            const d=await r.json();
                            console.log('Agent avatar save:',d);
                          }catch(err){
                            // Fallback — save original if resize fails
                            console.error('Resize failed, saving original:',err);
                            setAgentImgUrl(ev.target.result);
                            fetch('/api/agent/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatarUrl:ev.target.result,agentId:currentAgentId})}).catch(()=>{});
                          }
                        };
                        reader.readAsDataURL(file);
                      }}/>
                    </label>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:mob?22:26,fontWeight:700,color:"#fff"}}>{agent.nm}</div>
                    <div style={{fontSize:14,color:"rgba(255,255,255,.8)",marginTop:2}}>{profileData?.profile?.jobTitle||'AI Employee'}</div>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:4}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80"}}/>
                      <span style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>Online</span>
                    </div>
                  </div>
                  {/* Stats */}
                  {profileData?.stats&&(
                    <div style={{display:"flex",gap:mob?20:28}}>
                      {[{l:"Messages",v:profileData.stats.messages},{l:"Files",v:profileData.stats.files},{l:"Tasks",v:profileData.stats.activeTasks}].map((s,i)=>(
                        <div key={i} style={{textAlign:"center"}}>
                          <div style={{fontSize:22,fontWeight:700,color:"#fff"}}>{s.v}</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Content */}
              <div style={{maxWidth:840,margin:"0 auto",padding:mob?"16px":"24px 28px"}}>
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:20}}>
                  {/* Job Description */}
                  <div style={{padding:20,borderRadius:12,background:c.cd,border:"1px solid "+c.ln}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <span style={{fontSize:14,fontWeight:700,color:c.tx}}>Job Description</span>
                      <button onClick={()=>{
                        if(editingProfile){fetch('/api/agent/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobTitle:editTitle,jobDescription:editDesc,agentId:currentAgentId})}).then(()=>loadProfile());}
                        setEditingProfile(!editingProfile);
                      }} style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>
                        {editingProfile?'Save':'Edit'}
                      </button>
                    </div>
                    {editingProfile?(
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="Job title..." style={{padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,fontFamily:"inherit"}}/>
                        <textarea value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="Describe responsibilities..." rows={5} style={{padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,fontFamily:"inherit",resize:"vertical"}}/>
                      </div>
                    ):(
                      <div>
                        <div style={{fontSize:16,fontWeight:600,color:c.tx,marginBottom:6}}>{profileData?.profile?.jobTitle||'AI Employee'}</div>
                        <div style={{fontSize:13,color:c.so,lineHeight:1.7}}>{profileData?.profile?.jobDescription||'Click Edit to add a job description.'}</div>
                      </div>
                    )}
                  </div>

                  {/* Connected Tools */}
                  <div style={{padding:20,borderRadius:12,background:c.cd,border:"1px solid "+c.ln}}>
                    <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:12}}>Connected Tools</div>
                    {(profileData?.connectedTools||[]).map((tool,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<(profileData?.connectedTools?.length||0)-1?"1px solid "+c.ln+"40":"none"}}>
                        <span style={{fontSize:18}}>{tool.icon}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:tool.connected?c.tx:c.so}}>{tool.name}</div>
                          <div style={{fontSize:11,color:c.so}}>{tool.capabilities.join(', ')}</div>
                        </div>
                        <span style={{fontSize:11,fontWeight:600,color:tool.connected?c.gr:c.fa}}>{tool.connected?'Active':'Soon'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scheduled Tasks preview */}
                <div style={{padding:20,borderRadius:12,background:c.cd,border:"1px solid "+c.ln,marginTop:20}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <span style={{fontSize:14,fontWeight:700,color:c.tx}}>Scheduled Tasks</span>
                    <button onClick={()=>setPg("activity")} style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>View all →</button>
                  </div>
                  {scheduledTasks.length===0?(
                    <div style={{padding:16,textAlign:"center",color:c.so,fontSize:12}}>No scheduled tasks yet</div>
                  ):scheduledTasks.slice(0,3).map((task,i)=>{
                    const typeIc={content:null,email:null,research:null,crm:null,custom:null}[task.taskType]||null;
                    return(
                      <div key={task.taskId} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<Math.min(scheduledTasks.length,3)-1?"1px solid "+c.ln+"40":"none"}}>
                        <span>{typeIc}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:task.enabled?c.tx:c.so}}>{task.name}</div>
                          <div style={{fontSize:11,color:c.so}}>{fmtFreq(task.frequency)} at {task.runTime||"9:00"}</div>
                        </div>
                        <span style={{fontSize:11,color:task.enabled?c.gr:c.fa}}>{task.enabled?"Active":"Paused"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══ FILES — Approved deliverables library ══ */}
          {pg==="artifacts"&&(
            <div style={{padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:1000,margin:"0 auto"}}>
              <div style={{marginBottom:16,display:"flex",flexDirection:mob?"column":"row",gap:12,alignItems:mob?"stretch":"center",justifyContent:"space-between"}}>
                <div>
                  <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:4}}>Files & Deliverables</h1>
                  <p style={{fontSize:13,color:c.so}}>{conferenceMode?'All content from your team':'All content '+aFN+' has created for you'}</p>
                </div>
                <input value={filesSearch||''} onChange={e=>setFilesSearch(e.target.value)} placeholder="Search files..." style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid "+c.ln,fontSize:13,fontFamily:"inherit",background:c.inp,color:c.tx,width:mob?"100%":240}}/>
              </div>
              {filesLoading ? (
                <div style={{textAlign:"center",padding:40,color:c.so}}>Loading files...</div>
              ) : files.length === 0 ? (
                <div style={{textAlign:"center",padding:60,color:c.so,background:c.cd,borderRadius:16,border:"1px solid "+c.ln}}>
                  
                  <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:6}}>No files yet</div>
                  <div style={{fontSize:13}}>Ask {aFN} to create content — blog posts, email campaigns, SOPs, reports — and they'll appear here.</div>
                </div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(auto-fill, minmax(280px, 1fr))",gap:14}}>
                  {files.filter(f=>!filesSearch||f.name?.toLowerCase().includes(filesSearch.toLowerCase())||f.description?.toLowerCase().includes(filesSearch.toLowerCase())).map((f)=>{
                    const ext=(f.name||'').split('.').pop()?.toLowerCase()||'';
                    const icon=f.fileType==='image'?'🖼️':ext==='html'?'🌐':ext==='md'?'📝':ext==='js'||ext==='py'?'💻':ext==='pdf'?'📄':'📎';
                    const sizeStr=f.fileSize>1048576?`${(f.fileSize/1048576).toFixed(1)}MB`:f.fileSize>1024?`${(f.fileSize/1024).toFixed(1)}KB`:`${f.fileSize||0}B`;
                    const date=f.approvedAt?new Date(f.approvedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
                    return (
                      <div key={f.fileId} style={{background:c.cd,borderRadius:14,border:"1px solid "+c.ln,transition:"border-color .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>
                        {/* Preview area */}
                        <div style={{height:120,background:c.sf,display:"flex",alignItems:"center",justifyContent:"center",borderBottom:"1px solid "+c.ln,cursor:"pointer",position:"relative",overflow:"hidden"}}
                          onClick={async()=>{
                            if(f.fileType==='image'){
                              setChatLightbox({src:f.storagePath||f.previewUrl||`/api/files/preview/${f.fileId}`,alt:f.name});
                              return;
                            }
                            try{
                              const pr=await fetch(`/api/files/preview/${f.fileId}`, await withAuth());
                              if(pr.headers.get('content-type')?.includes('json')){
                                const pd=await pr.json();
                                setPreviewFile({name:f.name,content:pd.content||'No content',fileId:f.fileId,fileType:f.fileType,slug:f.slug||null});
                              } else {
                                setPreviewFile({name:f.name,content:'Binary file — use Download button',fileId:f.fileId,fileType:f.fileType});
                              }
                            }catch{setPreviewFile({name:f.name,content:'Failed to load preview',fileId:f.fileId});}
                          }}>
                          {f.fileType==='image' ? (
                            <img src={f.storagePath||`/api/files/preview/${f.fileId}`} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover",cursor:"zoom-in"}}/>
                          ) : ext==='html' ? (
                            /* Website preview — scaled iframe thumbnail */
                            f.content ? (
                              <div style={{position:'absolute',inset:0,overflow:'hidden',background:'#fff'}}>
                                <iframe
                                  srcDoc={f.content}
                                  title={f.name}
                                  sandbox="allow-same-origin"
                                  scrolling="no"
                                  style={{position:'absolute',top:0,left:0,width:'400%',height:'400%',border:'none',pointerEvents:'none',transform:'scale(0.25)',transformOrigin:'top left',background:'#fff'}}
                                />
                              </div>
                            ) : (
                              /* Content not in list response — fetch it lazily via iframe src */
                              <div style={{position:'absolute',inset:0,overflow:'hidden',background:'#fff'}}>
                                <iframe
                                  src={`/api/files/publish/${f.fileId}`}
                                  title={f.name}
                                  sandbox="allow-same-origin"
                                  scrolling="no"
                                  style={{position:'absolute',top:0,left:0,width:'400%',height:'400%',border:'none',pointerEvents:'none',transform:'scale(0.25)',transformOrigin:'top left',background:'#fff'}}
                                />
                              </div>
                            )
                          ) : (
                            /* Modern SVG icons for other file types */
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="1.5" opacity="0.4">
                              {ext==='md' ? (
                                /* Markdown icon */
                                <>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="7" y1="13" x2="17" y2="13"/>
                                <line x1="7" y1="17" x2="13" y2="17"/>
                                </>
                              ) : ext==='js' || ext==='py' ? (
                                /* Code icon */
                                <>
                                <polyline points="16 18 22 12 16 6"/>
                                <polyline points="8 6 2 12 8 18"/>
                                </>
                              ) : ext==='pdf' ? (
                                /* PDF icon */
                                <>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                </>
                              ) : (
                                /* Default file icon */
                                <>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                </>
                              )}
                            </svg>
                          )}
                          <div style={{position:"absolute",top:8,right:8,padding:"3px 8px",borderRadius:6,background:"rgba(0,0,0,0.5)",color:"#fff",fontSize:10,fontWeight:600}}>{ext.toUpperCase()}</div>
                        </div>
                        {/* Info */}
                        <div style={{padding:"12px 14px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <div style={{fontSize:13,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{f.name}</div>
                            <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:f.status==='approved'?"rgba(52,168,83,0.15)":"rgba(244,162,97,0.15)",color:f.status==='approved'?c.gr:c.ac}}>{f.status==='approved'?'APPROVED':'PENDING'}</span>
                          </div>
                          {f.description&&<div style={{fontSize:11,color:c.so,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.description}</div>}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:10,color:c.fa}}>{sizeStr} · {date||'Just now'}</span>
                            <button onClick={async()=>{if(confirm('Remove?')){await fetch(`/api/files/artifacts/${f.fileId}`, await withAuth({method:'DELETE'});setFiles(p=>p.filter(x=>x.fileId!==f.fileId));}}} style={{width:22,height:22,borderRadius:6,border:'1px solid rgba(234,67,53,0.25)',background:'transparent',cursor:'pointer',fontSize:12,color:'#ea4335',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                          </div>
                          {ext==='html'&&(
                            <div style={{display:'flex',gap:6,marginTop:8}}>
                              <button onClick={async(e)=>{e.stopPropagation();
                                try{
                                  let htmlContent=f.content;
                                  if(!htmlContent){try{const cr=await fetch('/api/files/publish/'+f.fileId, await withAuth());if(cr.ok){htmlContent=await cr.text();}}catch{}}
                                  setPageEditor({fileId:f.fileId,name:f.name,content:htmlContent||''});
                                }catch(err){
                                  console.error('Edit Page failed:',err);
                                  setOauthToast({type:'error',msg:'Edit Page: '+(err.message||'Server unreachable')});
                                  setTimeout(()=>setOauthToast(null),5000);
                                }}} style={{flex:1,padding:'7px 0',borderRadius:8,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',cursor:'pointer',fontSize:11,fontWeight:700,color:'#fff',fontFamily:'inherit'}}>Edit Page</button>
                              {f.slug?<a href={`/p/${f.slug}`} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:'7px 0',borderRadius:8,border:'1px solid '+c.gr,background:c.gr+'12',fontSize:11,fontWeight:700,color:c.gr,textDecoration:'none',textAlign:'center',display:'block'}}>↗ Live</a>:<button onClick={async(e)=>{e.stopPropagation();const slug=prompt('URL slug:\nyoursite.com/p/___',f.name?.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-'));if(!slug)return;const r=await fetch(`/api/files/artifacts/${f.fileId}/publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug})});const d=await r.json();if(d.success){setFiles(p=>p.map(x=>x.fileId===f.fileId?{...x,slug:d.slug,published:true}:x));window.open(`/p/${d.slug}`,'_blank');}else{setOauthToast({type:'error',msg:d.error||'Publish failed'});setTimeout(()=>setOauthToast(null),4000);}}} style={{flex:1,padding:'7px 0',borderRadius:8,border:'1px solid '+c.ac,background:c.ac+'12',cursor:'pointer',fontSize:11,fontWeight:700,color:c.ac,fontFamily:'inherit'}}>Publish</button>}
                              <a href={`/api/files/download/${f.fileId}`} download style={{padding:'7px 10px',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,fontSize:13,color:c.so,textDecoration:'none',display:'flex',alignItems:'center'}}>↓</a>
                            </div>
                          )}
                          {ext!=='html'&&(
                            <div style={{marginTop:8}}><a href={`/api/files/download/${f.fileId}`} download style={{display:'block',textAlign:'center',padding:'7px 0',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,fontSize:11,fontWeight:600,color:c.ac,textDecoration:'none'}}>↓ Download</a></div>
                          )}
                        </div>
                      </div>

                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ PROJECTS — Organize conversations into projects ══ */}
          {pg==="projects"&&(
            selectedProject?(
              /* Project Detail View - Chat Workspace */
              <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
                {/* Header with back button */}
                <div style={{padding:"16px 20px",borderBottom:"1px solid "+c.ln,background:c.cd,display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
                  <button onClick={()=>{setSelectedProject(null);setProjectConversations([]);}} style={{width:36,height:36,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:c.tx}}>←</button>
                  <div style={{flex:1,minWidth:0}}>
                    <h1 style={{fontSize:20,fontWeight:700,color:c.tx,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selectedProject.name}</h1>
                    {selectedProject.description&&<p style={{fontSize:13,color:c.so,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selectedProject.description}</p>}
                  </div>
                  <button onClick={()=>setShowProjectModal(true)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:13,fontWeight:600,color:c.ac}}>+ New project</button>
                </div>

                {/* Conversations list in sidebar-style */}
                <div style={{display:"flex",flex:1,overflow:"hidden"}}>
                  {/* Left sidebar - conversations */}
                  <div style={{width:260,borderRight:"1px solid "+c.ln,background:c.sf,display:"flex",flexDirection:"column",flexShrink:0}}>
                    <div style={{padding:"12px 14px",borderBottom:"1px solid "+c.ln,flexShrink:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:c.so,letterSpacing:"0.5px",textTransform:"uppercase"}}>Conversations ({projectConversations.length})</div>
                    </div>
                    <div style={{flex:1,overflowY:"auto"}}>
                      {projectConversations.length===0?(
                        <div style={{padding:20,textAlign:"center"}}>
                          <div style={{fontSize:13,color:c.so,marginBottom:8}}>No conversations yet</div>
                          <div style={{fontSize:11,color:c.fa}}>Add chats using the three-dot menu</div>
                        </div>
                      ):(
                        projectConversations.map(conv=>(
                          <div key={conv.id} onClick={()=>{loadSession(conv.id);}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid "+c.ln,background:currentSessionId===conv.id?c.cd:"transparent",transition:"background .15s"}} onMouseEnter={e=>{ if(currentSessionId!==conv.id) e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(currentSessionId!==conv.id) e.currentTarget.style.background="transparent"; }}>
                            <div style={{fontSize:13,fontWeight:600,color:c.tx,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conv.title||'Untitled'}</div>
                            <div style={{fontSize:11,color:c.fa}}>
                              {new Date(conv.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} • {conv.message_count||0} msgs
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right main area - chat interface */}
                  <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                    {currentSessionId&&messages.length>0?(
                      /* Show active chat */
                      <>
                        <div style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:16}}>
                          {messages.map((msg,idx)=>(
                            <div key={idx} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                              {msg.role==="user"?(
                                <>
                                  <label style={{width:30,height:30,borderRadius:8,background:userImg?"transparent":"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden"}}>
                                    {userImg?<img src={userImg} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:meInitial}
                                  </label>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:13,fontWeight:600,color:c.tx,marginBottom:4}}>You</div>
                                    <div style={{fontSize:15,color:c.tx,lineHeight:1.5}}>{msg.text}</div>
                                  </div>
                                </>
                              ):(
                                <>
                                  <Face sz={30} agent={agent}/>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:13,fontWeight:600,color:c.tx,marginBottom:4}}>{agent.nm}</div>
                                    <div style={{fontSize:15,color:c.tx,lineHeight:1.5}}><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown></div>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                          <div ref={btm}/>
                        </div>
                        <div style={{padding:"12px 16px",borderTop:"1px solid "+c.ln,background:c.cd,flexShrink:0}}>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            <textarea value={tx} onChange={e=>setTx(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}} placeholder="Message..." rows={2} style={{flex:1,padding:"10px 12px",borderRadius:10,border:"1.5px solid "+c.ln,fontSize:14,fontFamily:"inherit",background:c.inp,color:c.tx,resize:"none"}}/>
                            <button onClick={doSend} disabled={!tx.trim()||loading} style={{padding:"10px 18px",borderRadius:10,border:"none",cursor:tx.trim()&&!loading?"pointer":"not-allowed",background:tx.trim()&&!loading?c.gradient:c.sf,color:tx.trim()&&!loading?"#fff":c.fa,fontSize:13,fontWeight:700}}>Send</button>
                          </div>
                        </div>
                      </>
                    ):(
                      /* Empty state - start a chat */
                      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:40}}>
                        <div style={{textAlign:"center",maxWidth:400}}>
                          <div style={{fontSize:16,fontWeight:600,color:c.tx,marginBottom:8}}>Start a chat to keep conversations organized</div>
                          <div style={{fontSize:13,color:c.so,marginBottom:20}}>Chats in this project will be saved here</div>
                          <button onClick={()=>newSession()} style={{padding:"10px 20px",borderRadius:10,border:"none",background:c.gradient,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Start new chat</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ):(
            /* Project List View */
            <div style={{padding:mob?"16px 12px 40px":"32px 40px 60px",maxWidth:1200,margin:"0 auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32}}>
                <h1 style={{fontSize:mob?24:32,fontWeight:700,color:c.tx}}>Projects</h1>
                <button onClick={()=>setShowProjectModal(true)} style={{padding:"10px 20px",borderRadius:10,border:"none",background:c.ac,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>+</span> New project
                </button>
              </div>

              {/* Loading state */}
              {loadingProjects&&(
                <div style={{textAlign:"center",padding:60,color:c.so}}>
                  <div style={{fontSize:14}}>Loading projects...</div>
                </div>
              )}

              {/* Empty state */}
              {!loadingProjects&&projects.length===0&&(
                <div style={{textAlign:"center",padding:60}}>
                  <div style={{fontSize:48,marginBottom:16}}>📁</div>
                  <div style={{fontSize:16,color:c.tx,marginBottom:8,fontWeight:600}}>No projects yet</div>
                  <div style={{fontSize:13,color:c.so}}>Create your first project to organize conversations</div>
                </div>
              )}

              {/* Projects grid */}
              {!loadingProjects&&projects.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(auto-fill, minmax(320px, 1fr))",gap:20}}>
                  {projects.map((proj)=>(
                    <div key={proj.id} onClick={async()=>{
                      setSelectedProject(proj);
                      // Fetch conversations for this project
                      try{
                        const res=await fetch(`/api/chat/sessions?projectId=${proj.id}`, await withAuth());
                        const data=await res.json();
                        setProjectConversations(data.sessions||[]);
                      }catch(err){
                        console.error('Failed to load project conversations:',err);
                        setProjectConversations([]);
                      }
                    }} style={{padding:24,borderRadius:16,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=c.ac;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.08)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=c.ln;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        <h3 style={{fontSize:16,fontWeight:700,color:c.tx,margin:0}}>{proj.name}</h3>
                      </div>
                      <p style={{fontSize:13,color:c.so,marginBottom:16,lineHeight:1.5}}>{proj.description||'No description'}</p>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{fontSize:11,color:c.fa}}>
                          {new Date(proj.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                        </div>
                        <div style={{fontSize:11,color:c.fa}}>
                          {(typeof proj.conversation_count === 'number' ? proj.conversation_count : 0)} {((typeof proj.conversation_count === 'number' ? proj.conversation_count : 0)===1)?'chat':'chats'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{marginTop:40,padding:24,borderRadius:16,background:c.sf,border:"1px solid "+c.ln,textAlign:"center"}}>
                <div style={{fontSize:14,color:c.so,marginBottom:8}}>💡 Tip: Projects help you organize related conversations</div>
                <div style={{fontSize:12,color:c.fa}}>Create a project to group chats by client, campaign, or topic</div>
              </div>

              {/* Project Creation Modal */}
              {showProjectModal&&(
                <div onClick={()=>setShowProjectModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}>
                  <div onClick={(e)=>e.stopPropagation()} style={{background:c.bg,borderRadius:16,padding:32,maxWidth:500,width:"100%",border:"1px solid "+c.ln,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                    <h2 style={{fontSize:24,fontWeight:700,color:c.tx,marginBottom:24}}>Create New Project</h2>
                    
                    <div style={{marginBottom:20}}>
                      <label style={{display:"block",fontSize:13,fontWeight:600,color:c.tx,marginBottom:8}}>Project Name *</label>
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e)=>setNewProjectName(e.target.value)}
                        placeholder="e.g., Q1 Marketing Campaign"
                        autoFocus
                        style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,color:c.tx,fontSize:14,fontFamily:"inherit",outline:"none"}}
                        onFocus={(e)=>e.target.style.borderColor=c.ac}
                        onBlur={(e)=>e.target.style.borderColor=c.ln}
                      />
                    </div>

                    <div style={{marginBottom:32}}>
                      <label style={{display:"block",fontSize:13,fontWeight:600,color:c.tx,marginBottom:8}}>Description (optional)</label>
                      <textarea
                        value={newProjectDesc}
                        onChange={(e)=>setNewProjectDesc(e.target.value)}
                        placeholder="What is this project about?"
                        rows={3}
                        style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,color:c.tx,fontSize:14,fontFamily:"inherit",outline:"none",resize:"vertical"}}
                        onFocus={(e)=>e.target.style.borderColor=c.ac}
                        onBlur={(e)=>e.target.style.borderColor=c.ln}
                      />
                    </div>

                    <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
                      <button
                        onClick={()=>{setShowProjectModal(false);setNewProjectName('');setNewProjectDesc('');}}
                        style={{padding:"10px 20px",borderRadius:8,border:"1px solid "+c.ln,background:"transparent",color:c.tx,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async()=>{
                          if(!newProjectName.trim()){
                            setOauthToast({type:'error',msg:'Please enter a project name'}); setTimeout(()=>setOauthToast(null),3000);
                            return;
                          }
                          try {
                            const res=await fetch('/api/projects', await withAuth({
                              method:'POST',
                              headers:{'Content-Type':'application/json'},
                              body:JSON.stringify({name:newProjectName.trim(),description:newProjectDesc.trim()||''})
                            });
                            const data=await res.json();
                            if(data.success){
                              setProjects([data.project,...projects]);
                              setShowProjectModal(false);
                              setNewProjectName('');
                              setNewProjectDesc('');
                            }else{
                              setOauthToast({type:'error',msg:'Failed to create project: '+(data.error||'Unknown error')}); setTimeout(()=>setOauthToast(null),4000);
                            }
                          }catch(err){
                            setOauthToast({type:'error',msg:'Error: '+err.message}); setTimeout(()=>setOauthToast(null),4000);
                          }
                        }}
                        disabled={!newProjectName.trim()}
                        style={{padding:"10px 20px",borderRadius:8,border:"none",background:newProjectName.trim()?c.ac:"#ccc",color:"#fff",fontSize:14,fontWeight:600,cursor:newProjectName.trim()?"pointer":"not-allowed",fontFamily:"inherit",opacity:newProjectName.trim()?1:0.5}}
                      >
                        Create Project
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )
          )}

          {/* ══ CUSTOMIZE — Connectors & Skills ══ */}
          {pg==="customize"&&(
            <div style={{padding:mob?"16px 12px 40px":"32px 40px 60px",maxWidth:960,margin:"0 auto"}}>
              <div style={{marginBottom:32}}>
                <h1 style={{fontSize:mob?24:32,fontWeight:700,color:c.tx,marginBottom:8}}>Customize</h1>
                <p style={{fontSize:14,color:c.so}}>Connect the tools {aFN} can use — they'll have access to them automatically in every conversation.</p>
              </div>

              {/* ── CONNECTORS GRID ── */}
              <div style={{marginBottom:40}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div style={{fontSize:16,fontWeight:700,color:c.tx}}>Your Connectors</div>
                  <div style={{fontSize:12,color:c.so}}>Connect once — {aFN} uses them automatically</div>
                </div>
                {[
                  {cat:"CRM & Communication",items:[
                    {name:"GoHighLevel",slug:"ghl",icon:<img src="https://www.google.com/s2/favicons?domain=gohighlevel.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Contacts, pipelines, SMS, email, automation",connected:true},
                    {name:"Salesforce",slug:"salesforce",icon:<img src="https://www.google.com/s2/favicons?domain=salesforce.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"CRM, deals, leads, accounts, reports"},
                    {name:"HubSpot",slug:"hubspot",icon:<img src="https://www.google.com/s2/favicons?domain=hubspot.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Marketing, sales, service hub"},
                  ]},
                  {cat:"Email & Calendar",items:[
                    {name:"Gmail",slug:"gmail",icon:<img src="https://www.google.com/s2/favicons?domain=gmail.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Read, send, and manage email"},
                    {name:"Google Calendar",slug:"google-calendar",icon:<img src="https://www.google.com/s2/favicons?domain=calendar.google.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Events, scheduling, availability"},
                  ]},
                  {cat:"Social Media",items:[
                    {name:"Instagram",slug:"instagram",icon:<img src="https://www.google.com/s2/favicons?domain=instagram.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Posts, stories, DMs, analytics"},
                    {name:"TikTok",slug:"tiktok",icon:<img src="https://www.google.com/s2/favicons?domain=tiktok.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Videos, analytics, scheduling"},
                    {name:"LinkedIn",slug:"linkedin",icon:<img src="https://www.google.com/s2/favicons?domain=linkedin.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Posts, connections, outreach"},
                    {name:"Facebook",slug:"facebook",icon:<img src="https://www.google.com/s2/favicons?domain=facebook.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Pages, posts, ads"},
                  ]},
                  {cat:"Storage & Productivity",items:[
                    {name:"Google Drive",slug:"google-drive",icon:<img src="https://www.google.com/s2/favicons?domain=drive.google.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Files, docs, sheets, slides"},
                    {name:"Notion",slug:"notion",icon:<img src="https://www.google.com/s2/favicons?domain=notion.so&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Docs, databases, wikis"},
                    {name:"Slack",slug:"slack",icon:<img src="https://www.google.com/s2/favicons?domain=slack.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Channels, messages, files"},
                    {name:"Airtable",slug:"airtable",icon:<img src="https://www.google.com/s2/favicons?domain=airtable.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Databases, views, automations"},
                    {name:"Canva",slug:"canva",icon:<img src="https://www.google.com/s2/favicons?domain=canva.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Designs, brand kits, exports"},
                  ]},
                  {cat:"E-Commerce & Billing",items:[
                    {name:"Shopify",slug:"shopify",icon:<img src="https://www.google.com/s2/favicons?domain=shopify.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Orders, products, inventory"},
                    {name:"Stripe",slug:"stripe",icon:<img src="https://www.google.com/s2/favicons?domain=stripe.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Payments, subscriptions, invoices"},
                  ]},
                  {cat:"Automation",items:[
                    {name:"n8n",slug:"n8n",icon:<img src="https://www.google.com/s2/favicons?domain=n8n.io&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"Workflows, triggers, automations"},
                    {name:"Zapier",slug:"zapier",icon:<img src="https://www.google.com/s2/favicons?domain=zapier.com&sz=64" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"App integrations, zaps"},
                  ]},
                  {cat:"BLOOM",items:[
                    {name:"BLOOMSHIELD",slug:"bloomshield",icon:<img src="/favicon.ico" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />,desc:"IP protection, blockchain registry"},
                  ]},
                ].map(({cat,items})=>(
                  <div key={cat} style={{marginBottom:28}}>
                    <div style={{fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>{cat}</div>
                    <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
                      {items.map(item=>{ const isConn=!!(activeConnectors[item.slug]); return (
                        <div key={item.slug} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:12,border:"1.5px solid "+(isConn?c.ac+"55":c.ln),background:isConn?c.ac+"08":c.cd,transition:"all .2s"}} onMouseEnter={e=>{if(!isConn)e.currentTarget.style.borderColor=c.ac+"44";}} onMouseLeave={e=>{if(!isConn)e.currentTarget.style.borderColor=isConn?c.ac+"55":c.ln;}}>
                          <div style={{width:40,height:40,borderRadius:10,background:isConn?"linear-gradient(135deg,#F4A261,#E76F8B)":c.sf,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:isConn?"#fff":c.so,overflow:"hidden"}}>{item.icon}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:c.tx,marginBottom:2}}>{item.name}</div>
                            <div style={{fontSize:11,color:c.so,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.desc}</div>
                          </div>
                          {isConn?(
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                              <div style={{fontSize:10,fontWeight:700,color:c.ac,background:c.ac+"18",padding:"2px 8px",borderRadius:20}}>Connected</div>
                              <button onClick={e=>e.stopPropagation()} style={{fontSize:10,color:c.fa,background:"none",border:"none",cursor:"pointer",padding:"2px 4px"}}>Disconnect</button>
                            </div>
                          ):(
                            <button onClick={e=>{e.stopPropagation();const orgId=meProfile?.orgId||"a1000000-0000-0000-0000-000000000001";window.location.href=`/oauth/connect/${item.slug}?orgId=${orgId}`;}}
                              style={{padding:"7px 14px",borderRadius:8,border:"1.5px solid #F4A261",background:"transparent",cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",transition:"all .15s",fontSize:12,fontWeight:700}}
                              onMouseEnter={e=>{e.currentTarget.style.background="linear-gradient(135deg,#F4A261,#E76F8B)";e.currentTarget.style.borderColor="transparent";e.currentTarget.querySelector("span").style.WebkitTextFillColor="#fff";e.currentTarget.querySelector("span").style.backgroundImage="none";}}
                              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="#F4A261";e.currentTarget.querySelector("span").style.WebkitTextFillColor="transparent";e.currentTarget.querySelector("span").style.backgroundImage="linear-gradient(135deg,#F4A261,#E76F8B)";}}>
                              <span style={{background:"linear-gradient(135deg,#F4A261,#E76F8B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",fontWeight:700,fontSize:12}}>Connect</span>
                            </button>
                          )}
                        </div>
                      ); })}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── SKILLS ── */}
              <div style={{borderTop:"1px solid "+c.ln,paddingTop:28}}>
                <div style={{fontSize:16,fontWeight:700,color:c.tx,marginBottom:14}}>Skills</div>
                <div onClick={()=>{setOauthToast({type:'success',msg:'🎯 Skills marketplace coming soon!'}); setTimeout(()=>setOauthToast(null),3000);}} style={{padding:24,borderRadius:14,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=c.ac;e.currentTarget.style.transform="translateX(4px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=c.ln;e.currentTarget.style.transform="translateX(0)";}}>
                  <div style={{display:"flex",alignItems:"center",gap:16}}>
                    <div style={{width:44,height:44,borderRadius:12,background:c.sf,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.ac} strokeWidth="2" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:3}}>Create new skills</div>
                      <div style={{fontSize:12,color:c.so}}>Teach {aFN} your processes, team norms, and expertise — they'll follow them on every task.</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ SETTINGS — Jaden's layout, Sarah's details ══ */}
          {pg==="settings"&&(
            <div style={{padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:800,margin:"0 auto"}}>
              <div style={{marginBottom:24}}>
                <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>Settings</h1>
                <p style={{fontSize:13,color:c.so}}>Configure {aFN} and your Bloomie experience</p>
              </div>
              <div style={{display:"flex",flexDirection:mob?"column":"row",background:c.cd,borderRadius:16,border:"1px solid "+c.ln,overflow:"hidden"}}>
                <div style={{padding:mob?"10px 16px":"16px",borderRight:mob?"none":"1px solid "+c.ln,borderBottom:mob?"1px solid "+c.ln:"none",display:"flex",flexDirection:mob?"row":"column",gap:mob?4:2,flexShrink:0,overflowX:mob?"auto":"visible"}}>
                  {["General","Connection","Interface"].map(t=>(
                    <button key={t} onClick={()=>setStab(t)} style={{padding:mob?"8px 14px":"10px 16px",borderRadius:10,border:"none",cursor:"pointer",background:stab===t?c.ac+"12":"transparent",fontSize:13,fontWeight:stab===t?600:500,color:stab===t?c.tx:c.so,textAlign:"left",whiteSpace:"nowrap"}}>{t}</button>
                  ))}
                </div>
                <div style={{flex:1,padding:20}}>
                  {stab==="General"&&(
                    <div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Theme</div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>setDark(false)} style={{flex:1,padding:"10px 14px",borderRadius:10,border:dark?"1px solid "+c.ln:"2px solid "+c.ac,background:dark?"transparent":c.ac+"12",cursor:"pointer",fontSize:13,fontWeight:600,color:dark?c.so:c.ac}}>☀️ Light</button>
                          <button onClick={()=>setDark(true)} style={{flex:1,padding:"10px 14px",borderRadius:10,border:dark?"2px solid "+c.ac:"1px solid "+c.ln,background:dark?c.ac+"12":"transparent",cursor:"pointer",fontSize:13,fontWeight:600,color:dark?c.ac:c.so}}>🌙 Dark</button>
                        </div>
                      </div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Agent Identity</div>
                        <div style={{padding:"12px 14px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:12}}>
                          <Face sz={44} agent={agent}/>
                          <div>
                            <div style={{fontSize:14,fontWeight:700,color:c.tx}}>{agent.nm}</div>
                            <div style={{fontSize:12,color:c.so}}>Marketing & Operations Executive</div>
                            <div style={{fontSize:11,color:c.gr,marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                              <span style={{width:6,height:6,borderRadius:"50%",background:c.gr}}/>Level 1 Assistant · 60 GHL Tools
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Security</div>
                        <div style={{padding:"14px 16px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:c.tx}}>Trust Gate</div>
                              <div style={{fontSize:11,color:c.so,marginTop:2}}>When enabled, restricts tool access based on permission levels. When disabled, all tools are unrestricted.</div>
                            </div>
                            <button onClick={toggleTrustGate} disabled={tgLoading} style={{width:48,height:26,borderRadius:13,border:"none",cursor:tgLoading?"wait":"pointer",background:tgEnabled?"#22c55e":"#94a3b8",position:"relative",transition:"background 0.2s",flexShrink:0,marginLeft:16}}>
                              <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:tgEnabled?25:3,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                            </button>
                          </div>
                          <div style={{fontSize:11,color:tgEnabled?c.gr:"#f59e0b",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:tgEnabled?c.gr:"#f59e0b"}}/>
                            {tgEnabled?"Enabled — tools restricted by permission level":"Disabled — all tools unrestricted"}
                          </div>
                        </div>
                      </div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Change Password</div>
                        <PwChangePanel c={c}/>
                      </div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Bloomie OS — AI Model</div>
                        <div style={{padding:"14px 16px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln}}>
                          {modelConfig?(
                            <>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                                <div>
                                  <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{modelConfig.model}</div>
                                  <div style={{fontSize:11,color:c.so,marginTop:2}}>Tier: {modelConfig.tier} · {modelConfig.reason}</div>
                                </div>
                                <div style={{width:8,height:8,borderRadius:"50%",background:c.gr,flexShrink:0}}/>
                              </div>
                              {isOwner?(
                                <select value={modelConfig.model} onChange={e=>updateModel(e.target.value)} disabled={modelSaving} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid "+c.ln,background:c.cd,fontSize:12,color:c.tx,cursor:modelSaving?"wait":"pointer",marginTop:8}}>
                                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (fast, low cost)</option>
                                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (advanced)</option>
                                  <option value="gpt-4o">GPT-4o (OpenAI)</option>
                                  <option value="gpt-4o-mini">GPT-4o Mini (budget)</option>
                                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Anthropic)</option>
                                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                                  <option value="claude-opus-4-6">Claude Opus 4.6 (premium)</option>
                                  <option value="deepseek-chat">DeepSeek Chat</option>
                                </select>
                              ):(
                                <div style={{fontSize:11,color:c.so,marginTop:4,fontStyle:"italic"}}>Model selection is managed by your account administrator</div>
                              )}
                              {modelConfig.failoverChain?.length>0&&(
                                <div style={{fontSize:11,color:c.so,marginTop:8}}>Failover: {modelConfig.failoverChain.join(" → ")}</div>
                              )}
                            </>
                          ):(
                            <div style={{fontSize:12,color:c.so}}>Loading model config...</div>
                          )}
                        </div>
                      </div>
                      <div style={{marginBottom:28}}>
                        <div style={{padding:"14px 16px",borderRadius:12,background:c.cd,border:"1px solid "+c.ln}}>
                          <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Image Generation Engines</div>
                          <div style={{fontSize:11,color:c.so,marginBottom:12}}>Choose which AI engine generates images for each content type. GPT = best for flyers/graphics with text. Gemini = best for photorealistic people shots.</div>
                          {imgEngineConfig?(<>
                            {[
                              {key:'blog',label:'Blog Hero Images'},
                              {key:'flyer',label:'Flyers & Print'},
                              {key:'website',label:'Website & Landing Pages'},
                              {key:'social',label:'Social Media'},
                              {key:'email',label:'Email'},
                              {key:'default',label:'Everything Else'}
                            ].map(({key:k,label:l})=>(
                              <div key={k} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                                <div style={{fontSize:12,color:c.tx}}>{l}</div>
                                {isOwner?(
                                  <select value={imgEngineConfig[k]||'auto'} onChange={e=>updateImgEngine(k,e.target.value)} disabled={imgEngineSaving} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,fontSize:11,color:c.tx,cursor:imgEngineSaving?"wait":"pointer",minWidth:100}}>
                                    <option value="auto">Auto</option>
                                    <option value="gpt">GPT Image</option>
                                    <option value="gemini">Gemini / Nano Banana</option>
                                  </select>
                                ):(
                                  <div style={{fontSize:11,color:c.so,fontStyle:"italic"}}>{imgEngineConfig[k]||'auto'}</div>
                                )}
                              </div>
                            ))}
                          </>):(
                            <div style={{fontSize:12,color:c.so}}>Loading...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {stab==="Connection"&&(
                    <div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>{aFN}'s API</div>
                        <div style={{padding:"12px 14px",borderRadius:10,background:connected?c.gf:"#fef2f2",border:"1px solid "+(connected?c.gr+"30":"#fecaca")}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <span style={{width:8,height:8,borderRadius:"50%",background:connected?c.gr:"#ef4444",animation:connected?"pulse 1.5s ease infinite":"none"}}/>
                            <span style={{fontSize:13,fontWeight:600,color:connected?c.gr:"#dc2626"}}>{connected?"Connected":"Disconnected"}</span>
                          </div>
                          <div style={{fontSize:11,color:c.so,fontFamily:"monospace"}}>autonomous-sarah-rodriguez-production.up.railway.app</div>
                          <div style={{fontSize:11,color:c.so,marginTop:4}}>SSE real-time stream active</div>
                        </div>
                      </div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>GHL Integration</div>
                        <div style={{padding:"12px 14px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln,fontSize:13,color:c.so}}>60 GHL v2 API tools active · Location ID configured</div>
                      </div>
                      <SiteLoginsManager c={c} mob={mob} aFN={aFN}/>
                    </div>
                  )}
                  {stab==="Interface"&&(
                    <div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Screen Viewer</div>
                        <select value={scrM} onChange={e=>setScrM(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid "+c.ln,background:c.sf,fontSize:13,color:c.tx,cursor:"pointer"}}>
                          <option value="docked">Docked (side panel)</option>
                          <option value="pop">Pop-out window</option>
                          <option value="hidden">Hidden</option>
                        </select>
                      </div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Sidebar</div>
                        <select value={sbO} onChange={e=>setSbO(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid "+c.ln,background:c.sf,fontSize:13,color:c.tx,cursor:"pointer"}}>
                          <option value="full">Full sidebar</option>
                          <option value="mini">Mini (icons only)</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ DOCUMENTS ══ */}
          {pg==="docs"&&(
            <DocsPage c={c} mob={mob} aFN={aFN} agentId={currentAgentId}/>
          )}

          {/* ══ BILLING ══ */}
          {pg==="billing"&&(<BillingPage c={c} mob={mob} aFN={aFN}/>)}
          {pg==="business"&&(<BusinessProfilePage c={c} mob={mob} userImg={userImg} setUserImg={setUserImg} meInitial={meInitial} aFN={aFN} chatLightbox={chatLightbox} setChatLightbox={setChatLightbox}/>)}
          {pg==="skills"&&(<SkillsPage c={c} mob={mob} aFN={aFN}/>)}
          {pg==="dispatch"&&(<DispatchPage c={c} mob={mob} currentAgent={currentAgent} agentImgUrl={agentImgUrl}/>)}
          {pg==="mobile"&&(
            <div style={{padding:mob?"20px 16px 60px":"32px 40px 60px",maxWidth:680,margin:"0 auto"}}>

              {/* Header */}
              <div style={{marginBottom:28}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                  <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                  </div>
                  <div>
                    <h1 style={{fontSize:mob?22:26,fontWeight:700,color:c.tx,margin:0}}>BLOOM Mobile</h1>
                    <p style={{fontSize:13,color:c.so,margin:0}}>Your Bloomie on your phone — no App Store needed</p>
                  </div>
                </div>
              </div>

              {/* Agent card */}
              <div style={{padding:20,borderRadius:16,background:c.cd,border:"1px solid "+c.ln,marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
                {agentImgUrl
                  ?<img src={agentImgUrl} alt={agent.nm} style={{width:56,height:56,borderRadius:14,objectFit:"cover",border:"2px solid "+c.ln,flexShrink:0}}/>
                  :<div style={{width:56,height:56,borderRadius:14,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>{agent.nm.charAt(0)}</div>
                }
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:16,fontWeight:700,color:c.tx}}>{agent.nm}</div>
                  <div style={{fontSize:12,color:c.so,marginTop:2}}>{currentAgent?.job_title||currentAgent?.role||"Your AI Employee"}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginTop:4}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#34a853",animation:"pulse 1.5s ease infinite"}}/>
                    <span style={{fontSize:11,color:"#34a853",fontWeight:600}}>Available on mobile</span>
                  </div>
                </div>
              </div>

              {/* On mobile — show install prompt directly */}
              {mob?(
                <div style={{padding:24,borderRadius:16,background:c.cd,border:"1px solid "+c.ln,marginBottom:16}}>
                  <div style={{fontSize:16,fontWeight:700,color:c.tx,marginBottom:8}}>You are already on your phone</div>
                  <div style={{fontSize:13,color:c.so,marginBottom:20,lineHeight:1.6}}>Add {aFN} to your home screen and open it like a native app — no App Store, no login screen each time.</div>
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <div style={{padding:16,borderRadius:12,background:c.sf,border:"1px solid "+c.ln}}>
                      <div style={{fontSize:13,fontWeight:700,color:c.tx,marginBottom:6}}>iPhone</div>
                      <div style={{fontSize:12,color:c.so,lineHeight:1.7}}>
                        1. Tap the <strong style={{color:c.tx}}>Share icon</strong> at the bottom of Safari<br/>
                        2. Scroll down and tap <strong style={{color:c.tx}}>Add to Home Screen</strong><br/>
                        3. Tap <strong style={{color:c.tx}}>Add</strong> — done
                      </div>
                    </div>
                    <div style={{padding:16,borderRadius:12,background:c.sf,border:"1px solid "+c.ln}}>
                      <div style={{fontSize:13,fontWeight:700,color:c.tx,marginBottom:6}}>Android</div>
                      <div style={{fontSize:12,color:c.so,lineHeight:1.7}}>
                        1. Tap the <strong style={{color:c.tx}}>three-dot menu</strong> in Chrome<br/>
                        2. Tap <strong style={{color:c.tx}}>Add to Home screen</strong><br/>
                        3. Tap <strong style={{color:c.tx}}>Add</strong> — done
                      </div>
                    </div>
                  </div>
                </div>
              ):(
                /* On desktop — show QR + instructions to send to phone */
                <div style={{padding:24,borderRadius:16,background:c.cd,border:"1px solid "+c.ln,marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:4}}>Send to your phone</div>
                  <div style={{fontSize:12,color:c.so,marginBottom:20}}>Scan the QR code or copy the link and open it on your phone. Then add it to your home screen.</div>
                  <div style={{display:"flex",gap:24,alignItems:"flex-start",flexWrap:"wrap"}}>
                    <div style={{textAlign:"center",flexShrink:0}}>
                      <div style={{width:160,height:160,borderRadius:12,border:"1px solid "+c.ln,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                        <QRCanvas url={window.location.origin+'/mobile'} size={140}/>
                      </div>
                      <div style={{fontSize:10,color:c.so,marginTop:6}}>Scan with your phone camera</div>
                    </div>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Or copy the link</div>
                      <div style={{display:"flex",gap:6,marginBottom:16}}>
                        <div style={{flex:1,padding:"10px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.sf,fontSize:12,fontFamily:"monospace",color:c.ac,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{window.location.origin+'/mobile'}</div>
                        <button onClick={()=>{navigator.clipboard?.writeText(window.location.origin+'/mobile');setOauthToast({type:"success",msg:"Link copied"});setTimeout(()=>setOauthToast(null),2000);}} style={{padding:"10px 16px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",fontFamily:"inherit",flexShrink:0}}>Copy</button>
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Share via</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {[
                          {label:"Text",href:"sms:?body="+encodeURIComponent("Chat with "+aFN+" from your phone: "+window.location.origin+'/mobile')},
                          {label:"Email",href:"mailto:?subject="+encodeURIComponent("Chat with "+aFN)+"&body="+encodeURIComponent("Open this link on your phone and add it to your home screen: "+window.location.origin+'/mobile')},
                          {label:"WhatsApp",href:"https://wa.me/?text="+encodeURIComponent("Chat with "+aFN+" from your phone: "+window.location.origin+'/mobile')},
                        ].map((s,i)=>(
                          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:12,fontWeight:600,color:c.tx,textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>{s.label}</a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* What you can do */}
              <div style={{padding:16,borderRadius:12,background:"linear-gradient(135deg,rgba(244,162,97,0.06),rgba(231,111,139,0.06))",border:"1px solid rgba(244,162,97,0.2)"}}>
                <div style={{fontSize:13,fontWeight:700,color:c.ac,marginBottom:8}}>What you can do from your phone</div>
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:6}}>
                  {["Give "+aFN+" tasks from anywhere","Check what "+aFN+" is working on","Approve content before it goes out","Review files "+aFN+" created","Start new conversations","Access your full chat history"].map((item,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:c.so}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:c.ac,flexShrink:0}}/>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
      {scrM==="pop"&&<Screen c={c} mob={mob} mode="pop" setMode={setScrM} aFN={aFN}/>}
      {scrM==="full"&&<Screen c={c} mob={mob} mode="full" setMode={setScrM} aFN={aFN}/>}

      {/* ── HELP BUBBLE — exact Jaden ── */}
      {/* ══ AGENT PROFILE PANEL ══ */}
      {profileOpen&&(
        <div onClick={()=>{setProfileOpen(false);setEditingProfile(false);setTaskFormOpen(false);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",justifyContent:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:mob?"100%":420,height:"100%",background:c.cd,borderLeft:"1px solid "+c.ln,display:"flex",flexDirection:"column",overflow:"hidden",animation:"slideIn .2s ease"}}>
            {/* Header */}
            <div style={{padding:"20px",background:"linear-gradient(135deg,#F4A261,#E76F8B)",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <Face sz={56} agent={agent}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:20,fontWeight:700,color:"#fff"}}>{agent.nm}</div>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.85)"}}>{profileData?.profile?.jobTitle||'AI Employee'}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#4ade80"}}/>Online
                  </div>
                </div>
                <button onClick={()=>{setProfileOpen(false);setEditingProfile(false);setTaskFormOpen(false);}} style={{width:32,height:32,borderRadius:8,border:"none",background:"rgba(255,255,255,.2)",cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              </div>
              {/* Stats row */}
              {profileData?.stats&&(
                <div style={{display:"flex",gap:16,marginTop:14}}>
                  {[{l:"Messages",v:profileData.stats.messages},{l:"Files",v:profileData.stats.files},{l:"Tasks",v:profileData.stats.activeTasks}].map((s,i)=>(
                    <div key={i} style={{textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>{s.v}</div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,.7)"}}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scrollable content */}
            <div style={{flex:1,overflowY:"auto",padding:"0"}}>
              {/* Job Description */}
              <div style={{padding:"16px 20px",borderBottom:"1px solid "+c.ln}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:700,color:c.tx,textTransform:"uppercase",letterSpacing:"0.5px"}}>Job Description</span>
                  <button onClick={()=>{
                    if(editingProfile){
                      fetch('/api/agent/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobTitle:editTitle,jobDescription:editDesc,agentId:currentAgentId})})
                        .then(()=>loadProfile());
                    }
                    setEditingProfile(!editingProfile);
                  }} style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",fontSize:11,fontWeight:600,color:c.ac}}>
                    {editingProfile?'Save':'Edit'}
                  </button>
                </div>
                {editingProfile?(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="Job title..." style={{padding:"8px 12px",borderRadius:8,border:"1.5px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,fontFamily:"inherit"}}/>
                    <textarea value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="What does this agent do? Describe their responsibilities..." rows={4} style={{padding:"8px 12px",borderRadius:8,border:"1.5px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,fontFamily:"inherit",resize:"vertical"}}/>
                  </div>
                ):(
                  <div>
                    <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:4}}>{profileData?.profile?.jobTitle||'AI Employee'}</div>
                    <div style={{fontSize:13,color:c.so,lineHeight:1.6}}>{profileData?.profile?.jobDescription||'Click Edit to add a job description for this agent.'}</div>
                  </div>
                )}
              </div>

              {/* Scheduled Tasks */}
              <div style={{padding:"16px 20px",borderBottom:"1px solid "+c.ln}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:700,color:c.tx,textTransform:"uppercase",letterSpacing:"0.5px"}}>Scheduled Tasks</span>
                  <button onClick={()=>setTaskFormOpen(!taskFormOpen)} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>
                    {taskFormOpen?'Cancel':'+ Add'}
                  </button>
                </div>

                {/* New task form */}
                {taskFormOpen&&(
                  <div style={{padding:12,borderRadius:10,border:"1px solid "+c.ln,background:c.sf,marginBottom:12}}>
                    <input value={newTask.name} onChange={e=>setNewTask(p=>({...p,name:e.target.value}))} placeholder="Task name..." style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,marginBottom:8,fontFamily:"inherit",boxSizing:"border-box"}}/>
                    <textarea value={newTask.instruction} onChange={e=>setNewTask(p=>({...p,instruction:e.target.value}))} placeholder={"What should "+aFN+" do?"} rows={3} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,marginBottom:8,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <select value={newTask.taskType} onChange={e=>setNewTask(p=>({...p,taskType:e.target.value}))} style={{flex:1,padding:"7px 8px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx}}>
                        <option value="content">Content</option>
                        <option value="email">Email</option>
                        <option value="research">Research</option>
                        <option value="crm">CRM</option>
                        <option value="custom">Custom</option>
                      </select>
                      <select value={newTask.frequency} onChange={e=>setNewTask(p=>({...p,frequency:e.target.value}))} style={{flex:1,padding:"7px 8px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx}}>
                        <option value="every_10_min">Every 10 Min</option>
                        <option value="every_30_min">Every 30 Min</option>
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="weekdays">Weekdays</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <input type="time" value={newTask.runTime} onChange={e=>setNewTask(p=>({...p,runTime:e.target.value}))} style={{width:90,padding:"7px 8px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx}}/>
                    </div>
                    <button onClick={async()=>{
                      if(!newTask.name||!newTask.instruction) return;
                      await fetch('/api/agent/tasks', await withAuth({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newTask)});
                      setNewTask({name:'',instruction:'',taskType:'content',frequency:'daily',runTime:'09:00'});
                      setTaskFormOpen(false);
                      loadProfile();
                    }} disabled={!newTask.name||!newTask.instruction} style={{width:"100%",padding:"9px 0",borderRadius:8,border:"none",background:newTask.name&&newTask.instruction?"linear-gradient(135deg,#34a853,#2d9248)":"#555",cursor:newTask.name&&newTask.instruction?"pointer":"not-allowed",fontSize:13,fontWeight:700,color:"#fff"}}>Create Task</button>
                  </div>
                )}

                {/* Task list */}
                {scheduledTasks.length===0&&!taskFormOpen&&(
                  <div style={{textAlign:"center",padding:"16px 0",color:c.so,fontSize:12}}>No scheduled tasks yet. Add one or tell {aFN} in chat.</div>
                )}
                {scheduledTasks.map(t=>(
                  <div key={t.taskId} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid "+c.ln+"40"}}>
                    <button onClick={async()=>{
                      await fetch(`/api/agent/tasks/${t.taskId}`, await withAuth({method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!t.enabled})});
                      loadProfile();
                    }} style={{width:20,height:20,borderRadius:4,border:"1.5px solid "+(t.enabled?c.gr:c.ln),background:t.enabled?"rgba(52,168,83,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>
                      {t.enabled&&'✓'}
                    </button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:t.enabled?c.tx:c.so,opacity:t.enabled?1:0.5}}>{t.name}</div>
                      <div style={{fontSize:11,color:c.so}}>{fmtFreq(t.frequency)} at {t.runTime || '9:00 AM'}{t.runCount>0?' · ran '+t.runCount+'x':''}</div>
                    </div>
                    <button onClick={async()=>{
                      if(confirm('Delete this task?')){
                        await fetch(`/api/agent/tasks/${t.taskId}`, await withAuth({method:'DELETE'});
                        loadProfile();
                      }
                    }} style={{padding:"2px 6px",borderRadius:4,border:"none",background:"transparent",cursor:"pointer",fontSize:12,color:"#ea4335"}}>✕</button>
                  </div>
                ))}
              </div>

              {/* Connected Tools */}
              <div style={{padding:"16px 20px"}}>
                <div style={{fontSize:13,fontWeight:700,color:c.tx,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Connected Tools</div>
                {(profileData?.connectedTools||[]).map((tool,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<(profileData?.connectedTools?.length||0)-1?"1px solid "+c.ln+"40":"none"}}>
                    <span style={{fontSize:18}}>{tool.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:tool.connected?c.tx:c.so}}>{tool.name}</div>
                      <div style={{fontSize:11,color:c.so}}>{tool.capabilities.join(', ')}</div>
                    </div>
                    <span style={{fontSize:11,fontWeight:600,color:tool.connected?c.gr:"#666"}}>{tool.connected?'✓ Active':'Coming soon'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}


            {/* ══ FILE PREVIEW MODAL ══ */}
      {previewFile&&(
        <div onClick={()=>{setPreviewFile(null);setEditMode(false);setEditorFullscreen(false);}} style={{position:"fixed",inset:0,background:editorFullscreen?"transparent":"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:editorFullscreen?0:mob?8:20}}>
          <div onClick={e=>e.stopPropagation()} style={{width:editorFullscreen?"100%":"100%",maxWidth:editorFullscreen?"100%":previewFile.name?.endsWith('.html')?1100:800,height:editorFullscreen?"100vh":"90vh",background:c.cd,borderRadius:editorFullscreen?0:16,border:editorFullscreen?"none":"1px solid "+c.ln,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:editorFullscreen?"none":"0 20px 60px rgba(0,0,0,.4)",margin:editorFullscreen?0:"auto"}}>
            {/* Header */}
            <div style={{padding:"12px 20px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:8,background:c.sf,flexShrink:0}}>
              <span style={{fontSize:18}}>null</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{previewFile.name}</div>
              </div>
              {/* Mode toggle */}
              <div style={{display:"flex",gap:2,background:c.cd,padding:2,borderRadius:8,border:"1px solid "+c.ln}}>
                <button onClick={()=>setEditMode(false)} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:!editMode?c.ac+"20":"transparent",color:!editMode?c.ac:c.so,fontFamily:"inherit"}}>View</button>
                <button onClick={()=>{setEditMode(true);setEditContent(previewFile.content||'');}} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:editMode?c.ac+"20":"transparent",color:editMode?c.ac:c.so,fontFamily:"inherit"}}>Edit</button>
              </div>
              {editMode?(
                <button onClick={()=>setEditorFullscreen(!editorFullscreen)} style={{padding:"5px 12px",borderRadius:8,border:"none",background:c.gradient,fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>{editorFullscreen?"↙ Exit Full Screen":"↗ Full Screen"}</button>
              ):(
                <a href={previewFile.slug?`/p/${previewFile.slug}`:`/api/files/publish/${previewFile.fileId}`} target="_blank" rel="noopener noreferrer" style={{padding:"5px 12px",borderRadius:8,border:"none",background:c.gradient,fontSize:11,fontWeight:700,color:"#fff",textDecoration:"none"}}>↗ {previewFile.slug?"View Live":"Full Screen"}</a>
              )}
              <button onClick={()=>{setPublishOpen(true);setPublishSlug(previewFile.slug||previewFile.name?.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'');setPublishError('');setPublishedUrl(previewFile.slug?`${window.location.origin}/p/${previewFile.slug}`:null);}} style={{padding:"5px 12px",borderRadius:8,border:previewFile.slug?"1px solid "+c.gr:"1px solid "+c.ac,background:previewFile.slug?c.gr+"15":c.ac+"15",fontSize:11,fontWeight:700,color:previewFile.slug?c.gr:c.ac,cursor:"pointer",fontFamily:"inherit"}}>
                {previewFile.slug?"✓ Published":"Publish"}
              </button>
              <a href={`/api/files/download/${previewFile.fileId}`} download style={{padding:"5px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:11,fontWeight:600,color:c.ac,textDecoration:"none"}}>↓</a>
              <button onClick={()=>{setPreviewFile(null);setEditMode(false);setEditorFullscreen(false);}} style={{width:30,height:30,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>

            {/* Content area */}
            {editMode?(
              <>
                {previewFile.name?.endsWith('.html')?(
                  /* HTML Visual Editor — contentEditable iframe */
                  <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                    <div style={{padding:"8px 16px",borderBottom:"1px solid "+c.ln,background:c.cd,display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:c.so,fontWeight:600}}>Visual Editor</span>
                      <button onClick={()=>{
                        const iframe=document.getElementById('bloom-html-editor');
                        if(iframe?.contentDocument){
                          // Remove editor artifacts before capturing
                          const doc=iframe.contentDocument;
                          doc.querySelectorAll('.bloom-drag-handle').forEach(el=>el.remove());
                          doc.querySelectorAll('.bloom-section').forEach(el=>{el.classList.remove('bloom-section','bloom-dragging','bloom-drag-over');el.removeAttribute('draggable');});
                          // Remove injected style/script
                          doc.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('bloom-drag'))s.remove();});
                          doc.querySelectorAll('script').forEach(s=>{if(s.textContent.includes('designMode'))s.remove();});
                          const html='<!DOCTYPE html>'+doc.documentElement.outerHTML;
                          setEditContent(html);
                        }
                      }} style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:10,fontWeight:600,color:c.tx,fontFamily:"inherit"}}>Sync from visual</button>
                      <button onClick={()=>{setEditMode('code');setEditContent(previewFile.content||'');}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:10,fontWeight:600,color:c.so,fontFamily:"inherit"}}>Switch to Code</button>
                    </div>
                    <iframe
                      id="bloom-html-editor"
                      srcDoc={editContent||previewFile.content||''}
                      onLoad={()=>{
                        try{
                          const iframe=document.getElementById('bloom-html-editor');
                          if(!iframe?.contentDocument)return;
                          const doc=iframe.contentDocument;
                          // Enable editing
                          doc.designMode='on';
                          doc.body.contentEditable='true';
                          // Inject editor styles
                          const style=doc.createElement('style');
                          style.id='bloom-editor-css';
                          style.textContent=`
                            *:hover{outline:2px dashed rgba(244,162,97,0.3)!important;outline-offset:2px}
                            [contenteditable]:focus{outline:2px solid #F4A261!important;outline-offset:2px}
                            .bloom-drag-over{border-top:3px solid #F4A261!important}
                            .bloom-dragging{opacity:0.4!important}
                            .bloom-drag-handle{position:absolute;left:4px;top:4px;width:22px;height:22px;background:#F4A261;border-radius:6px;cursor:grab;display:none;align-items:center;justify-content:center;font-size:11px;color:#fff;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.2)}
                            .bloom-section:hover>.bloom-drag-handle{display:flex}
                            .bloom-section{position:relative}
                          `;
                          doc.head.appendChild(style);
                          // Make sections draggable
                          const sections=Array.from(doc.body.children).filter(el=>!['STYLE','SCRIPT','LINK','BR'].includes(el.tagName));
                          let dragSrc=null;
                          sections.forEach((el,i)=>{
                            el.classList.add('bloom-section');
                            el.setAttribute('draggable','true');
                            if(!el.style.position||el.style.position==='static')el.style.position='relative';
                            const h=doc.createElement('div');
                            h.className='bloom-drag-handle';h.textContent='⠿';h.contentEditable='false';
                            h.onmousedown=()=>{el.draggable=true;};
                            el.insertBefore(h,el.firstChild);
                            el.ondragstart=(e)=>{dragSrc=el;e.dataTransfer.effectAllowed='move';setTimeout(()=>el.classList.add('bloom-dragging'),0);};
                            el.ondragend=()=>{el.classList.remove('bloom-dragging');dragSrc=null;};
                            el.ondragover=(e)=>{e.preventDefault();el.classList.add('bloom-drag-over');};
                            el.ondragleave=()=>el.classList.remove('bloom-drag-over');
                            el.ondrop=(e)=>{e.preventDefault();el.classList.remove('bloom-drag-over');
                              if(dragSrc&&dragSrc!==el){const r=el.getBoundingClientRect();e.clientY<r.top+r.height/2?el.parentNode.insertBefore(dragSrc,el):el.parentNode.insertBefore(dragSrc,el.nextSibling);}
                            };
                          });
                        }catch(e){console.error('Editor init failed:',e);}
                      }}
                      style={{flex:1,width:"100%",border:"none",background:"#fff"}}
                      sandbox="allow-scripts allow-same-origin"
                      title="Visual Editor"
                    />
                  </div>
                ):editMode==='code'||!previewFile.name?.endsWith('.html')?(
                  /* Code/Text Editor */
                  <textarea value={editContent} onChange={e=>setEditContent(e.target.value)} style={{flex:1,width:"100%",padding:"16px 20px",border:"none",background:c.bg,color:c.tx,fontSize:13,fontFamily:"monospace",lineHeight:1.7,resize:"none",boxSizing:"border-box",outline:"none"}}/>
                ):null}

                {/* Edit footer */}
                <div style={{padding:"10px 16px",borderTop:"1px solid "+c.ln,background:c.sf,display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
                  <button onClick={async()=>{
                    setEditSaving(true);
                    let content=editContent;
                    if(previewFile.name?.endsWith('.html')&&editMode!=='code'){
                      const iframe=document.getElementById('bloom-html-editor');
                      if(iframe?.contentDocument){
                        const doc=iframe.contentDocument;
                        doc.querySelectorAll('.bloom-drag-handle').forEach(el=>el.remove());
                        doc.querySelectorAll('.bloom-section').forEach(el=>{el.classList.remove('bloom-section','bloom-dragging','bloom-drag-over');el.removeAttribute('draggable');});
                        doc.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('bloom-drag'))s.remove();});
                        doc.querySelectorAll('script').forEach(s=>{if(s.textContent.includes('designMode'))s.remove();});
                        content='<!DOCTYPE html>'+doc.documentElement.outerHTML;
                      }
                    }
                    try{
                      const r=await fetch(`/api/files/artifacts/${previewFile.fileId}`, await withAuth({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})});
                      const d=await r.json();
                      if(d.success){setPreviewFile(p=>({...p,content}));setEditMode(false);}
                    }catch{}
                    setEditSaving(false);
                  }} style={{padding:"8px 20px",borderRadius:8,border:"none",background:c.gradient,cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>
                    {editSaving?"Saving...":"💾 Save Changes"}
                  </button>
                  {previewFile.name?.endsWith('.html')&&editMode!=='code'&&(
                    <button onClick={()=>{setEditMode('code');setEditContent(editContent||previewFile.content||'');}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:600,color:c.tx,fontFamily:"inherit"}}>{"</>"} Code View</button>
                  )}
                  {editMode==='code'&&previewFile.name?.endsWith('.html')&&(
                    <button onClick={()=>setEditMode(true)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:600,color:c.tx,fontFamily:"inherit"}}>👁 Visual View</button>
                  )}
                  <button onClick={()=>{
                    const name=previewFile.name;
                    const ask=`I want to make changes to "${name}". Here's the current content:\n\n\`\`\`\n${(editContent||previewFile.content||'').slice(0,2000)}\n\`\`\`\n\nPlease help me edit this.`;
                    setPreviewFile(null);setEditMode(false);setPg('chat');setTx(ask);
                  }} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+c.ac,background:c.ac+"10",cursor:"pointer",fontSize:12,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>
                    ✨ Ask Bloomie to Edit
                  </button>
                  <button onClick={()=>setEditMode(false)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:600,color:c.so,fontFamily:"inherit",marginLeft:"auto"}}>Cancel</button>
                </div>
              </>
            ):(
              /* View Mode */
              <>
                {(previewFile.name?.endsWith('.docx')||previewFile.name?.endsWith('.pdf')||previewFile.name?.endsWith('.xlsx')||previewFile.name?.endsWith('.pptx')||previewFile.name?.endsWith('.zip'))?(
                  /* Binary files — show download button, don't try to render */
                  <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:c.so}}>
                    <span style={{fontSize:48}}>null</span>
                    <div style={{fontSize:16,fontWeight:600,color:c.tx}}>{previewFile.name}</div>
                    <div style={{fontSize:13}}>This file type can't be previewed in the browser</div>
                    {previewFile.fileId&&(
                      <a href={`/api/files/download/${previewFile.fileId}`} download={previewFile.name} style={{padding:"12px 28px",borderRadius:10,background:"linear-gradient(135deg,#F4A261,#E76F8B)",color:"#fff",textDecoration:"none",fontSize:14,fontWeight:700,marginTop:8}}>
                        Download {previewFile.name?.split('.').pop()?.toUpperCase()}
                      </a>
                    )}
                  </div>
                ):previewFile.name?.endsWith('.html')?(
                  <iframe
                    srcDoc={previewFile.content||''}
                    style={{flex:1,width:"100%",border:"none",background:"#fff"}}
                    sandbox="allow-scripts allow-same-origin"
                    title={previewFile.name}
                  />
                ):(
                  <div style={{flex:1,overflowY:"auto",background:dark?undefined:"#fff"}}>
                    <div style={{
                      maxWidth:"65ch",
                      margin:"0 auto",
                      padding:"3rem 2rem",
                      fontSize:"1rem",
                      lineHeight:1.75,
                      color:c.tx,
                      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif",
                    }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1:({children})=><h1 style={{fontSize:"2.25em",fontWeight:800,color:c.tx,lineHeight:1.1111111,marginTop:0,marginBottom:"0.8888889em"}}>{children}</h1>,
                        h2:({children})=><h2 style={{fontSize:"1.5em",fontWeight:700,color:c.tx,lineHeight:1.3333333,marginTop:"2em",marginBottom:"1em"}}>{children}</h2>,
                        h3:({children})=><h3 style={{fontSize:"1.25em",fontWeight:600,color:c.tx,lineHeight:1.6,marginTop:"1.6em",marginBottom:"0.6em"}}>{children}</h3>,
                        h4:({children})=><h4 style={{fontWeight:600,color:c.tx,lineHeight:1.5,marginTop:"1.5em",marginBottom:"0.5em"}}>{children}</h4>,
                        p:({children})=><p style={{marginTop:"1.25em",marginBottom:"1.25em"}}>{children}</p>,
                        strong:({children})=><strong style={{fontWeight:600,color:c.tx}}>{children}</strong>,
                        em:({children})=><em>{children}</em>,
                        ul:({children})=><ul style={{listStyleType:"disc",marginTop:"1.25em",marginBottom:"1.25em",paddingInlineStart:"1.625em"}}>{children}</ul>,
                        ol:({children})=><ol style={{listStyleType:"decimal",marginTop:"1.25em",marginBottom:"1.25em",paddingInlineStart:"1.625em"}}>{children}</ol>,
                        li:({children})=><li style={{marginTop:"0.5em",marginBottom:"0.5em"}}>{children}</li>,
                        blockquote:({children})=><blockquote style={{fontWeight:500,fontStyle:"italic",color:c.so,borderInlineStartWidth:"0.25rem",borderInlineStartStyle:"solid",borderInlineStartColor:c.ac,paddingInlineStart:"1em",marginTop:"1.6em",marginBottom:"1.6em"}}>{children}</blockquote>,
                        code:({inline,children})=>inline
                          ?<code style={{fontSize:"0.875em",fontWeight:600,color:c.tx,background:c.sf,padding:"0.1em 0.3em",borderRadius:"0.25em"}}>{children}</code>
                          :<pre style={{fontSize:"0.875em",lineHeight:1.7142857,marginTop:"1.7142857em",marginBottom:"1.7142857em",borderRadius:"0.375rem",padding:"0.8571429em 1.1428571em",background:c.bg,border:"1px solid "+c.ln,overflowX:"auto"}}><code style={{fontFamily:"ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",fontWeight:400}}>{children}</code></pre>,
                        hr:()=><hr style={{borderColor:c.ln,borderTopWidth:1,borderStyle:"solid",marginTop:"3em",marginBottom:"3em"}}/>,
                        a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer" style={{color:c.tx,textDecoration:"underline",fontWeight:500}}>{children}</a>,
                        table:({children})=><div style={{overflowX:"auto",marginTop:"2em",marginBottom:"2em"}}><table style={{width:"100%",tableLayout:"auto",fontSize:"0.875em",lineHeight:1.7142857,borderCollapse:"collapse"}}>{children}</table></div>,
                        thead:({children})=><thead style={{borderBottomWidth:2,borderBottomStyle:"solid",borderBottomColor:c.ln}}>{children}</thead>,
                        th:({children})=><th style={{fontWeight:600,color:c.tx,paddingInlineEnd:"0.5714286em",paddingBottom:"0.5714286em",paddingInlineStart:"0.5714286em",textAlign:"left"}}>{children}</th>,
                        td:({children})=><td style={{padding:"0.5714286em",borderBottomWidth:1,borderBottomStyle:"solid",borderBottomColor:c.ln}}>{children}</td>,
                        img:({src,alt})=><img src={src} alt={alt||""} onClick={()=>setChatLightbox({src,alt:alt||""})} style={{maxWidth:"100%",height:"auto",borderRadius:4,marginTop:"2em",marginBottom:"2em",display:"block",cursor:"zoom-in"}}/>,
                      }}
                    >{previewFile.content}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Publish bar */}
                <div style={{padding:"10px 16px",borderTop:"1px solid "+c.ln,background:c.sf,display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
                  {publishUrl?(
                    <>
                      <span style={{fontSize:11,color:c.gr,fontWeight:600}}>✓ Published</span>
                      <a href={publishUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:c.ac,fontWeight:600,textDecoration:"none",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{publishUrl}</a>
                      <button onClick={()=>{navigator.clipboard?.writeText(publishUrl);}} style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:11,fontWeight:600,color:c.tx,fontFamily:"inherit"}}>Copy Link</button>
                      <button onClick={async()=>{
                        await fetch(`/api/files/publish-site/${previewFile.fileId}`, await withAuth({method:'DELETE'});
                        setPublishUrl(null);setPublishSlug('');
                      }} style={{padding:"5px 12px",borderRadius:6,border:"1px solid rgba(234,67,53,0.3)",background:"transparent",cursor:"pointer",fontSize:11,color:"#ea4335",fontFamily:"inherit"}}>Unpublish</button>
                    </>
                  ):publishOpen?(
                    <>
                      <span style={{fontSize:12,color:c.so,flexShrink:0}}>{window.location.origin}/s/</span>
                      <input value={publishSlug} onChange={e=>setPublishSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'))} placeholder="summer-camp" style={{flex:1,padding:"6px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx,fontFamily:"monospace",minWidth:100}}/>
                      <button onClick={async()=>{
                        if(!publishSlug.trim())return;
                        setPublishError(null);
                        const r=await fetch(`/api/files/publish-site/${previewFile.fileId}`, await withAuth({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:publishSlug})});
                        const d=await r.json();
                        if(d.success){setPublishUrl(d.url);setPublishOpen(false);}
                        else setPublishError(d.error||'Failed');
                      }} style={{padding:"6px 16px",borderRadius:6,border:"none",background:c.gradient,cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>Publish</button>
                      <button onClick={()=>setPublishOpen(false)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:11,color:c.so,fontFamily:"inherit"}}>Cancel</button>
                      {publishError&&<div style={{width:"100%",fontSize:11,color:"#ea4335"}}>{publishError}</div>}
                    </>
                  ):(
                    <button onClick={()=>{
                      // Auto-suggest slug from filename
                      const suggest=(previewFile.name||'').replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
                      setPublishSlug(suggest);setPublishOpen(true);setPublishError(null);
                      // Check if already published
                      withAuth().then(h=>fetch(`/api/files/preview/${previewFile.fileId}`,h)).then(r=>r.json()).then(d=>{
                        if(d.slug){setPublishUrl(`${window.location.origin}/s/${d.slug}`);setPublishOpen(false);}
                      }).catch(()=>{});
                    }} style={{padding:"8px 20px",borderRadius:8,border:"none",background:c.gradient,cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>
                      Publish as Site
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Publish Dialog ── */}
      {publishOpen&&previewFile&&(
        <div onClick={()=>setPublishOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,background:c.cd,borderRadius:16,border:"1px solid "+c.ln,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
            <div style={{padding:"20px 24px",borderBottom:"1px solid "+c.ln,background:"linear-gradient(135deg, rgba(244,162,97,0.08), rgba(231,111,139,0.08))"}}>
              <div style={{fontSize:18,fontWeight:700,color:c.tx}}>Publish Page</div>
              <div style={{fontSize:12,color:c.so,marginTop:4}}>Give your page a clean URL that anyone can visit</div>
            </div>
            <div style={{padding:24}}>
              <div style={{fontSize:12,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Page URL</div>
              <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:6}}>
                <div style={{padding:"10px 12px",borderRadius:"8px 0 0 8px",border:"1px solid "+c.ln,borderRight:"none",background:c.sf,fontSize:12,color:c.so,whiteSpace:"nowrap",flexShrink:0}}>{window.location.origin}/p/</div>
                <input value={publishSlug} onChange={e=>{setPublishSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'));setPublishError('');setPublishedUrl(null);}} placeholder="summer-camp-landing" style={{flex:1,padding:"10px 12px",borderRadius:"0 8px 8px 0",border:"1px solid "+c.ln,fontSize:13,fontFamily:"monospace",background:c.inp,color:c.tx,boxSizing:"border-box",minWidth:0}}/>
              </div>
              {publishError&&<div style={{fontSize:11,color:"#ea4335",marginBottom:8}}>{publishError}</div>}
              {publishedUrl&&(
                <div style={{padding:12,borderRadius:8,background:c.gr+"12",border:"1px solid "+c.gr+"30",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:c.gr,marginBottom:4}}>✓ Published! Share this link:</div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <input value={publishedUrl} readOnly style={{flex:1,padding:"6px 10px",borderRadius:6,border:"1px solid "+c.ln,fontSize:12,fontFamily:"monospace",background:c.inp,color:c.tx,boxSizing:"border-box"}} onClick={e=>e.target.select()}/>
                    <button onClick={()=>{navigator.clipboard?.writeText(publishedUrl);}} style={{padding:"6px 12px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:11,fontWeight:600,color:c.tx,fontFamily:"inherit",flexShrink:0}}>Copy</button>
                    <a href={publishedUrl} target="_blank" rel="noopener noreferrer" style={{padding:"6px 12px",borderRadius:6,border:"none",background:c.gradient,fontSize:11,fontWeight:600,color:"#fff",textDecoration:"none",flexShrink:0}}>Open</a>
                  </div>
                  <div style={{fontSize:10,color:c.so,marginTop:6}}>Anyone with this link can view the page. Forward your custom domain here for branded URLs.</div>
                </div>
              )}
              <div style={{display:"flex",gap:8,marginTop:publishedUrl?0:12}}>
                <button onClick={async()=>{
                  if(!publishSlug.trim())return setPublishError('Enter a URL slug');
                  try{
                    const r=await fetch(`/api/files/artifacts/${previewFile.fileId}/publish`, await withAuth({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:publishSlug.trim()})});
                    const d=await r.json();
                    if(d.success){
                      const url=`${window.location.origin}/p/${d.slug}`;
                      setPublishedUrl(url);setPublishError('');
                      setPreviewFile(p=>({...p,slug:d.slug}));
                    } else {
                      setPublishError(d.error||'Publish failed');
                    }
                  }catch(e){setPublishError('Network error');}
                }} style={{flex:1,padding:"12px 0",borderRadius:10,border:"none",background:c.gradient,cursor:"pointer",fontSize:14,fontWeight:700,color:"#fff",fontFamily:"inherit"}}>
                  {publishedUrl?"Update URL":"Publish"}
                </button>
                {previewFile.slug&&(
                  <button onClick={async()=>{
                    await fetch(`/api/files/artifacts/${previewFile.fileId}/unpublish`, await withAuth({method:'POST'});
                    setPublishedUrl(null);setPublishOpen(false);
                    setPreviewFile(p=>({...p,slug:null}));
                  }} style={{padding:"12px 16px",borderRadius:10,border:"1px solid rgba(234,67,53,0.3)",background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,color:"#ea4335",fontFamily:"inherit"}}>
                    Unpublish
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!hlpO&&(
        <button onClick={()=>setHlpO(true)} style={{position:"fixed",bottom:mob?130:80,right:mob?8:20,width:mob?44:52,height:mob?44:52,borderRadius:"50%",border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",cursor:"pointer",boxShadow:"0 4px 20px rgba(231,111,139,.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:90,transition:"transform .2s",opacity:0.85}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          <Bloom sz={36} glow/>
        </button>
      )}
      {hlpO&&(
        <div style={{position:"fixed",bottom:mob?0:24,right:mob?0:24,width:mob?"100%":380,height:mob?"85vh":520,borderRadius:mob?"20px 20px 0 0":20,background:c.cd,border:"1px solid "+c.ln,boxShadow:"0 12px 48px rgba(0,0,0,.25)",zIndex:95,display:"flex",flexDirection:"column",overflow:"hidden",animation:"pop .2s ease"}}>
          <div style={{padding:"16px 20px",background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",gap:12}}>
            <Bloom sz={40}/>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>Bloomie Help</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.8)"}}>{currentAgent?.name||"Sarah Rodriguez"}</div>
            </div>
            <button onClick={()=>setHlpO(false)} style={{width:28,height:28,borderRadius:"50%",border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.15)",cursor:"pointer",color:"#fff",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            {[
              {ic:"💬",t:`Chat with ${currentAgent?.name?.split(" ")[0]||"your Bloomie"}`,d:"Give them tasks directly"},
              {ic:"📊",t:"Monitor tab",d:"Health, trust gate, tool performance"},
              {ic:"⏰",t:"Automation",d:"Configure cron jobs & heartbeat"},
              {ic:"🖥️",t:"Screen viewer",d:`Watch ${currentAgent?.name?.split(" ")[0]||"your Bloomie"} work in real time`},
              {ic:"🔐",t:"Trust gate",d:"Autonomy level & daily limits"},
              {ic:"⚙️",t:"Settings",d:"Customize your experience"},
            ].map((item,i)=>(
              <button key={i} style={{width:"100%",textAlign:"left",padding:"12px 14px",borderRadius:12,border:"1px solid "+c.ln,background:c.cd,marginBottom:6,cursor:"pointer",display:"flex",alignItems:"center",gap:12}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background=c.cd}>
                <span style={{fontSize:20,flexShrink:0}}>{item.ic}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{item.t}</div>
                  <div style={{fontSize:11,color:c.so,marginTop:1}}>{item.d}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {pageEditor&&(
        <PageEditor
          editor={pageEditor}
          onClose={()=>setPageEditor(null)}
          onSaved={(fileId,html)=>{
            setFiles(prev=>prev.map(x=>x.fileId===fileId?{...x,content:html}:x));
          }}
        />
      )}

    {chatLightbox&&<ImageLightbox src={chatLightbox.src} alt={chatLightbox.alt} onClose={()=>setChatLightbox(null)}/>}
    </div>
  );
}
