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
function Face({sz,agent}) {
  const s=sz||30;
  const ag=agent||{nm:"Sarah",img:null,grad:"linear-gradient(135deg,#F4A261,#E76F8B)"};
  if(ag.img) return(
    <div style={{width:s,height:s,flexShrink:0}}>
      <div style={{width:s,height:s,borderRadius:s*0.3,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
        <img src={ag.img} alt={ag.nm} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      </div>
    </div>
  );
  const ini=ag.nm.split(" ").map(w=>w[0]).join("").slice(0,2);
  return(
    <div style={{width:s,height:s,flexShrink:0}}>
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
  const [connected,setConnected] = useState(false);
  const cbs = useRef(new Map());

  useEffect(()=>{
    let es;
    const connect=()=>{
      try {
        es = new EventSource("/api/dashboard/stream");
        es.onopen=()=>setConnected(true);
        es.onmessage=(e)=>{
          try{const d=JSON.parse(e.data);cbs.current.forEach(cb=>cb(d));}catch{}
        };
        es.onerror=()=>{ setConnected(false); es.close(); setTimeout(connect,5000); };
      } catch { setTimeout(connect,5000); }
    };
    connect();
    return ()=>{ try{es&&es.close();}catch{} };
  },[]);

  const register=(key,cb)=>{ cbs.current.set(key,cb); return ()=>cbs.current.delete(key); };
  return {connected,register};
}

/* ═══════════════════════════════════════════════════════════════
   CHAT — Sarah's API
   ═══════════════════════════════════════════════════════════════ */
function useSarahChat() {
  const [messages,setMessages] = useState([]);
  const [loading,setLoading] = useState(false);
  const sid = useRef("session-"+Date.now());

  const send = async (text) => {
    if(!text.trim()) return false;
    const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    setMessages(p=>[...p,{id:Date.now(),b:false,t:text,tm:ts}]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,sessionId:sid.current})});
      const data = await res.json();
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:data.response||data.message||"Done.",tm:ts2}]);
      return true;
    } catch {
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:"Connection issue — please try again.",tm:ts2}]);
      return false;
    } finally { setLoading(false); }
  };

  return {messages,setMessages,send,loading};
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

// ── SCREEN VIEWER — exact copy from Jaden
function Screen({c,mob,live,mode,setMode}) {
  if(mode==="hidden") return null;
  const wrap=mode==="full"
    ?{position:"fixed",inset:0,zIndex:300,background:"#000",display:"flex",flexDirection:"column"}
    :mode==="pop"
    ?{position:"fixed",bottom:mob?12:20,right:mob?12:20,width:mob?200:340,height:mob?130:210,zIndex:250,borderRadius:14,overflow:"hidden",boxShadow:"0 12px 48px rgba(0,0,0,.45)",border:"2px solid "+c.ac+"60"}
    :{borderRadius:12,overflow:"hidden",border:"1.5px solid "+(live?c.gr+"50":c.ln)};
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
      <div style={{background:"#0a0a0a",flex:mode==="full"?1:undefined,aspectRatio:mode==="full"?undefined:"16/9",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        {live?(
          <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:mob?"85%":"65%",background:"#161616",borderRadius:8,overflow:"hidden",border:"1px solid #333"}}>
              <div style={{padding:"6px 10px",background:"#1c1c1c",display:"flex",alignItems:"center",gap:6}}>
                <div style={{display:"flex",gap:4}}>{["#ff5f57","#febc2e","#28c840"].map((co,i)=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:co}}/>)}</div>
                <div style={{flex:1,padding:"3px 8px",borderRadius:4,background:"#111",fontSize:10,color:"#888",fontFamily:"monospace"}}>working…</div>
              </div>
              <div style={{padding:20}}>
                <div style={{height:10,width:"60%",background:"#2a2a2a",borderRadius:3,marginBottom:8}}/>
                <div style={{height:8,width:"90%",background:"#222",borderRadius:3,marginBottom:6}}/>
                <div style={{height:8,width:"75%",background:"#222",borderRadius:3}}/>
              </div>
            </div>
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
export default function App() {
  const W=useW();
  const mob=W<768;
  const [dark,setDark]=useState(true);
  const c=mk(dark);

  const sse=useSSE();
  const {messages,setMessages,send,loading}=useSarahChat();
  const connected=sse.connected;

  const [pg,setPg]=useState("chat");
  const [tx,setTx]=useState("");
  const [isNew,setNew]=useState(true);
  const [vcRec,setVcRec]=useState(false);
  const [scrM,setScrM]=useState("docked");
  const [scrLive]=useState(false);
  const [sbO,setSbO]=useState(!mob?"full":"closed");
  const [stab,setStab]=useState("General");
  const [hlpO,setHlpO]=useState(false);
  const [umO,setUmO]=useState(false);
  const [heartbeatInterval,setHeartbeatInterval]=useState("0 */6 * * *");
  const [heartbeatEnabled,setHeartbeatEnabled]=useState(true);
  const [cronJobs,setCronJobs]=useState([
    {id:"c1",nm:"GHL contact sync",ic:"👥",freq:"Every 15min",next:"—",last:"—",ok:true,on:true},
    {id:"c2",nm:"Proactive check-in",ic:"💬",freq:"Every 6hrs",next:"—",last:"—",ok:true,on:true},
    {id:"c3",nm:"System health scan",ic:"🔍",freq:"Every 30min",next:"—",last:"—",ok:true,on:true},
    {id:"c4",nm:"Task completion scan",ic:"✅",freq:"Hourly",next:"—",last:"—",ok:true,on:true},
  ]);

  const btm=useRef(null);
  const fRef=useRef(null);
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
    const text=tx.trim(); setTx(""); if(isNew) setNew(false);
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
    {k:"monitor",l:mob?"📊":"📊 Monitor"},
    {k:"cron",l:mob?"⏰":"⏰ Jobs"},
    {k:"settings",l:mob?"⚙️":"⚙️ Settings"},
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
      <input ref={fRef} type="file" multiple style={{display:"none"}}/>

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
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:12,background:connected?c.gf:"#fef2f2",border:"1px solid "+(connected?c.gr+"30":"#fecaca")}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:connected?c.gr:"#ef4444",animation:connected?"pulse 1.5s ease infinite":"none"}}/>
            <span style={{fontSize:10,fontWeight:600,color:connected?c.gr:"#dc2626"}}>{connected?"Connected":"Offline"}</span>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {scrM==="hidden"&&<button onClick={()=>setScrM("docked")} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>🖥️</button>}
          <button onClick={()=>setUmO(!umO)} style={{width:36,height:36,borderRadius:"50%",border:umO?"2px solid "+c.ac:"2px solid "+c.ln,background:"linear-gradient(135deg,#F4A261,#E76F8B)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>K</button>
          {umO&&(
            <div style={{position:"absolute",top:"100%",right:0,marginTop:8,width:220,background:c.cd,borderRadius:14,border:"1px solid "+c.ln,boxShadow:"0 12px 40px rgba(0,0,0,.22)",overflow:"hidden",animation:"pop .2s ease",zIndex:80}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>K</div>
                <div><div style={{fontSize:13,fontWeight:700,color:c.tx}}>Kimberly</div><div style={{fontSize:11,color:c.so}}>Owner</div></div>
              </div>
              <button onClick={()=>{setUmO(false);setDark(!dark);}} style={{width:"100%",textAlign:"left",padding:"11px 16px",border:"none",cursor:"pointer",background:"transparent",fontSize:13,color:c.tx,display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid "+c.ln}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:16}}>{dark?"☀️":"🌙"}</span>{dark?"Light mode":"Dark mode"}
              </button>
              <button onClick={()=>{setUmO(false);setPg("settings");}} style={{width:"100%",textAlign:"left",padding:"11px 16px",border:"none",cursor:"pointer",background:"transparent",fontSize:13,color:c.tx,display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:16}}>⚙️</span>Settings
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{display:"flex",position:"relative"}}>
        {pg==="chat"&&sbO==="full"&&mob&&<div onClick={()=>setSbO("closed")} style={{position:"fixed",inset:0,top:52,background:"rgba(0,0,0,.3)",zIndex:45}}/>}

        {/* ── SIDEBAR — exact Jaden layout ── */}
        {pg==="chat"&&sbOpen&&(
          <div style={mob?{position:"fixed",top:52,left:0,bottom:0,zIndex:50}:{}}>
            <div style={{width:sbO==="mini"?60:260,height:"calc(100vh - 52px)",background:c.cd,borderRight:"1px solid "+c.ln,display:"flex",flexDirection:"column",flexShrink:0,transition:"width .2s ease",overflow:"hidden"}}>
              {sbO==="mini"&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"12px 0",gap:4,flex:1}}>
                  <button onClick={()=>setNew(true)} style={{width:40,height:40,borderRadius:10,border:"1.5px dashed "+c.ln,background:"transparent",cursor:"pointer",fontSize:16,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  <div style={{marginTop:4,animation:"bloomieWiggle 3s ease-in-out infinite"}}><Face sz={36} agent={agent}/></div>
                  <div style={{width:32,height:1,background:c.ln,margin:"6px 0"}}/>
                  <button onClick={()=>setSbO("full")} style={{width:40,height:40,borderRadius:10,border:"none",background:c.sf,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:c.tx,marginTop:"auto"}}>K</button>
                </div>
              )}
              {sbO==="full"&&(
                <>
                  <div style={{padding:"14px 14px 8px"}}>
                    <button onClick={()=>setNew(true)} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"1.5px dashed "+c.ln,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,color:c.so}}>+ New chat</button>
                  </div>
                  <div style={{margin:"0 14px 10px"}}>
                    <div style={{padding:"10px 12px",borderRadius:12,background:c.sf,border:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:10}}>
                      <div style={{animation:"bloomieWiggle 3s ease-in-out infinite"}}><Face sz={36} agent={agent}/></div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{agent.nm}</div>
                        <div style={{fontSize:11,color:c.so}}>{agent.role}</div>
                        <div style={{fontSize:10,color:connected?c.gr:c.fa,display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:connected?c.gr:c.fa,animation:connected?"pulse 1.5s ease infinite":"none"}}/>
                          {connected?"Online":"Offline"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{flex:1}}/>
                  <div style={{padding:"10px 14px",borderTop:"1px solid "+c.ln}}>
                    <div style={{padding:"10px 12px",borderRadius:10,display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:8,background:c.sf,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:c.tx}}>K</div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.tx}}>Kimberly</div><div style={{fontSize:11,color:c.so}}>Owner</div></div>
                    </div>
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
                  <Face sz={mob?28:32} agent={agent}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:mob?14:15,fontWeight:700,color:c.tx}}>{agent.nm}</div>
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
                  <div style={{flex:1,minHeight:0,overflowY:"auto",display:"flex"}}>
                    <div style={{flex:1,padding:mob?"14px 12px":"18px 20px",background:c.bg}}>
                      {messages.map((m)=>(
                        <div key={m.id} style={{display:"flex",justifyContent:m.b?"flex-start":"flex-end",marginBottom:14}}>
                          {m.b&&<div style={{marginRight:8,marginTop:2}}><Face sz={mob?26:28} agent={agent}/></div>}
                          <div style={{maxWidth:mob?"85%":"70%",padding:"12px 16px",fontSize:mob?13:14,lineHeight:1.55,color:m.b?c.tx:"#fff",borderRadius:m.b?"6px 18px 18px 18px":"18px 6px 18px 18px",background:m.b?c.cd:"linear-gradient(135deg,#F4A261,#E76F8B)",border:m.b?"1px solid "+c.ln:"none"}}>
                            {m.t}
                            <div style={{fontSize:10,opacity:0.45,marginTop:5,textAlign:m.b?"left":"right"}}>{m.tm}</div>
                          </div>
                        </div>
                      ))}
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
                      <div style={{width:320,flexShrink:0,padding:"8px 12px 8px 0"}}>
                        <Screen c={c} mob={false} live={scrLive} mode="docked" setMode={setScrM}/>
                      </div>
                    )}
                  </div>
                  <div style={{flexShrink:0,padding:mob?"6px 10px":"8px 16px",background:c.cd,borderTop:"1px solid "+c.ln}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,paddingBottom:5}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:connected?c.gr:c.fa}}/>
                      <span style={{fontSize:11,color:c.fa}}>{connected?"Connected to Sarah's API":"Reconnecting…"}</span>
                    </div>
                    <div style={{display:"flex",gap:mob?6:8,alignItems:"center"}}>
                      <input value={tx} onChange={e=>setTx(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSend();}} placeholder={vcRec?"Listening…":mob?"Message…":"Tell Sarah what you need…"} style={{flex:1,padding:mob?"10px 14px":"11px 14px",borderRadius:12,border:"1.5px solid "+(vcRec?c.ac:c.ln),fontSize:14,fontFamily:"inherit",background:c.inp,color:c.tx,transition:"border-color .2s"}}/>
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
              <div style={{marginBottom:20}}>
                <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:6}}>📊 Operations Monitor</h1>
                <p style={{fontSize:13,color:c.so}}>Real-time visibility into Sarah's autonomous work</p>
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
      {scrM==="pop"&&<Screen c={c} mob={mob} live={scrLive} mode="pop" setMode={setScrM}/>}
      {scrM==="full"&&<Screen c={c} mob={mob} live={scrLive} mode="full" setMode={setScrM}/>}

      {/* ── HELP BUBBLE — exact Jaden ── */}
      {!hlpO&&(
        <button onClick={()=>setHlpO(true)} style={{position:"fixed",bottom:mob?16:24,right:mob?16:24,width:56,height:56,borderRadius:"50%",border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",cursor:"pointer",boxShadow:"0 4px 20px rgba(231,111,139,.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:90,transition:"transform .2s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
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
