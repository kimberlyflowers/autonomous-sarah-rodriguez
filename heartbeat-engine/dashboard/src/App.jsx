import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   THEME — exact copy from Jaden's dashboard
   ═══════════════════════════════════════════════════════════════ */
function mk(d) {
  return d
    ? { bg:"#1a1a1a",sf:"#212121",cd:"#262626",ac:"#F4A261",a2:"#E76F8B",
        gr:"#34A853",gf:"#1a2b1a",tx:"#ececec",so:"#a0a0a0",fa:"#5c5c5c",
        ln:"#353535",bl:"#5B8FF9",pu:"#A78BFA",inp:"#212121",hv:"#2f2f2f" }
    : { bg:"#F7F8FA",sf:"#EDEEF2",cd:"#FFFFFF",ac:"#F4A261",a2:"#E76F8B",
        gr:"#34A853",gf:"#F0FAF0",tx:"#111827",so:"#6B7280",fa:"#D1D5DB",
        ln:"#E5E7EB",bl:"#3B6FD4",pu:"#7C3AED",inp:"#F4F5F7",hv:"#F0F1F3" };
}

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
function useSarahChat() {
  const [messages,setMessages] = useState([]);
  const [loading,setLoading] = useState(false);
  const [sessions,setSessions] = useState([]);
  const [currentSessionId,setCurrentSessionId] = useState(null);
  const sid = useRef(null);

  // Load session list on mount
  const fetchSessions = async () => {
    try {
      const r = await fetch("/api/chat/sessions");
      const d = await r.json();
      const list = d.sessions || [];
      setSessions(list);
      // Auto-load the most recent session if none is selected
      if (!sid.current && list.length > 0) {
        const latest = list[0]; // sessions come sorted by updated_at DESC
        sid.current = latest.id;
        setCurrentSessionId(latest.id);
        try {
          const mr = await fetch("/api/chat/sessions/"+latest.id);
          const md = await mr.json();
          setMessages((md.messages||[]).map((m,i)=>({
            id:i, b:m.role==="assistant", t:(m.content||'').replace(/\s*\[Tool:.*?\]\s*/g,'').trim(),
            tm:m.created_at?new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"",
            files:m.files?(typeof m.files==="string"?JSON.parse(m.files):m.files):undefined
          })));
        } catch {}
      }
    } catch {}
  };

  useEffect(()=>{ fetchSessions(); },[]);

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

  const send = async (text) => {
    if(!text.trim()) return false;
    // Auto-create session if none active
    if(!sid.current) { const id="session-"+Date.now(); sid.current=id; setCurrentSessionId(id); }
    const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    setMessages(p=>[...p,{id:Date.now(),b:false,t:text,tm:ts}]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,sessionId:sid.current})});
      const data = await res.json();
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:(data.response||data.message||"Done.").replace(/\s*\[Tool:.*?\]\s*/g,'').trim(),tm:ts2}]);
      fetchSessions(); // refresh sidebar immediately
      setTimeout(fetchSessions, 3000); // re-fetch after AI title generates
      return true;
    } catch {
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:"Connection issue — please try again.",tm:ts2}]);
      return false;
    } finally { setLoading(false); }
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
      setMessages(p=>[...p,{id:Date.now(),b:false,t:text||'',tm:ts,files:encoded}]);
      if(!sid.current){ const id="session-"+Date.now(); sid.current=id; setCurrentSessionId(id); }
      const resp = await fetch("/api/chat/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,sessionId:sid.current,files:encoded})});
      const data = await resp.json();
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

  return {messages,setMessages,send,sendFiles,loading,sessions,currentSessionId,newSession,loadSession,deleteSession,fetchSessions};
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

// Shared card shell that matches Jaden's card aesthetic exactly
function Card({c,title,subtitle,children,action,noPad}) {
  return(
    <div style={{borderRadius:16,background:c.cd,border:"1px solid "+c.ln,overflow:"hidden"}}>
      <div style={{padding:"13px 16px",borderBottom:"1px solid "+c.ln,background:c.sf,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:c.tx}}>{title}</div>
          {subtitle&&<div style={{fontSize:10,color:c.so,marginTop:1}}>{subtitle}</div>}
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
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/health"); if(r.ok) setData(await r.json()); }catch{} };
    go();
    const clean=sse?.register("health",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const overall=data?.overall||"unknown";
  const components=data?.components||[];
  const colMap={healthy:c.gr,warning:"#F59E0B",critical:"#EF4444"};

  return(
    <Card c={c} title="🏥 System Health" action={<Pill c={c} status={overall}/>}>
      {!data
        ? <div style={{padding:20,textAlign:"center",fontSize:12,color:c.so}}>Loading…</div>
        : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {(components.length?components:[{name:"Database",status:"unknown"},{name:"Claude API",status:"unknown"},{name:"GHL API",status:"unknown"},{name:"Memory",status:"unknown"}]).map((comp,i)=>(
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
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/trust-gate"); if(r.ok) setData(await r.json()); }catch{} };
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
    <Card c={c} title="🔐 Trust Gate" subtitle="Authorization & daily limits">
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
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/agentic-executions?limit=5"); if(r.ok){ const d=await r.json(); setExecs(d.executions||d||[]); } }catch{} };
    go();
    const clean=sse?.register("executions",go);
    if(!clean){ const t=setInterval(go,15000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const statusColors={completed:c.gr,running:c.bl,failed:"#EF4444",pending:"#F59E0B"};

  return(
    <Card c={c} title="⚡ Agentic Executions" subtitle="Multi-turn task runs">
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
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/sub-agents"); if(r.ok){ const d=await r.json(); setAgents(d.agents||d||[]); } }catch{} };
    go();
    const clean=sse?.register("subagents",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  return(
    <Card c={c} title="🤖 Sub-Agent Network" subtitle="5 domain specialists">
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
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/tool-performance"); if(r.ok) setData(await r.json()); }catch{} };
    go();
    const clean=sse?.register("tools",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const tools=data?.topTools||data?.tools||[];

  return(
    <Card c={c} title="🔧 Tool Performance" subtitle="60 GHL tools + internal">
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
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/context-analytics"); if(r.ok) setData(await r.json()); }catch{} };
    go();
    const clean=sse?.register("context",go);
    if(!clean){ const t=setInterval(go,30000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const pct=data?.utilizationPercent||0;
  const barColor=pct>80?"#EF4444":pct>60?"#F59E0B":c.gr;

  return(
    <Card c={c} title="🧠 Context Analytics" subtitle="Token usage & compression">
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
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/action-log?limit=20"); if(r.ok){ const d=await r.json(); setActions(d.actions||d||[]); } }catch{} };
    go();
    const clean=sse?.register("actions",go);
    if(!clean){ const t=setInterval(go,15000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const catColors={communication:c.bl,data_modification:"#F59E0B",data_creation:c.gr,read:c.fa,logging:c.pu};

  return(
    <Card c={c} title="📋 Action Log" subtitle="Live activity feed">
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
function InternalTasks({c,sse}) {
  const [tasks,setTasks] = useState([]);
  useEffect(()=>{
    const go=async()=>{ try{ const r=await fetch("/api/dashboard/internal-tasks"); if(r.ok){ const d=await r.json(); setTasks(d.tasks||d||[]); } }catch{} };
    go();
    const clean=sse?.register("tasks",go);
    if(!clean){ const t=setInterval(go,20000); return()=>clearInterval(t); }
    return clean;
  },[sse]);

  const statusColors={pending:"#F59E0B",in_progress:c.bl,completed:c.gr,failed:"#EF4444"};

  return(
    <Card c={c} title="📝 Internal Tasks" subtitle="Sarah's active work queue">
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

// ── ESCALATIONS + REJECTIONS (tabbed)
function EscalationPanel({c,sse}) {
  const [handoffs,setHandoffs] = useState([]);
  const [rejections,setRejections] = useState([]);
  const [tab,setTab] = useState("handoffs");

  useEffect(()=>{
    const fetchH=async()=>{ try{ const r=await fetch("/api/dashboard/handoff-log?limit=10"); if(r.ok){ const d=await r.json(); setHandoffs(d.handoffs||d||[]); } }catch{} };
    const fetchR=async()=>{ try{ const r=await fetch("/api/dashboard/rejection-log?limit=10"); if(r.ok){ const d=await r.json(); setRejections(d.rejections||d||[]); } }catch{} };
    fetchH(); fetchR();
    if(sse){
      const c1=sse.register("handoffs",fetchH);
      const c2=sse.register("rejections",fetchR);
      return()=>{ c1(); c2(); };
    }
    const t=setInterval(()=>{ fetchH(); fetchR(); },20000);
    return()=>clearInterval(t);
  },[sse]);

  const items=tab==="handoffs"?handoffs:rejections;
  const tabs=[{k:"handoffs",l:"🤝 Escalations",ct:handoffs.length},{k:"rejections",l:"🚫 Rejections",ct:rejections.length}];

  return(
    <Card c={c} title="📊 Escalations & Rejections" action={
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
    <div style={{width,flexShrink:0,borderLeft:"1px solid "+c.ln,display:"flex",flexDirection:"column",position:"relative"}}>
      <div onMouseDown={onMouseDown} style={{position:"absolute",left:0,top:0,bottom:0,width:8,cursor:"ew-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}} title="Drag to resize">
        <div style={{width:3,height:40,borderRadius:2,background:c.ln}}/>
      </div>
      {children}
    </div>
  );
}


// ── SCREEN VIEWER — live feed from Sarah's browser via SSE
function Screen({c,mob,mode,setMode}) {
  const [screenshot,setScreenshot] = useState(null);
  const [browserUrl,setBrowserUrl] = useState(null);
  const [live,setLive] = useState(false);

  useEffect(()=>{
    if(mode==="hidden") return;
    let es;
    const connect = () => {
      es = new EventSource("/api/browser/stream");
      es.onmessage = (e) => {
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
      es.onerror = () => { setLive(false); es.close(); setTimeout(connect, 5000); };
    };
    connect();
    return () => { try { es&&es.close(); } catch {} };
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
            <img src={screenshot} alt="Sarah's browser" style={{width:"100%",flex:1,objectFit:"contain",display:"block"}}/>
          </div>
        ):(
          <div style={{textAlign:"center",padding:30}}>
            <div style={{fontSize:36,marginBottom:10,opacity:0.3}}>🖥️</div>
            <div style={{fontSize:13,color:"#666",marginBottom:4}}>Browser idle</div>
            <div style={{fontSize:11,color:"#555"}}>Activates when Sarah starts browsing</div>
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
function ActiveTaskTracker({c}) {
  const [tasks,setTasks]=useState([]);
  useEffect(()=>{
    const go=async()=>{
      try{
        const r=await fetch("/api/dashboard/agentic-executions?limit=3");
        if(r.ok){const d=await r.json(); setTasks(d.executions||d||[]);}
      }catch{}
    };
    go();
    const t=setInterval(go,15000);
    return()=>clearInterval(t);
  },[]);

  if(tasks.length===0) return(
    <div style={{padding:"16px",textAlign:"center",color:c.fa,fontSize:12}}>No active tasks</div>
  );

  return(
    <div style={{padding:"8px 0"}}>
      {tasks.map((task,i)=>{
        const steps=task.steps||task.tool_calls||[];
        const done=steps.filter(s=>s.status==="done"||s.status==="completed"||s.success).length;
        const total=Math.max(steps.length,1);
        const pct=Math.round((done/total)*100);
        const isActive=task.status==="running"||task.status==="active";
        return(
          <div key={i} style={{padding:"12px 16px",borderBottom:i<tasks.length-1?"1px solid "+c.ln+"60":"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{position:"relative",flexShrink:0}}>
                <ProgressRing pct={pct} sz={44} stroke={4} color={isActive?c.ac:c.gr} bg={c.ln}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:c.tx}}>{pct}%</div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.task||task.name||"Running task"}</div>
                <div style={{fontSize:10,color:c.so,marginTop:2}}>{done} of {total} steps · {isActive?"Working now":"Complete"}</div>
              </div>
            </div>
            {steps.slice(0,4).map((s,si)=>{
              const isDone=s.status==="done"||s.status==="completed"||s.success;
              const isNow=isActive&&si===done;
              return(
                <div key={si} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"3px 0",opacity:isDone||isNow?1:0.4}}>
                  <div style={{width:16,height:16,borderRadius:"50%",background:isDone?c.gr:isNow?"transparent":c.ln,border:isNow?"2px solid "+c.ac:"none",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                    {isDone&&<span style={{fontSize:9,color:"#fff"}}>✓</span>}
                    {isNow&&<span style={{width:6,height:6,borderRadius:"50%",background:c.ac,animation:"pulse 1.2s ease infinite",display:"block"}}/>}
                  </div>
                  <div style={{fontSize:11,color:isDone?c.so:isNow?c.tx:c.fa,textDecoration:isDone?"line-through":"none",lineHeight:1.4}}>{s.tool||s.name||s.description||"Step "+(si+1)}</div>
                </div>
              );
            })}
          </div>
        );
      })}
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
  const artifactMatch = text.match(/Created "(.+?)".*?(?:waiting for (?:your )?approval|ready for (?:your )?review)/i)
    || text.match(/(?:I've created|I created|Here's the|I've saved|saved as|saved it to) (?:a |an |the )?(?:deliverable|artifact|file).*?"(.+?)"/i)
    || text.match(/(?:in your Files tab|saved to (?:your )?Files|it's in (?:your )?Files|ready for you to review|ready for you to (?:edit|post)|you can review it|approve it)/i);
  if (artifactMatch) {
    const name = (artifactMatch[1] || artifactMatch[2] || "").trim();
    if (name) {
      cards.push({ type: "artifact", name });
    } else {
      cards.push({ type: "artifact", name: "__latest__" });
    }
  }

  return cards;
}

function ArtifactCard({ name, c, onOpenSide, mob }) {
  const [artData, setArtData] = useState(null);

  const dn = artData?.name || (name === '__latest__' ? 'Loading...' : name);
  const ext = dn.split('.').pop()?.toLowerCase() || '';
  const icon = ext === 'html' ? '🌐' : ext === 'md' ? '📝' : ext === 'js' || ext === 'py' ? '💻' : '📄';

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/files/artifacts?limit=10');
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
      const pr = await fetch(`/api/files/preview/${artData.fileId}`);
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
        <div style={{fontSize:11,fontWeight:700,color:c.gr,textTransform:"uppercase",letterSpacing:"0.5px"}}>📄 New File — Saved</div>
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

export default function App() {
  const W=useW();
  const mob=W<768;
  const [dark,setDark]=useState(true);
  const c=mk(dark);

  const sse=useSSE();
  const agentOnline=useAgentOnline();
  const {crmUrl,contactsUrl}=useCRMLink();
  const {messages,setMessages,send,sendFiles,loading,sessions,currentSessionId,newSession,loadSession,deleteSession,fetchSessions}=useSarahChat();
  // Periodically refresh session titles (AI title generates async after first message)
  useEffect(()=>{ const t=setInterval(fetchSessions,8000); return()=>clearInterval(t); },[]);
  const connected=agentOnline; // true online/offline from health poll

  const [pg,setPg]=useState("chat");
  const [tx,setTx]=useState("");
  const [isNew,setNew]=useState(true);
  const [vcRec,setVcRec]=useState(false);
  const [scrM,setScrM]=useState("docked");
  const [rightTab,setRightTab]=useState("browser"); // "browser" | "artifact"
  const [activeArtifact,setActiveArtifact]=useState(null); // {name, content, fileId}
  const [sbO,setSbO]=useState(!mob?"full":"closed");
  const [stab,setStab]=useState("General");
  const [hlpO,setHlpO]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const [profileData,setProfileData]=useState(null);
  const [scheduledTasks,setScheduledTasks]=useState([]);
  const [taskFormOpen,setTaskFormOpen]=useState(false);
  const [editingProfile,setEditingProfile]=useState(false);
  const [editTitle,setEditTitle]=useState('');
  const [editDesc,setEditDesc]=useState('');
  const [newTask,setNewTask]=useState({name:'',instruction:'',taskType:'content',frequency:'daily',runTime:'09:00'});

  const loadProfile = async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        fetch('/api/agent/profile').then(r=>r.json()),
        fetch('/api/agent/tasks').then(r=>r.json())
      ]);
      setProfileData(pRes);
      setScheduledTasks(tRes.tasks||[]);
      if(pRes.profile){
        setEditTitle(pRes.profile.jobTitle||'');
        setEditDesc(pRes.profile.jobDescription||'');
      }
    } catch(e){ console.error('Failed to load profile',e); }
  };
  const [umO,setUmO]=useState(false);
  const [projO,setProjO]=useState(false);
  const [activeProj,setActiveProj]=useState("Petal Core Beauty");
  const projects=["Petal Core Beauty","Youth Empowerment School","BLOOM Internal"];
  const [files,setFiles]=useState([]);
  const [filesLoading,setFilesLoading]=useState(false);
  const [filesRefresh,setFilesRefresh]=useState(0);
  const [previewFile,setPreviewFile]=useState(null); // {name, content, fileId}
  const [heartbeatInterval,setHeartbeatInterval]=useState("0 */6 * * *");
  const [heartbeatEnabled,setHeartbeatEnabled]=useState(true);
  const [cronJobs,setCronJobs]=useState([
    {id:"c1",nm:"GHL contact sync",ic:"👥",freq:"Every 15min",next:"—",last:"—",ok:true,on:true},
    {id:"c2",nm:"Proactive check-in",ic:"💬",freq:"Every 6hrs",next:"—",last:"—",ok:true,on:true},
    {id:"c3",nm:"System health scan",ic:"🔍",freq:"Every 30min",next:"—",last:"—",ok:true,on:true},
    {id:"c4",nm:"Task completion scan",ic:"✅",freq:"Hourly",next:"—",last:"—",ok:true,on:true},
  ]);

  // Fetch deliverables when files tab opens or after approval
  useEffect(()=>{
    if(pg!=="artifacts") return;
    setFilesLoading(true);
    fetch("/api/files/artifacts?limit=50")
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        setFiles(d?.artifacts||[]);
      })
      .catch(()=>{})
      .finally(()=>setFilesLoading(false));
  },[pg,filesRefresh]);
  const btm=useRef(null);
  const fRef=useRef(null);
  const [pendingFiles,setPendingFiles]=useState([]);
  const sbOpen=sbO==="full"||sbO==="mini";

  const agent={nm:"Sarah Rodriguez",role:"Marketing & Operations Executive",img:null,grad:"linear-gradient(135deg,#F4A261,#E76F8B)"};

  useEffect(()=>{ if(btm.current) setTimeout(()=>btm.current?.scrollIntoView({behavior:"smooth"}),100); },[messages]);

  useEffect(()=>{
    if(!umO) return;
    const h=()=>setUmO(false);
    setTimeout(()=>document.addEventListener("click",h),0);
    return()=>document.removeEventListener("click",h);
  },[umO]);

  const doSend=async()=>{
    if(!tx.trim()||loading) return;
    const text=tx.trim(); setTx(""); setNew(false);
    await send(text);
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

  const navTabs=[
    {k:"chat",l:mob?"💬":"💬 Chat"},
    {k:"monitor",l:mob?"📊":"📊 Status"},
    {k:"artifacts",l:mob?"📁":"📁 Files"},
    {k:"cron",l:mob?"⏰":"⏰ Jobs"},
  ];

  return(
    <div style={{minHeight:"100vh",background:c.bg,fontFamily:"'Inter',system-ui,-apple-system,sans-serif",color:c.tx}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bloomGlow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
        @keyframes bloomieWiggle{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus,button:focus{outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:${c.ln};border-radius:10px}
      `}</style>
      <input ref={fRef} type="file" multiple accept="image/*,.pdf,.csv,.txt,.docx,.xlsx,.json,.md" style={{display:"none"}} onChange={async(e)=>{
        const files=[...e.target.files];
        if(!files.length) return;
        setNew(false);
        await sendFiles(files, tx.trim());
        setTx("");
        e.target.value="";
        setPendingFiles([]);
      }}/>

      {/* ── HEADER — exact Jaden layout ── */}
      <div style={{padding:mob?"8px 12px":"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:c.cd,borderBottom:"1px solid "+c.ln,position:"sticky",top:0,zIndex:60,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:mob?6:10}}>
          {pg==="chat"&&<button onClick={()=>setSbO(sbO==="full"?"mini":sbO==="mini"?"closed":"full")} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:c.so,flexShrink:0}}>☰</button>}
          <Bloom sz={mob?28:32} glow/>
          {!mob&&<span style={{fontSize:16,fontWeight:700,color:c.tx}}>Bloomie</span>}
          {!mob&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"#E76F8B20",color:"#E76F8B",letterSpacing:0.5}}>BETA</span>}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:mob?6:12,flexWrap:"nowrap"}}>
          <div style={{display:"flex",gap:mob?2:4,background:c.sf,padding:3,borderRadius:10}}>
            {navTabs.map(t=>(
              <button key={t.k} onClick={()=>setPg(t.k)} style={{padding:mob?"7px 10px":"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:pg===t.k?c.cd:"transparent",color:pg===t.k?c.tx:c.so,boxShadow:pg===t.k?"0 1px 4px rgba(0,0,0,.06)":"none"}}>
                {t.l}
              </button>
            ))}
          </div>
          {/* Business / Project switcher */}
          {!mob&&(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{position:"relative"}}>
                <button onClick={()=>setProjO(!projO)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:11,fontWeight:600,color:c.so}}>
                  <span style={{fontSize:13}}>🌸</span>
                  <span style={{color:c.tx,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeProj.split(" ")[0]}</span>
                  <span style={{fontSize:9}}>▾</span>
                </button>
                {projO&&(
                  <div style={{position:"absolute",top:"100%",left:0,zIndex:80,background:c.cd,border:"1px solid "+c.ln,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.18)",overflow:"hidden",marginTop:4,minWidth:180}}>
                    {projects.map(p=>(
                      <button key={p} onClick={()=>{setActiveProj(p);setProjO(false);}} style={{width:"100%",textAlign:"left",padding:"9px 12px",border:"none",cursor:"pointer",background:activeProj===p?c.ac+"15":"transparent",fontSize:12,fontWeight:activeProj===p?600:500,color:activeProj===p?c.ac:c.tx,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>{if(activeProj!==p)e.currentTarget.style.background=c.hv;}} onMouseLeave={e=>{if(activeProj!==p)e.currentTarget.style.background="transparent";}}>
                        {activeProj===p&&<span style={{fontSize:10,color:c.ac}}>✓</span>}
                        <span>{p}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:12,background:connected?c.gf:"#fef2f2",border:"1px solid "+(connected?c.gr+"30":"#fecaca")}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:connected?c.gr:"#ef4444",animation:connected?"pulse 1.5s ease infinite":"none"}}/>
            <span style={{fontSize:10,fontWeight:600,color:connected?c.gr:"#dc2626"}}>{connected?"Connected":"Offline"}</span>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {scrM==="hidden"&&<button onClick={()=>setScrM("docked")} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>🖥️</button>}
          <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>K</div>
        </div>
      </div>

      <div style={{display:"flex",position:"relative"}}>
        {pg==="chat"&&sbO==="full"&&mob&&<div onClick={()=>setSbO("closed")} style={{position:"fixed",inset:0,top:52,background:"rgba(0,0,0,.3)",zIndex:45}}/>}

        {/* ── SIDEBAR — session history like Claude ── */}
        {pg==="chat"&&sbOpen&&(
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
                  <button onClick={()=>setSbO("full")} style={{width:40,height:40,borderRadius:10,border:"none",background:c.sf,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:c.tx,marginTop:"auto"}}>K</button>
                </div>
              )}

              {/* FULL sidebar */}
              {sbO==="full"&&(
                <>
                  {/* Project switcher */}
                  <div style={{padding:"10px 14px 0",flexShrink:0,position:"relative"}}>
                    <button onClick={()=>setProjO(!projO)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:"1px solid "+c.ln,background:c.sf,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,fontWeight:600,color:c.so}}>
                      <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14}}>🏢</span><span style={{color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{activeProj}</span></span>
                      <span style={{fontSize:10,transition:"transform .2s",display:"inline-block",transform:projO?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
                    </button>
                    {projO&&(
                      <div style={{position:"absolute",top:"100%",left:14,right:14,zIndex:70,background:c.cd,border:"1px solid "+c.ln,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.15)",overflow:"hidden",marginTop:4}}>
                        {projects.map(p=>(
                          <button key={p} onClick={()=>{setActiveProj(p);setProjO(false);}} style={{width:"100%",textAlign:"left",padding:"9px 12px",border:"none",cursor:"pointer",background:activeProj===p?c.ac+"15":"transparent",fontSize:12,fontWeight:activeProj===p?600:500,color:activeProj===p?c.ac:c.tx,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>{if(activeProj!==p)e.currentTarget.style.background=c.hv;}} onMouseLeave={e=>{if(activeProj!==p)e.currentTarget.style.background="transparent";}}>
                            {activeProj===p&&<span style={{fontSize:10,color:c.ac}}>✓</span>}
                            <span>{p}</span>
                          </button>
                        ))}
                        <div style={{borderTop:"1px solid "+c.ln,padding:"7px 12px"}}>
                          <button style={{width:"100%",textAlign:"left",padding:"4px 0",border:"none",background:"transparent",cursor:"pointer",fontSize:11,color:c.so,display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>e.currentTarget.style.color=c.ac} onMouseLeave={e=>e.currentTarget.style.color=c.so}>
                            <span>+</span><span>Add project</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Agent identity card */}
                  <div style={{padding:"12px 14px 8px",borderBottom:"1px solid "+c.ln,flexShrink:0}}>
                    <div style={{padding:"10px 12px",borderRadius:12,background:c.sf,border:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
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
                  </div>

                  {/* Session list */}
                  <div style={{flex:1,overflowY:"auto",padding:"8px 8px"}}>
                    {sessions.length===0?(
                      <div style={{padding:"20px 8px",textAlign:"center",fontSize:11,color:c.fa}}>No chats yet</div>
                    ):sessions.map(s=>{
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
                      return(
                        <div key={s.id} style={{position:"relative",marginBottom:2}} className="session-row">
                          <button
                            onClick={()=>{loadSession(s.id);setNew(false);}}
                            style={{width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:10,border:"none",cursor:"pointer",background:isActive?c.ac+"15":"transparent",transition:"background .15s"}}
                            onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background=c.hv; }}
                            onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background="transparent"; }}
                          >
                            <div style={{fontSize:12,fontWeight:isActive?600:500,color:isActive?c.ac:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:20}}>{title}</div>
                            <div style={{fontSize:10,color:c.fa,marginTop:2,display:"flex",gap:6}}>
                              <span>{timeLabel}</span>
                              {s.message_count>0&&<span>· {Math.floor(s.message_count/2)} msg{s.message_count>2?"s":""}</span>}
                            </div>
                          </button>
                          <button
                            onClick={e=>{e.stopPropagation();deleteSession(s.id);}}
                            title="Delete"
                            style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",width:22,height:22,borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:12,color:c.fa,opacity:0,transition:"opacity .15s",display:"flex",alignItems:"center",justifyContent:"center"}}
                            onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.background=c.sf;e.currentTarget.style.color="#ef4444";}}
                            onMouseLeave={e=>{e.currentTarget.style.opacity="0";e.currentTarget.style.background="transparent";e.currentTarget.style.color=c.fa;}}
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom — Kimberly expandable menu */}
                  <div style={{padding:"10px 14px",borderTop:"1px solid "+c.ln,flexShrink:0,position:"relative"}}>
                    {/* Autopilot status */}
                    <div style={{padding:"6px 10px",borderRadius:8,background:c.sf,border:"1px solid "+c.ln,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:c.gr,animation:"pulse 1.5s ease infinite",flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:600,color:c.gr}}>Autopilot</span>
                      <span style={{fontSize:11,color:c.so,marginLeft:"auto"}}>✓ All OK</span>
                    </div>
                    <button onClick={()=>setUmO(!umO)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",background:umO?c.sf:"transparent",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background=umO?c.sf:"transparent"}>
                      <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>K</div>
                      <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:13,fontWeight:600,color:c.tx}}>Kimberly</div><div style={{fontSize:11,color:c.so}}>Owner</div></div>
                      <span style={{fontSize:12,color:c.so,transform:umO?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s"}}>▾</span>
                    </button>
                    {umO&&(
                      <div style={{position:"absolute",bottom:"100%",left:14,right:14,background:c.cd,border:"1px solid "+c.ln,borderRadius:12,boxShadow:"0 -8px 24px rgba(0,0,0,.15)",overflow:"hidden",marginBottom:4,zIndex:70}}>
                        {[
                          {ic:"⚙️",l:"Settings",fn:()=>{setPg("settings");setUmO(false);}},
                          {ic:"🔧",l:"Developer Mode",fn:()=>setUmO(false)},
                          {ic:dark?"☀️":"🌙",l:dark?"Light Mode":"Dark Mode",fn:()=>{setDark(!dark);setUmO(false);}},
                          {ic:"🚪",l:"Log out",fn:()=>setUmO(false)},
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
        <div style={{flex:1,minWidth:0}}>

          {/* ══ CHAT ══ */}
          {pg==="chat"&&(
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
                </div>
              )}

              {isNew?(
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:mob?"20px 16px":"40px 20px"}}>
                  <div style={{width:"100%",maxWidth:620,textAlign:"center"}}>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:8}}>
                      <div style={{animation:"bloomieWiggle 3s ease-in-out infinite"}}><Face sz={mob?64:80} agent={agent}/></div>
                    </div>
                    <h2 style={{fontSize:mob?22:28,fontWeight:700,color:c.tx,marginTop:18,marginBottom:6}}>Chat with Sarah</h2>
                    <p style={{fontSize:mob?13:15,color:c.so,marginBottom:28}}>Give her tasks, check her work, or ask what's going on</p>
                    <div style={{display:"flex",gap:mob?6:10,alignItems:"center",marginBottom:20}}>
                      <input value={tx} onChange={e=>setTx(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSend();}} placeholder={vcRec?"Listening…":"Ask anything..."} style={{flex:1,padding:mob?"12px 14px":"14px 18px",borderRadius:14,border:"1.5px solid "+(vcRec?c.ac:c.ln),fontSize:15,fontFamily:"inherit",background:c.inp,color:c.tx,transition:"border-color .2s"}}/>
                      <button onClick={()=>fRef.current?.click()} title="Attach file" style={{width:44,height:44,borderRadius:12,border:"1.5px solid "+c.ln,cursor:"pointer",background:c.cd,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                      </button>
                      <button onClick={toggleVoice} style={{width:44,height:44,borderRadius:12,border:vcRec?"2px solid "+c.ac:"1.5px solid "+c.ln,cursor:"pointer",background:vcRec?c.ac+"18":c.cd,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
                        {vcRec&&<span style={{position:"absolute",inset:-4,borderRadius:16,border:"2px solid "+c.ac,animation:"pulse 1.2s ease infinite",opacity:0.4}}/>}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={vcRec?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>
                      </button>
                      <button onClick={doSend} disabled={!tx.trim()||loading} style={{width:44,height:44,borderRadius:12,border:"none",cursor:tx.trim()&&!loading?"pointer":"not-allowed",background:tx.trim()&&!loading?"linear-gradient(135deg,#F4A261,#E76F8B)":c.sf,color:tx.trim()&&!loading?"#fff":c.fa,fontSize:18,fontWeight:700,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>➜</button>
                    </div>
                    <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                      {["What can you help me with?","Check my GHL contacts","Show system health","What tasks are pending?"].map((s,i)=>(
                        <button key={i} onClick={()=>setTx(s)} style={{padding:"8px 16px",borderRadius:20,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,color:c.so,transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ):(
                <>
                  <div style={{flex:1,minHeight:0,overflowY:"auto",display:"flex",minWidth:0}}>
                    <div style={{flex:1,minWidth:0,overflowY:"auto",overflowX:"hidden",padding:mob?"14px 12px":"18px 20px",background:c.bg}}>
                      {messages.map((m)=>{
                        const cards=m.b?parseMessageCards(m.t):[];
                        return (
                        <div key={m.id} style={{display:"flex",justifyContent:m.b?"flex-start":"flex-end",marginBottom:14,flexDirection:"column",alignItems:m.b?"flex-start":"flex-end"}}>
                          <div style={{display:"flex",justifyContent:m.b?"flex-start":"flex-end",width:"100%"}}>
                            {m.b&&<div style={{marginRight:8,marginTop:2}}><Face sz={mob?26:28} agent={agent}/></div>}
                            <div style={{maxWidth:mob?"85%":"72%",padding:"10px 14px",fontSize:mob?13:14,lineHeight:1.55,color:m.b?c.tx:"#fff",borderRadius:m.b?"6px 18px 18px 18px":"18px 6px 18px 18px",background:m.b?c.cd:"linear-gradient(135deg,#F4A261,#E76F8B)",border:m.b?"1px solid "+c.ln:"none",wordBreak:"break-word",overflowWrap:"anywhere"}}>
                              {/* File previews */}
                              {m.files&&m.files.length>0&&(
                                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:m.t?8:4}}>
                                  {m.files.map((f,fi)=>(
                                    f.type?.startsWith("image/")
                                      ? <img key={fi} src={f.dataUrl} alt={f.name} style={{maxWidth:220,maxHeight:160,borderRadius:8,objectFit:"cover",border:"1px solid rgba(255,255,255,0.15)"}}/>
                                      : <div key={fi} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.15)"}}>
                                          <span style={{fontSize:18}}>{f.type==="application/pdf"?"📄":f.type?.includes("sheet")||f.name?.endsWith(".csv")?"📊":f.type?.includes("word")||f.name?.endsWith(".docx")?"📝":"📎"}</span>
                                          <span style={{fontSize:11,fontWeight:600,color:m.b?c.tx:"#fff",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                                        </div>
                                  ))}
                                </div>
                              )}
                              {m.t&&<div>{m.t}</div>}
                              <div style={{fontSize:10,opacity:0.45,marginTop:5,textAlign:m.b?"left":"right"}}>{m.tm}</div>
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
                                : <EmailCard key={ci} subject={cd2.subject} c={c} onReview={()=>alert("Email review panel coming soon")}/>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                      {loading&&(
                        <div style={{display:"flex",justifyContent:"flex-start",marginBottom:14}}>
                          <div style={{marginRight:8,marginTop:2}}><Face sz={28} agent={agent}/></div>
                          <div style={{padding:"12px 16px",borderRadius:"6px 18px 18px 18px",background:c.cd,border:"1px solid "+c.ln,display:"flex",gap:4,alignItems:"center"}}>
                            {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:"50%",background:c.ac,animation:`pulse 1.2s ease ${i*0.2}s infinite`}}/>)}
                          </div>
                        </div>
                      )}
                      <div ref={btm}/>
                    </div>
                    {!mob&&scrM!=="hidden"&&(
                      <ResizablePanel c={c} defaultWidth={480} minWidth={280} maxWidth={800}>
                        <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
                          {/* ── Right panel tabs ── */}
                          <div style={{display:"flex",borderBottom:"1px solid "+c.ln,background:c.sf,flexShrink:0}}>
                            <button onClick={()=>setRightTab("browser")} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"none",borderBottom:rightTab==="browser"?"2px solid "+c.ac:"2px solid transparent",background:"transparent",color:rightTab==="browser"?c.tx:c.so,cursor:"pointer",letterSpacing:"0.5px"}}>🖥️ Browser</button>
                            <button onClick={()=>setRightTab("artifact")} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"none",borderBottom:rightTab==="artifact"?"2px solid "+c.ac:"2px solid transparent",background:"transparent",color:rightTab==="artifact"?c.tx:c.so,cursor:"pointer",letterSpacing:"0.5px",position:"relative"}}>
                              📄 Files
                              {activeArtifact&&<span style={{position:"absolute",top:4,right:"20%",width:6,height:6,borderRadius:"50%",background:c.ac}}/>}
                            </button>
                          </div>

                          {/* ── Browser tab ── */}
                          {rightTab==="browser"&&(
                            <>
                              <Screen c={c} mob={false} mode="docked" setMode={setScrM}/>
                              <div style={{borderTop:"1px solid "+c.ln,background:c.cd,flexShrink:0}}>
                                <div style={{padding:"10px 16px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:8}}>
                                  <span style={{width:8,height:8,borderRadius:"50%",background:c.ac,animation:"pulse 1.5s ease infinite"}}/>
                                  <span style={{fontSize:12,fontWeight:700,color:c.tx}}>Active Tasks</span>
                                </div>
                                <ActiveTaskTracker c={c}/>
                              </div>
                            </>
                          )}

                          {/* ── Files tab ── */}
                          {rightTab==="artifact"&&(
                            activeArtifact?(
                              <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                                <div style={{padding:"12px 16px",borderBottom:"1px solid "+c.ln,background:c.cd,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                                  <span style={{fontSize:18}}>📝</span>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:13,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeArtifact.name}</div>
                                  </div>
                                  {activeArtifact.fileId&&<a href={`/api/files/download/${activeArtifact.fileId}`} download style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,fontSize:11,fontWeight:600,color:c.ac,textDecoration:"none"}}>↓</a>}
                                  <button onClick={()=>setActiveArtifact(null)} style={{width:26,height:26,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",fontSize:13,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                                </div>
                                <div style={{flex:1,overflowY:"auto",padding:"16px 20px",fontSize:14,lineHeight:1.8,color:c.tx}}
                                  dangerouslySetInnerHTML={{__html: (activeArtifact.content||'')
                                    .replace(/^# (.+)$/gm, '<h1 style="font-size:22px;font-weight:700;margin:18px 0 10px">$1</h1>')
                                    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;margin:14px 0 8px">$1</h2>')
                                    .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:600;margin:12px 0 6px">$1</h3>')
                                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                                    .replace(/^- (.+)$/gm, '<li style="margin-left:20px;margin-bottom:6px">$1</li>')
                                    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:20px;margin-bottom:6px"><strong>$1.</strong> $2</li>')
                                    .replace(/\n\n/g, '<br/><br/>')
                                    .replace(/\n/g, '<br/>')
                                  }}/>
                                {/* Action buttons */}
                                <div style={{padding:"12px 16px",borderTop:"1px solid "+c.ln,background:c.cd,display:"flex",gap:8,flexShrink:0}}>
                                  <button onClick={()=>{setRightTab("browser");setTx("I want to make some changes to "+activeArtifact.name);}} style={{flex:1,padding:"10px 0",borderRadius:10,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:13,fontWeight:600,color:c.tx}}>✏️ Request Changes</button>
                                  <a href={activeArtifact.fileId?`/api/files/download/${activeArtifact.fileId}`:"#"} download style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#34a853,#2d9248)",cursor:"pointer",fontSize:13,fontWeight:700,color:"#fff",textDecoration:"none",textAlign:"center",display:"block"}}>↓ Download</a>
                                </div>
                              </div>
                            ):(
                              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:30}}>
                                <div>
                                  <div style={{fontSize:36,marginBottom:10,opacity:0.3}}>📄</div>
                                  <div style={{fontSize:13,color:"#666",marginBottom:4}}>No file open</div>
                                  <div style={{fontSize:11,color:"#555"}}>Ask Sarah to create content — it'll appear here</div>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </ResizablePanel>
                    )}
                  </div>
                  <div style={{flexShrink:0,padding:mob?"6px 10px":"8px 16px",background:c.cd,borderTop:"1px solid "+c.ln}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,paddingBottom:5}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:connected?c.gr:c.fa}}/>
                      <span style={{fontSize:11,color:c.fa}}>{connected?"Connected to Sarah's API":"Reconnecting…"}</span>
                    </div>
                    <div style={{display:"flex",gap:mob?6:8,alignItems:"center"}}>
                      <input value={tx} onChange={e=>setTx(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSend();}} placeholder={vcRec?"Listening…":mob?"Message…":"Tell Sarah what you need…"} style={{flex:1,padding:mob?"10px 14px":"11px 14px",borderRadius:12,border:"1.5px solid "+(vcRec?c.ac:c.ln),fontSize:14,fontFamily:"inherit",background:c.inp,color:c.tx,transition:"border-color .2s"}}/>
                      <button onClick={()=>fRef.current?.click()} title="Attach file" style={{width:40,height:40,borderRadius:11,border:"1.5px solid "+c.ln,cursor:"pointer",background:c.cd,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                      </button>
                      <button onClick={toggleVoice} style={{width:40,height:40,borderRadius:11,border:vcRec?"2px solid "+c.ac:"1.5px solid "+c.ln,cursor:"pointer",background:vcRec?c.ac+"18":c.cd,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
                        {vcRec&&<span style={{position:"absolute",inset:-4,borderRadius:15,border:"2px solid "+c.ac,animation:"pulse 1.2s ease infinite",opacity:0.4}}/>}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={vcRec?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>
                      </button>
                      <button onClick={doSend} disabled={!tx.trim()||loading} style={{padding:mob?"10px 16px":"11px 20px",borderRadius:12,border:"none",cursor:tx.trim()&&!loading?"pointer":"not-allowed",background:tx.trim()&&!loading?"linear-gradient(135deg,#F4A261,#E76F8B)":c.sf,color:tx.trim()&&!loading?"#fff":c.fa,fontSize:14,fontWeight:700,flexShrink:0}}>Send</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ MONITOR — Sarah's functional cards, Jaden's visual style ══ */}
          {pg==="monitor"&&(
            <div style={{overflowY:"auto",height:"calc(100vh - 52px)",padding:mob?"16px 12px 40px":"20px 20px 40px"}}>
              <div style={{marginBottom:20,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div>
                  <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>📊 Operations Monitor</h1>
                  <p style={{fontSize:13,color:c.so}}>Real-time visibility into Sarah's autonomous work</p>
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
                <InternalTasks c={c} sse={sse}/>
                <ActionLog c={c} sse={sse}/>
              </div>
              <EscalationPanel c={c} sse={sse}/>
            </div>
          )}


          {/* ══ CRON — Jaden's layout, Sarah's branding ══ */}
          {pg==="cron"&&(
            <div style={{overflowY:"auto",height:"calc(100vh - 52px)",padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:1000,margin:"0 auto"}}>
              <div style={{marginBottom:24}}>
                <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>⏰ Automation & Cron Jobs</h1>
                <p style={{fontSize:13,color:c.so}}>Manage Sarah's automated tasks and proactive behaviors</p>
              </div>
              <div style={{padding:20,borderRadius:16,background:c.cd,border:"1px solid "+c.ln,marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:c.tx,marginBottom:4}}>💗 Sarah's Proactive Heartbeat</div>
                    <div style={{fontSize:12,color:c.so}}>Set when Sarah should proactively check in with you</div>
                  </div>
                  <div style={{padding:"6px 12px",borderRadius:20,fontSize:11,fontWeight:600,background:heartbeatEnabled?c.gr+"15":c.fa+"15",color:heartbeatEnabled?c.gr:c.fa}}>{heartbeatEnabled?"Active":"Paused"}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16,marginBottom:16}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:c.so,marginBottom:6}}>Schedule (Cron Expression)</div>
                    <input value={heartbeatInterval} onChange={e=>setHeartbeatInterval(e.target.value)} placeholder="0 */6 * * *" style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid "+c.ln,background:c.sf,fontSize:13,fontFamily:"monospace",color:c.tx}}/>
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:c.so,marginBottom:6}}>Quick Presets</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {[{l:"Every hour",v:"0 * * * *"},{l:"Every 6hrs",v:"0 */6 * * *"},{l:"Daily 9am",v:"0 9 * * *"},{l:"Weekdays 9am",v:"0 9 * * 1-5"}].map(p=>(
                        <button key={p.v} onClick={()=>setHeartbeatInterval(p.v)} style={{padding:"5px 8px",borderRadius:6,border:"1px solid "+c.ln,background:heartbeatInterval===p.v?c.ac+"15":c.sf,cursor:"pointer",fontSize:10,fontWeight:500,color:heartbeatInterval===p.v?c.ac:c.so}}>{p.l}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={()=>setHeartbeatEnabled(!heartbeatEnabled)} style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",background:heartbeatEnabled?c.fa+"30":"linear-gradient(135deg,#F4A261,#E76F8B)",color:heartbeatEnabled?c.fa:"#fff",fontSize:12,fontWeight:600}}>
                  {heartbeatEnabled?"⏸️ Pause":"▶️ Start"} Heartbeat
                </button>
              </div>
              <div style={{borderRadius:16,background:c.cd,border:"1px solid "+c.ln,overflow:"hidden"}}>
                <div style={{padding:"13px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid "+c.ln,background:c.sf}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{position:"relative",width:10,height:10,display:"inline-block"}}>
                      <span style={{position:"absolute",inset:0,borderRadius:"50%",background:c.gr,animation:"pulse 1.5s ease infinite"}}/>
                      <span style={{position:"absolute",inset:2,borderRadius:"50%",background:c.gr}}/>
                    </span>
                    <span style={{fontSize:13,fontWeight:700,color:c.tx}}>Automated Tasks</span>
                    <span style={{fontSize:11,color:c.so}}>{cronJobs.filter(j=>j.on).length} active</span>
                  </div>
                  <button style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+c.ac+"40",background:"transparent",cursor:"pointer",fontSize:10,fontWeight:600,color:c.ac}}>+ Add Job</button>
                </div>
                <div style={{padding:"8px 0"}}>
                  {cronJobs.map((job,i)=>{
                    const stCl=!job.on?c.fa:job.ok?c.gr:"#E76F8B";
                    return(
                      <div key={job.id} style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:i<cronJobs.length-1?"1px solid "+c.ln+"60":"none",opacity:job.on?1:0.5}}>
                        <div style={{position:"relative",flexShrink:0}}>
                          <span style={{fontSize:16}}>{job.ic}</span>
                          <span style={{position:"absolute",bottom:-2,right:-2,width:8,height:8,borderRadius:"50%",background:stCl,border:"1.5px solid "+c.cd}}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:job.on?c.tx:c.so,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.nm}</div>
                          <div style={{fontSize:10,color:c.fa,marginTop:1}}>{job.freq} • {job.on?"Next: "+job.next:"Paused"}</div>
                        </div>
                        {job.on&&<div style={{fontSize:9,color:job.ok?c.gr:"#E76F8B",fontWeight:600}}>{job.ok?"✓ OK":"⚠ Failed"}</div>}
                        <button onClick={()=>toggleCron(job.id)} style={{width:22,height:22,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:c.so,flexShrink:0}}>{job.on?"⏸":"▶"}</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══ FILES — Approved deliverables library ══ */}
          {pg==="artifacts"&&(
            <div style={{overflowY:"auto",height:"calc(100vh - 52px)",padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:1000,margin:"0 auto"}}>
              <div style={{marginBottom:24}}>
                <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>📁 Files & Deliverables</h1>
                <p style={{fontSize:13,color:c.so}}>All approved content Sarah has created for you</p>
              </div>
              {filesLoading ? (
                <div style={{textAlign:"center",padding:40,color:c.so}}>Loading files...</div>
              ) : files.length === 0 ? (
                <div style={{textAlign:"center",padding:60,color:c.so,background:c.cd,borderRadius:16,border:"1px solid "+c.ln}}>
                  <div style={{fontSize:40,marginBottom:12}}>📂</div>
                  <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:6}}>No files yet</div>
                  <div style={{fontSize:13}}>Ask Sarah to create content — blog posts, email campaigns, SOPs, reports — and approved items will appear here.</div>
                </div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(auto-fill, minmax(280px, 1fr))",gap:14}}>
                  {files.map((f)=>{
                    const ext=(f.name||'').split('.').pop()?.toLowerCase()||'';
                    const icon=f.fileType==='image'?'🖼️':ext==='html'?'🌐':ext==='md'?'📝':ext==='js'||ext==='py'?'💻':ext==='pdf'?'📄':'📎';
                    const sizeStr=f.fileSize>1048576?`${(f.fileSize/1048576).toFixed(1)}MB`:f.fileSize>1024?`${(f.fileSize/1024).toFixed(1)}KB`:`${f.fileSize||0}B`;
                    const date=f.approvedAt?new Date(f.approvedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
                    return (
                      <div key={f.fileId} style={{background:c.cd,borderRadius:14,border:"1px solid "+c.ln,overflow:"hidden",transition:"border-color .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=c.ac}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>
                        {/* Preview area */}
                        <div style={{height:120,background:c.sf,display:"flex",alignItems:"center",justifyContent:"center",borderBottom:"1px solid "+c.ln,cursor:"pointer",position:"relative"}}
                          onClick={async()=>{
                            try{
                              const pr=await fetch(`/api/files/preview/${f.fileId}`);
                              if(pr.headers.get('content-type')?.includes('json')){
                                const pd=await pr.json();
                                setPreviewFile({name:f.name,content:pd.content||'No content',fileId:f.fileId,fileType:f.fileType});
                              } else {
                                setPreviewFile({name:f.name,content:'Binary file — use Download button',fileId:f.fileId,fileType:f.fileType});
                              }
                            }catch{setPreviewFile({name:f.name,content:'Failed to load preview',fileId:f.fileId});}
                          }}>
                          {f.fileType==='image' ? (
                            <img src={`/api/files/preview/${f.fileId}`} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                          ) : (
                            <span style={{fontSize:40}}>{icon}</span>
                          )}
                          <div style={{position:"absolute",top:8,right:8,padding:"3px 8px",borderRadius:6,background:"rgba(0,0,0,0.5)",color:"#fff",fontSize:10,fontWeight:600}}>{ext.toUpperCase()}</div>
                        </div>
                        {/* Info */}
                        <div style={{padding:"12px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <div style={{fontSize:13,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{f.name}</div>
                            <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:f.status==='approved'?"rgba(52,168,83,0.15)":"rgba(244,162,97,0.15)",color:f.status==='approved'?c.gr:c.ac}}>{f.status==='approved'?'APPROVED':'PENDING'}</span>
                          </div>
                          {f.description&&<div style={{fontSize:11,color:c.so,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.description}</div>}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:10,color:c.fa}}>{sizeStr} · {date||'Just now'}</span>
                            <div style={{display:"flex",gap:6}}>
                              {f.status==='pending'&&<button onClick={async()=>{
                                await fetch(`/api/files/artifacts/${f.fileId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved'})});
                                setFiles(p=>p.map(x=>x.fileId===f.fileId?{...x,status:'approved'}:x));
                              }} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"linear-gradient(135deg,#34a853,#2d9248)",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>✓ Approve</button>}
                              <a href={`/api/files/download/${f.fileId}`} download style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:11,fontWeight:600,color:c.ac,textDecoration:"none"}}>↓ Download</a>
                              <button onClick={async()=>{
                                if(confirm('Remove this file?')){
                                  await fetch(`/api/files/artifacts/${f.fileId}`,{method:'DELETE'});
                                  setFiles(p=>p.filter(x=>x.fileId!==f.fileId));
                                }
                              }} style={{padding:"4px 8px",borderRadius:6,border:"1px solid rgba(234,67,53,0.3)",background:"transparent",cursor:"pointer",fontSize:11,color:"#ea4335"}}>×</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ SETTINGS — Jaden's layout, Sarah's details ══ */}
          {pg==="settings"&&(
            <div style={{overflowY:"auto",height:"calc(100vh - 52px)",padding:mob?"16px 12px 40px":"20px 20px 40px",maxWidth:800,margin:"0 auto"}}>
              <div style={{marginBottom:24}}>
                <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>⚙️ Settings</h1>
                <p style={{fontSize:13,color:c.so}}>Configure Sarah and your Bloomie experience</p>
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
                            <div style={{fontSize:14,fontWeight:700,color:c.tx}}>Sarah Rodriguez</div>
                            <div style={{fontSize:12,color:c.so}}>Marketing & Operations Executive</div>
                            <div style={{fontSize:11,color:c.gr,marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                              <span style={{width:6,height:6,borderRadius:"50%",background:c.gr}}/>Level 1 Assistant · 60 GHL Tools
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {stab==="Connection"&&(
                    <div>
                      <div style={{marginBottom:28}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Sarah's API</div>
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
        </div>
      </div>

      {/* ── POP-OUT SCREEN ── */}
      {scrM==="pop"&&<Screen c={c} mob={mob} mode="pop" setMode={setScrM}/>}
      {scrM==="full"&&<Screen c={c} mob={mob} mode="full" setMode={setScrM}/>}

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
                      fetch('/api/agent/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobTitle:editTitle,jobDescription:editDesc})})
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
                    <textarea value={newTask.instruction} onChange={e=>setNewTask(p=>({...p,instruction:e.target.value}))} placeholder="What should Sarah do?" rows={3} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:13,color:c.tx,marginBottom:8,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <select value={newTask.taskType} onChange={e=>setNewTask(p=>({...p,taskType:e.target.value}))} style={{flex:1,padding:"7px 8px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx}}>
                        <option value="content">Content</option>
                        <option value="email">Email</option>
                        <option value="research">Research</option>
                        <option value="crm">CRM</option>
                        <option value="custom">Custom</option>
                      </select>
                      <select value={newTask.frequency} onChange={e=>setNewTask(p=>({...p,frequency:e.target.value}))} style={{flex:1,padding:"7px 8px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx}}>
                        <option value="daily">Daily</option>
                        <option value="weekdays">Weekdays</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <input type="time" value={newTask.runTime} onChange={e=>setNewTask(p=>({...p,runTime:e.target.value}))} style={{width:90,padding:"7px 8px",borderRadius:6,border:"1px solid "+c.ln,background:c.inp,fontSize:12,color:c.tx}}/>
                    </div>
                    <button onClick={async()=>{
                      if(!newTask.name||!newTask.instruction) return;
                      await fetch('/api/agent/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newTask)});
                      setNewTask({name:'',instruction:'',taskType:'content',frequency:'daily',runTime:'09:00'});
                      setTaskFormOpen(false);
                      loadProfile();
                    }} disabled={!newTask.name||!newTask.instruction} style={{width:"100%",padding:"9px 0",borderRadius:8,border:"none",background:newTask.name&&newTask.instruction?"linear-gradient(135deg,#34a853,#2d9248)":"#555",cursor:newTask.name&&newTask.instruction?"pointer":"not-allowed",fontSize:13,fontWeight:700,color:"#fff"}}>Create Task</button>
                  </div>
                )}

                {/* Task list */}
                {scheduledTasks.length===0&&!taskFormOpen&&(
                  <div style={{textAlign:"center",padding:"16px 0",color:c.so,fontSize:12}}>No scheduled tasks yet. Add one or tell Sarah in chat.</div>
                )}
                {scheduledTasks.map(t=>(
                  <div key={t.taskId} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid "+c.ln+"40"}}>
                    <button onClick={async()=>{
                      await fetch(`/api/agent/tasks/${t.taskId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!t.enabled})});
                      loadProfile();
                    }} style={{width:20,height:20,borderRadius:4,border:"1.5px solid "+(t.enabled?c.gr:c.ln),background:t.enabled?"rgba(52,168,83,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>
                      {t.enabled&&'✓'}
                    </button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:t.enabled?c.tx:c.so,opacity:t.enabled?1:0.5}}>{t.name}</div>
                      <div style={{fontSize:11,color:c.so}}>{t.frequency} at {t.runTime || '9:00 AM'}{t.runCount>0?' · ran '+t.runCount+'x':''}</div>
                    </div>
                    <button onClick={async()=>{
                      if(confirm('Delete this task?')){
                        await fetch(`/api/agent/tasks/${t.taskId}`,{method:'DELETE'});
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
        <div onClick={()=>setPreviewFile(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:mob?8:40}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:800,maxHeight:"90vh",background:c.cd,borderRadius:16,border:"1px solid "+c.ln,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:10,background:c.sf}}>
              <span style={{fontSize:18}}>📄</span>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700,color:c.tx}}>{previewFile.name}</div>
              </div>
              <a href={`/api/files/download/${previewFile.fileId}`} download style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,fontSize:12,fontWeight:600,color:c.ac,textDecoration:"none",marginRight:8}}>↓ Download</a>
              <button onClick={()=>setPreviewFile(null)} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:16,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"20px 24px",fontSize:15,lineHeight:1.8,color:c.tx}}
              dangerouslySetInnerHTML={{__html: (previewFile.content||'')
                .replace(/^# (.+)$/gm, '<h1 style="font-size:24px;font-weight:700;margin:20px 0 10px">$1</h1>')
                .replace(/^## (.+)$/gm, '<h2 style="font-size:20px;font-weight:700;margin:16px 0 8px">$1</h2>')
                .replace(/^### (.+)$/gm, '<h3 style="font-size:17px;font-weight:600;margin:14px 0 6px">$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/^- (.+)$/gm, '<li style="margin-left:20px;margin-bottom:6px">$1</li>')
                .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:20px;margin-bottom:6px"><strong>$1.</strong> $2</li>')
                .replace(/\n\n/g, '<br/><br/>')
                .replace(/\n/g, '<br/>')
              }}/>
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
              <div style={{fontSize:11,color:"rgba(255,255,255,.8)"}}>Sarah Rodriguez</div>
            </div>
            <button onClick={()=>setHlpO(false)} style={{width:28,height:28,borderRadius:"50%",border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.15)",cursor:"pointer",color:"#fff",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            {[
              {ic:"💬",t:"Chat with Sarah",d:"Give her tasks directly"},
              {ic:"📊",t:"Monitor tab",d:"Health, trust gate, tool performance"},
              {ic:"⏰",t:"Automation",d:"Configure cron jobs & heartbeat"},
              {ic:"🖥️",t:"Screen viewer",d:"Watch Sarah work in real time"},
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
    </div>
  );
}
