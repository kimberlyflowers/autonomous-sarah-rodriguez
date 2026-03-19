import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';

const themes = {
  dark: { bg:'#0d0d0d', sf:'#1a1a1a', card:'#1e1e1e', border:'#2a2a2e', tx:'#f0f0f0', sub:'#999', muted:'#555', accent:'#F4A261', accent2:'#E76F8B', gradient:'linear-gradient(135deg,#F4A261,#E76F8B)', userBubble:'linear-gradient(135deg,#F4A261,#E76F8B)', agentBubble:'#1e1e1e', agentBorder:'#2a2a2e', input:'#1a1a1a', inputBorder:'#2a2a2e' },
  light: { bg:'#f7f5f2', sf:'#ffffff', card:'#ffffff', border:'#e5e5e5', tx:'#111', sub:'#666', muted:'#aaa', accent:'#F4A261', accent2:'#E76F8B', gradient:'linear-gradient(135deg,#F4A261,#E76F8B)', userBubble:'linear-gradient(135deg,#F4A261,#E76F8B)', agentBubble:'#ffffff', agentBorder:'#e5e5e5', input:'#ffffff', inputBorder:'#e5e5e5' },
};

const API = window.location.origin;
async function authHeaders() {
  const { data:{session} } = await supabase.auth.getSession();
  return session ? { 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` } : { 'Content-Type':'application/json' };
}
function ini(name) { return (name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function ts() { return new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }

// ── ICONS ──
const PlusIcon = ({color})=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const SendIcon = ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const ChevronDown = ({color})=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>;
const CameraIcon = ({color})=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const ImageIcon = ({color})=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const FileIcon = ({color})=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

function TypingDots({c}){ return(<div style={{display:'flex',gap:4,padding:'12px 16px',background:c.agentBubble,border:'1px solid '+c.agentBorder,borderRadius:'18px 18px 18px 4px',width:'fit-content'}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:c.muted,animation:`typingBounce 1.2s ease-in-out ${i*0.15}s infinite`}}/>)}</div>); }

// ── AVATAR COMPONENT ──
function Avatar({src, name, size=36, radius=10, c}) {
  if (src) return <img src={src} alt={name} style={{width:size,height:size,borderRadius:radius,objectFit:'cover',flexShrink:0}}/>;
  return <div style={{width:size,height:size,borderRadius:radius,background:c?.gradient||'linear-gradient(135deg,#F4A261,#E76F8B)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.36,fontWeight:700,color:'#fff',flexShrink:0}}>{ini(name)}</div>;
}

// ── LOGIN ──
function MobileLogin({ onLogin }) {
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  const go = async(e)=>{ e.preventDefault(); if(!email||!pw){setErr('Enter email and password');return;} setErr('');setBusy(true);
    const{error}=await supabase.auth.signInWithPassword({email,password:pw}); if(error){setErr(error.message);setBusy(false);return;} onLogin(); };
  return (
    <div style={{position:'fixed',inset:0,background:'#0d0d0d',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,paddingTop:'max(24px,env(safe-area-inset-top))',fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`html{padding:0 !important;min-height:100vh !important;background:#0d0d0d !important;overflow:hidden !important;}body{margin:0;overflow:hidden;background:#0d0d0d;}`}</style>
      <div style={{width:56,height:56,borderRadius:14,background:'linear-gradient(135deg,#F4A261,#E76F8B)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:800,color:'#fff',marginBottom:16}}>B</div>
      <div style={{fontSize:20,fontWeight:700,color:'#f0f0f0',marginBottom:4}}>BLOOM</div>
      <div style={{fontSize:13,color:'#666',marginBottom:32}}>Sign in to chat with your Bloomie</div>
      <form onSubmit={go} style={{width:'100%',maxWidth:320,display:'flex',flexDirection:'column',gap:10}}>
        <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="email" style={{padding:'14px 16px',borderRadius:12,border:'1px solid #2a2a2e',background:'#1a1a1a',color:'#f0f0f0',fontSize:15,fontFamily:'inherit',outline:'none'}}/>
        <input value={pw} onChange={e=>setPw(e.target.value)} type="password" placeholder="Password" autoComplete="current-password" style={{padding:'14px 16px',borderRadius:12,border:'1px solid #2a2a2e',background:'#1a1a1a',color:'#f0f0f0',fontSize:15,fontFamily:'inherit',outline:'none'}}/>
        <button type="submit" disabled={busy} style={{padding:14,borderRadius:12,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:15,fontWeight:700,fontFamily:'inherit',cursor:busy?'wait':'pointer',opacity:busy?0.6:1}}>{busy?'Signing in...':'Sign In'}</button>
        {err&&<div style={{fontSize:13,color:'#ef4444',textAlign:'center',marginTop:4}}>{err}</div>}
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN MOBILE APP
// ══════════════════════════════════════════════════════════════════════════
export default function MobileApp({ user: authUser }) {
  const [dark,setDark]=useState(()=>localStorage.getItem('bloom-mobile-theme')!=='light');
  const c = dark ? themes.dark : themes.light;
  const [tab,setTab]=useState('text');
  const [user,setUser]=useState(authUser||null);
  const [allAgents,setAllAgents]=useState([]);
  const [agent,setAgent]=useState(null);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState('');
  const [sending,setSending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [showPicker,setShowPicker]=useState(false);
  const [showAttach,setShowAttach]=useState(false);
  const [initError,setInitError]=useState(null);
  const chatEndRef=useRef(null);
  const sessionRef=useRef(null);
  const inputRef=useRef(null);
  const fileRef=useRef(null);
  const cameraRef=useRef(null);

  // Group chat state
  const [groupMsgs,setGroupMsgs]=useState([]);
  const [groupInput,setGroupInput]=useState('');
  const [groupSending,setGroupSending]=useState(false);
  const groupEndRef=useRef(null);
  const groupSessionRef=useRef('group-'+Date.now());

  const toggleTheme=()=>{const n=!dark;setDark(n);localStorage.setItem('bloom-mobile-theme',n?'dark':'light');};

  // ── Auth ──
  useEffect(()=>{
    if(user)return;
    supabase.auth.getSession().then(({data:{session}})=>{if(session?.user)setUser(session.user);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setUser(s?.user??null);});
    return ()=>subscription.unsubscribe();
  },[]);

  // ── INIT: Load everything from server (bypasses RLS) ──
  useEffect(()=>{
    if(!user)return;
    (async()=>{
      try {
        const h = await authHeaders();
        const res = await fetch(API+'/api/mobile/init', { headers: h });
        if (!res.ok) { setInitError('Failed to load: '+res.status); setLoading(false); return; }
        const data = await res.json();
        console.log('[Mobile] Init loaded:', data.agents?.length, 'agents, org:', data.org?.name);

        if (data.agents?.length) {
          setAllAgents(data.agents);
          // Set active agent
          const assigned = data.agents.find(a => a.id === data.assignedAgentId);
          const active = assigned || data.agents[0];
          setAgent(active);
          // Unique session per mobile visit — won't collide with dashboard sessions
          // Messages still sync to dashboard because they're stored by agent_id in the messages table
          sessionRef.current = 'mobile-' + active.id.slice(0, 8) + '-' + Date.now().toString(36);
          // Load messages for active agent
          const agentMsgs = data.messages?.[active.id] || [];
          setMessages(agentMsgs.map(m => ({
            id: m.id, isUser: m.role === 'user', text: m.content,
            time: new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          })));
        }
      } catch(e) { console.error('[Mobile] Init error:', e); setInitError(e.message); }
      setLoading(false);
    })();
  },[user]);

  // ── Switch agent ──
  const switchAgent = async (a) => {
    setAgent(a); setShowPicker(false); setMessages([]); setSending(false);
    sessionRef.current = 'mobile-' + a.id.slice(0, 8) + '-' + Date.now().toString(36);
    try {
      const h = await authHeaders();
      const res = await fetch(API+'/api/mobile/messages/'+a.id, { headers: h });
      const data = await res.json();
      setMessages((data.messages||[]).map(m => ({
        id: m.id, isUser: m.role === 'user', text: m.content,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      })));
    } catch(e) { console.error('Load messages failed:', e); }
  };

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:'smooth'});},[messages,sending]);
  useEffect(()=>{groupEndRef.current?.scrollIntoView({behavior:'smooth'});},[groupMsgs,groupSending]);

  // ── Send text ──
  const sendMessage=useCallback(async()=>{
    const text=input.trim(); if(!text||sending)return;
    setInput('');setSending(true);
    setMessages(p=>[...p,{id:'u-'+Date.now(),isUser:true,text,time:ts()}]);
    try{
      const h=await authHeaders();
      const r=await fetch(API+'/api/chat/message',{method:'POST',headers:h,body:JSON.stringify({message:text,sessionId:sessionRef.current,agentId:agent?.id})});
      const d=await r.json();
      const rt=(d.response||d.message||'Done.').replace(/\s*\[Session context[\s\S]*$/,'').replace(/\s*\[Tool:.*?\]\s*/g,'').trim();
      setMessages(p=>[...p,{id:'a-'+Date.now(),isUser:false,text:rt,time:ts()}]);
    }catch(e){setMessages(p=>[...p,{id:'e-'+Date.now(),isUser:false,text:'Something went wrong. Try again.',time:ts()}]);}
    setSending(false);inputRef.current?.focus();
  },[input,sending,agent]);

  // ── Send files ──
  const sendFiles=useCallback(async(files,text='')=>{
    if(!files.length)return; setSending(true);setShowAttach(false);
    const encoded=await Promise.all(files.map(f=>new Promise((res,rej)=>{
      const r=new FileReader();r.onload=()=>res({name:f.name,type:f.type,data:r.result.split(',')[1]});r.onerror=rej;r.readAsDataURL(f);
    })));
    setMessages(p=>[...p,{id:'u-'+Date.now(),isUser:true,text:text||(files.length===1?files[0].name:`${files.length} files`),time:ts()}]);
    try{
      const h=await authHeaders();
      const r=await fetch(API+'/api/chat/upload',{method:'POST',headers:h,body:JSON.stringify({message:text||'',sessionId:sessionRef.current,agentId:agent?.id,files:encoded})});
      const d=await r.json();
      const rt=(d.response||d.message||'Got it.').replace(/\s*\[Session context[\s\S]*$/,'').replace(/\s*\[Tool:.*?\]\s*/g,'').trim();
      setMessages(p=>[...p,{id:'a-'+Date.now(),isUser:false,text:rt,time:ts()}]);
    }catch(e){setMessages(p=>[...p,{id:'e-'+Date.now(),isUser:false,text:'Upload failed.',time:ts()}]);}
    setSending(false);
  },[agent]);

  const handleFile=(e)=>{const f=Array.from(e.target.files||[]);if(f.length)sendFiles(f,input.trim());e.target.value='';};

  // ── Group chat send (SEQUENTIAL — agents respond one at a time, seeing prior replies) ──
  const sendGroupMessage=useCallback(async()=>{
    const text=groupInput.trim(); if(!text||groupSending||!allAgents.length)return;
    setGroupInput('');setGroupSending(true);
    setGroupMsgs(p=>[...p,{id:'gu-'+Date.now(),from:'user',text,time:ts()}]);

    // Smart routing: detect which agent(s) are being addressed
    const textLower = text.toLowerCase();
    const addressed = allAgents.filter(a => {
      const first = a.name.split(' ')[0].toLowerCase();
      const full = a.name.toLowerCase();
      return textLower.includes(first) || textLower.includes(full);
    });
    // If specific agent(s) named, only they respond. Otherwise all respond.
    const respondingAgents = addressed.length > 0 ? addressed : allAgents;

    // Build thread context from recent messages
    const recentThread = [...groupMsgs.slice(-30), {from:'user',text}];
    const threadText = recentThread.map(m =>
      m.from==='user' ? `Client: ${m.text}` : `${m.fromAgent}: ${m.text}`
    ).join('\n');

    // Send to each agent SEQUENTIALLY — each sees the full thread including prior agent replies
    let runningThread = threadText;
    for (const a of respondingAgents) {
      const contextMsg = `[You are ${a.name} in a group chat with the client and ${allAgents.length-1} other Bloomie(s): ${allAgents.filter(x=>x.id!==a.id).map(x=>x.name).join(', ')}. Here is the conversation so far:\n${runningThread}\n\nRespond naturally as ${a.name}. Only speak if the message is relevant to you — if someone else was asked a direct question and you weren't, just stay silent. Keep it conversational.]`;

      try {
        const h = await authHeaders();
        const r = await fetch(API+'/api/chat/message',{method:'POST',headers:h,
          body:JSON.stringify({message:contextMsg,sessionId:groupSessionRef.current+'-'+a.id.slice(0,8),agentId:a.id})});
        const d = await r.json();
        let rt = (d.response||d.message||'').replace(/\s*\[Session context[\s\S]*$/,'').replace(/\s*\[Tool:.*?\]\s*/g,'').trim();
        // Strip any context prefix the agent might echo back
        rt = rt.replace(/^\[You are[\s\S]*?conversational\.\]\s*/,'').trim();

        if (rt && !rt.match(/^(\*stays silent\*|\*silent\*|\.\.\.|\*no response\*)/i)) {
          const msg = {id:'ga-'+a.id.slice(0,8)+'-'+Date.now(),from:'agent',fromAgent:a.name,agentId:a.id,avatar:a.avatar_url,text:rt,time:ts()};
          setGroupMsgs(p=>[...p,msg]);
          // Add this response to running thread so next agent sees it
          runningThread += `\n${a.name}: ${rt}`;
        }
      } catch(e) { console.error('Group send to '+a.name+' failed:',e); }
    }
    setGroupSending(false);
  },[groupInput,groupSending,allAgents,groupMsgs]);

  const handleSignOut=async()=>{await supabase.auth.signOut();setUser(null);};

  if(!user) return <MobileLogin onLogin={()=>supabase.auth.getSession().then(({data:{session}})=>setUser(session?.user))}/>;

  const agentName = agent?.name || 'Loading...';
  const agentRole = agent?.job_title || agent?.role || '';

  return (
    <div style={{position:'fixed',inset:0,background:c.bg,display:'flex',flexDirection:'column',fontFamily:"'DM Sans',system-ui,sans-serif",overflow:'hidden',
      paddingTop:'env(safe-area-inset-top)',paddingLeft:'env(safe-area-inset-left)',paddingRight:'env(safe-area-inset-right)'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        html{padding:0 !important;min-height:100vh !important;background:${c.bg} !important;overflow:hidden !important;}
        body{margin:0;padding:0;overflow:hidden;height:100vh;background:${c.bg};overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;}
        #root{height:100vh;overflow:hidden;}
        @keyframes typingBounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-4px);}}
        input:focus,textarea:focus{outline:none;}::-webkit-scrollbar{width:0;}
        button{-webkit-user-select:none;user-select:none;}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid '+c.border,background:c.sf,flexShrink:0,position:'relative'}}>
        <div onClick={()=>allAgents.length>1&&setShowPicker(!showPicker)} style={{cursor:allAgents.length>1?'pointer':'default',position:'relative'}}>
          <Avatar src={agent?.avatar_url} name={agentName} size={38} radius={10} c={c}/>
          {allAgents.length>1&&<div style={{position:'absolute',bottom:-2,right:-2,width:14,height:14,borderRadius:7,background:c.sf,border:'1px solid '+c.border,display:'flex',alignItems:'center',justifyContent:'center'}}><ChevronDown color={c.accent}/></div>}
        </div>
        <div style={{flex:1,minWidth:0}} onClick={()=>allAgents.length>1&&setShowPicker(!showPicker)}>
          <div style={{fontSize:15,fontWeight:700,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4}}>
            {agentName}
            {allAgents.length>1&&<ChevronDown color={c.muted}/>}
          </div>
          <div style={{fontSize:11,color:c.sub}}>{agentRole}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'#34a853'}}/>
          <span style={{fontSize:10,color:'#34a853',fontWeight:600}}>Online</span>
        </div>
        <button onClick={toggleTheme} style={{width:28,height:28,borderRadius:7,border:'1px solid '+c.border,background:c.card,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:12}}>{dark?'\u2600\uFE0F':'\uD83C\uDF19'}</button>
        <button onClick={handleSignOut} style={{fontSize:10,color:c.muted,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>Sign out</button>

        {/* Agent picker dropdown */}
        {showPicker&&allAgents.length>1&&(
          <div style={{position:'absolute',top:'100%',left:8,right:8,zIndex:100,background:c.sf,border:'1px solid '+c.border,borderRadius:12,boxShadow:'0 8px 30px rgba(0,0,0,0.3)',overflow:'hidden',marginTop:4}}>
            {allAgents.map(a=>(
              <button key={a.id} onClick={()=>switchAgent(a)}
                style={{width:'100%',padding:'12px 14px',display:'flex',alignItems:'center',gap:10,background:a.id===agent?.id?c.card:'transparent',border:'none',borderBottom:'1px solid '+c.border,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                <Avatar src={a.avatar_url} name={a.name} size={32} radius={8} c={c}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{a.name}</div>
                  <div style={{fontSize:11,color:c.sub}}>{a.job_title||a.role||'AI Employee'}</div>
                </div>
                {a.id===agent?.id&&<div style={{width:8,height:8,borderRadius:4,background:c.accent}}/>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ═══ TABS ═══ */}
      <div style={{display:'flex',borderBottom:'1px solid '+c.border,background:c.sf,flexShrink:0}}>
        {['Text','Call','Conference'].map(t=>{const a=tab===t.toLowerCase();
          return <button key={t} onClick={()=>{setTab(t.toLowerCase());setShowPicker(false);setShowAttach(false);}}
            style={{flex:1,padding:'10px 0',background:'none',border:'none',borderBottom:'2px solid '+(a?c.accent:'transparent'),color:a?c.accent:c.muted,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>{t}</button>;
        })}
      </div>

      {/* ═══ TEXT TAB ═══ */}
      {tab==='text'?(<>
        <div onClick={()=>{setShowAttach(false);setShowPicker(false);}} style={{flex:1,overflowY:'auto',padding:'14px 12px 8px',display:'flex',flexDirection:'column',gap:6}}>
          {loading?(<div style={{textAlign:'center',color:c.muted,fontSize:13,marginTop:40}}>Loading...</div>)
           :initError?(<div style={{textAlign:'center',color:'#ef4444',fontSize:13,marginTop:40}}>{initError}</div>)
           :messages.length===0?(
            <div style={{textAlign:'center',marginTop:60,padding:'0 20px'}}>
              <Avatar src={agent?.avatar_url} name={agentName} size={48} radius={14} c={c}/>
              <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:4,marginTop:12}}>Chat with {agentName.split(' ')[0]}</div>
              <div style={{fontSize:13,color:c.sub,lineHeight:1.5}}>Send a message to get started.</div>
            </div>)
           :messages.map(msg=>(
            <div key={msg.id} style={{display:'flex',justifyContent:msg.isUser?'flex-end':'flex-start',padding:'2px 0'}}>
              {!msg.isUser&&<Avatar src={agent?.avatar_url} name={agentName} size={26} radius={7} c={c}/>}
              <div style={{maxWidth:'78%',marginLeft:msg.isUser?0:6}}>
                <div style={{padding:'10px 14px',borderRadius:msg.isUser?'18px 18px 4px 18px':'18px 18px 18px 4px',background:msg.isUser?c.userBubble:c.agentBubble,border:msg.isUser?'none':'1px solid '+c.agentBorder,color:msg.isUser?'#fff':c.tx,fontSize:14,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                  {msg.text}
                  <div style={{fontSize:10,color:msg.isUser?'rgba(255,255,255,0.6)':c.muted,marginTop:4,textAlign:msg.isUser?'right':'left'}}>{msg.time}</div>
                </div>
              </div>
            </div>))}
          {sending&&<div style={{display:'flex',alignItems:'flex-start',gap:6,padding:'2px 0'}}><Avatar src={agent?.avatar_url} name={agentName} size={26} radius={7} c={c}/><TypingDots c={c}/></div>}
          <div ref={chatEndRef}/>
        </div>

        {/* INPUT BAR */}
        <div style={{borderTop:'1px solid '+c.border,background:c.sf,flexShrink:0,position:'relative'}}>
          {showAttach&&(
            <div style={{position:'absolute',bottom:'100%',left:8,background:c.sf,border:'1px solid '+c.border,borderRadius:12,boxShadow:'0 -4px 20px rgba(0,0,0,0.2)',overflow:'hidden',marginBottom:4,minWidth:180}}>
              {[{icon:<ImageIcon color={c.tx}/>,label:'Photo & Video',accept:'image/*,video/*'},{icon:<CameraIcon color={c.tx}/>,label:'Take Photo',capture:true},{icon:<FileIcon color={c.tx}/>,label:'Document',accept:'*/*'}].map((item,i)=>(
                <button key={i} onClick={()=>{item.capture?cameraRef.current?.click():(()=>{if(fileRef.current){fileRef.current.accept=item.accept;fileRef.current.click();}})();setShowAttach(false);}}
                  style={{width:'100%',padding:'12px 14px',display:'flex',alignItems:'center',gap:10,background:'transparent',border:'none',borderBottom:i<2?'1px solid '+c.border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                  {item.icon}<span style={{fontSize:14,fontWeight:500,color:c.tx}}>{item.label}</span>
                </button>))}
            </div>
          )}
          <input ref={fileRef} type="file" multiple style={{display:'none'}} onChange={handleFile}/>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={handleFile}/>
          <div style={{padding:'6px 8px',paddingBottom:'max(6px,env(safe-area-inset-bottom))'}}>
            <div style={{display:'flex',alignItems:'flex-end',border:'1px solid '+c.inputBorder,borderRadius:24,background:c.input,padding:'4px 4px 4px 6px'}}>
              <button onClick={()=>{setShowAttach(!showAttach);setShowPicker(false);}} style={{width:30,height:30,borderRadius:15,border:'none',background:showAttach?c.accent+'20':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
                <PlusIcon color={showAttach?c.accent:c.muted}/>
              </button>
              <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                placeholder={'Message '+agentName.split(' ')[0]+'...'} rows={1}
                style={{flex:1,padding:'5px 6px',border:'none',background:'transparent',color:c.tx,fontSize:15,fontFamily:'inherit',resize:'none',maxHeight:100,lineHeight:1.4,outline:'none'}}/>
              <button onClick={sendMessage} disabled={!input.trim()||sending}
                style={{width:30,height:30,borderRadius:15,border:'none',background:(!input.trim()||sending)?'transparent':c.gradient,display:'flex',alignItems:'center',justifyContent:'center',cursor:(!input.trim()||sending)?'default':'pointer',flexShrink:0}}>
                <SendIcon/>
              </button>
            </div>
          </div>
        </div>

      {/* ═══ CONFERENCE TAB ═══ */}
      </>):tab==='conference'?(<>
        {/* Participants bar */}
        <div style={{padding:'8px 12px',borderBottom:'1px solid '+c.border,background:c.sf,display:'flex',alignItems:'center',gap:6,flexShrink:0,overflowX:'auto'}}>
          <span style={{fontSize:11,color:c.muted,fontWeight:600,flexShrink:0}}>Team:</span>
          {allAgents.map(a=>(
            <div key={a.id} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px 3px 3px',borderRadius:16,background:c.card,border:'1px solid '+c.border,flexShrink:0}}>
              <Avatar src={a.avatar_url} name={a.name} size={20} radius={6} c={c}/>
              <span style={{fontSize:11,fontWeight:600,color:c.tx,whiteSpace:'nowrap'}}>{a.name.split(' ')[0]}</span>
            </div>
          ))}
          <div style={{padding:'4px 10px',borderRadius:16,background:c.accent+'15',border:'1px solid '+c.accent+'30',flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:600,color:c.accent}}>You</span>
          </div>
        </div>

        {/* Group thread */}
        <div onClick={()=>setShowAttach(false)} style={{flex:1,overflowY:'auto',padding:'12px 12px 8px',display:'flex',flexDirection:'column',gap:8}}>
          {groupMsgs.length===0?(
            <div style={{textAlign:'center',marginTop:40,padding:'0 24px'}}>
              <div style={{display:'flex',justifyContent:'center',gap:4,marginBottom:12}}>
                {allAgents.slice(0,4).map(a=><Avatar key={a.id} src={a.avatar_url} name={a.name} size={32} radius={8} c={c}/>)}
              </div>
              <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:4}}>Team Chat</div>
              <div style={{fontSize:13,color:c.sub,lineHeight:1.6}}>
                {allAgents.length>0
                  ?`Message all ${allAgents.length} Bloomie${allAgents.length>1?'s':''} at once. They'll see each other's replies.`
                  :'No agents loaded yet.'}
              </div>
            </div>
          ):groupMsgs.map(msg=>(
            <div key={msg.id}>
              {msg.from==='user'?(
                <div style={{display:'flex',justifyContent:'flex-end',padding:'2px 0'}}>
                  <div style={{maxWidth:'80%',padding:'10px 14px',borderRadius:'18px 18px 4px 18px',background:c.userBubble,color:'#fff',fontSize:14,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                    {msg.text}
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.6)',marginTop:4,textAlign:'right'}}>{msg.time}</div>
                  </div>
                </div>
              ):(
                <div style={{display:'flex',gap:8,alignItems:'flex-start',padding:'2px 0'}}>
                  <Avatar src={msg.avatar} name={msg.fromAgent} size={28} radius={8} c={c}/>
                  <div style={{maxWidth:'75%'}}>
                    <div style={{fontSize:11,fontWeight:700,color:c.accent,marginBottom:2}}>{msg.fromAgent}</div>
                    <div style={{padding:'10px 14px',borderRadius:'4px 18px 18px 18px',background:c.agentBubble,border:'1px solid '+c.agentBorder,color:c.tx,fontSize:14,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                      {msg.text}
                      <div style={{fontSize:10,color:c.muted,marginTop:4}}>{msg.time}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {groupSending&&(
            <div style={{display:'flex',gap:8,alignItems:'flex-start',padding:'2px 0'}}>
              <div style={{width:28,height:28,borderRadius:8,background:c.card,border:'1px solid '+c.border,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,flexShrink:0}}>...</div>
              <div><div style={{fontSize:11,fontWeight:600,color:c.muted,marginBottom:2}}>Team is typing</div><TypingDots c={c}/></div>
            </div>
          )}
          <div ref={groupEndRef}/>
        </div>

        {/* Group input */}
        <div style={{padding:'6px 8px',paddingBottom:'max(6px,env(safe-area-inset-bottom))',borderTop:'1px solid '+c.border,background:c.sf,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-end',border:'1px solid '+c.inputBorder,borderRadius:24,background:c.input,padding:'4px 4px 4px 12px'}}>
            <textarea value={groupInput} onChange={e=>setGroupInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendGroupMessage();}}}
              placeholder="Message the team..." rows={1}
              style={{flex:1,padding:'5px 6px',border:'none',background:'transparent',color:c.tx,fontSize:15,fontFamily:'inherit',resize:'none',maxHeight:100,lineHeight:1.4,outline:'none'}}/>
            <button onClick={sendGroupMessage} disabled={!groupInput.trim()||groupSending}
              style={{width:30,height:30,borderRadius:15,border:'none',background:(!groupInput.trim()||groupSending)?'transparent':c.gradient,display:'flex',alignItems:'center',justifyContent:'center',cursor:(!groupInput.trim()||groupSending)?'default':'pointer',flexShrink:0}}>
              <SendIcon/>
            </button>
          </div>
        </div>

      {/* ═══ CALL TAB ═══ */}
      </>):(
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:40,textAlign:'center'}}>
          <div style={{width:64,height:64,borderRadius:16,background:c.card,border:'1px solid '+c.border,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,marginBottom:16}}>{'\uD83D\uDCDE'}</div>
          <div style={{fontSize:16,fontWeight:700,color:c.tx,marginBottom:6}}>Voice Calls</div>
          <div style={{fontSize:13,color:c.sub,lineHeight:1.5,maxWidth:260}}>Call your Bloomie directly. Coming soon.</div>
          <div style={{marginTop:20,padding:'8px 20px',borderRadius:20,background:c.card,border:'1px solid '+c.border,fontSize:12,fontWeight:600,color:c.accent}}>Coming Soon</div>
        </div>
      )}
    </div>
  );
}
