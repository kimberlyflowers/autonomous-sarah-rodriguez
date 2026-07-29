import { useState, useEffect, useRef, useCallback, useMemo, Component, forwardRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { LiveAvatarSession as LiveAvatarWebSession, SessionEvent, SessionState } from "@heygen/liveavatar-web-sdk";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "./supabase.js";
import QRCode from 'qrcode';
import PageEditor from "./PageEditor.jsx";
import BloomieAdmin from "./components/BloomieAdmin.jsx";
import ReferenceLibrary from "./components/ReferenceLibrary.jsx";
import GoogleDrivePicker from "./components/GoogleDrivePicker.jsx";
import HTMLFlipBook from "react-pageflip";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;

// Get auth headers for API calls
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { "Content-Type": "application/json" };
  return { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` };
}

const BLOOM_READ_STATE_KEY='bloomie-conversation-read-v1';
let bloomNotificationAudioContext=null;
function readConversationState(){
  try{return JSON.parse(localStorage.getItem(BLOOM_READ_STATE_KEY)||'{}')||{};}catch{return{};}
}
function conversationReadKey(kind,id){return `${kind}:${id}`;}
function seedConversationReads(kind,items=[],initialUnreadCount=0){
  const state=readConversationState();
  const seededKey=`${kind}:__initial_read_state_seeded`;
  if(state[seededKey])return;
  const newestUnread=new Set(
    [...items]
      .sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0))
      .slice(0,initialUnreadCount)
      .map(item=>item.id)
  );
  let changed=false;
  for(const item of items){
    const key=conversationReadKey(kind,item.id);
    if(state[key]==null){
      state[key]=newestUnread.has(item.id)?0:new Date(item.updated_at||item.created_at||Date.now()).getTime();
      changed=true;
    }
  }
  state[seededKey]=Date.now();
  localStorage.setItem(BLOOM_READ_STATE_KEY,JSON.stringify(state));
}
function markConversationRead(kind,id,when=Date.now()){
  if(!id)return;
  const state=readConversationState();
  state[conversationReadKey(kind,id)]=Math.max(Number(state[conversationReadKey(kind,id)]||0),new Date(when||Date.now()).getTime());
  localStorage.setItem(BLOOM_READ_STATE_KEY,JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('bloomie-read-state-changed',{detail:{kind,id}}));
}
function isConversationUnread(kind,item){
  if(!item?.id)return false;
  const updated=new Date(item.updated_at||item.created_at||0).getTime();
  return updated>Number(readConversationState()[conversationReadKey(kind,item.id)]||0);
}
function unlockBloomNotificationSound(){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    bloomNotificationAudioContext=bloomNotificationAudioContext||new AudioCtx();
    if(bloomNotificationAudioContext.state==='suspended')void bloomNotificationAudioContext.resume();
  }catch{}
}
function playBloomResponseSound(){
  try{
    unlockBloomNotificationSound();
    const ctx=bloomNotificationAudioContext;
    if(!ctx||ctx.state!=='running')return false;
    const start=ctx.currentTime;
    [[659.25,0],[783.99,.09]].forEach(([frequency,offset])=>{
      const oscillator=ctx.createOscillator();
      const gain=ctx.createGain();
      oscillator.type='sine';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0.0001,start+offset);
      gain.gain.exponentialRampToValueAtTime(0.12,start+offset+.015);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+offset+.16);
      oscillator.connect(gain);gain.connect(ctx.destination);
      oscillator.start(start+offset);oscillator.stop(start+offset+.17);
    });
    if(document.hidden&&navigator.vibrate)navigator.vibrate(35);
    return true;
  }catch{return false;}
}

function subscribeAuthenticatedEvents(url,onMessage,onError=()=>{}){
  const controller=new AbortController();
  (async()=>{
    try{
      const headers=await getAuthHeaders();
      const response=await _originalFetch(url,{headers,signal:controller.signal,cache:'no-store'});
      if(!response.ok||!response.body)throw new Error(`Event stream failed (${response.status})`);
      const reader=response.body.getReader();
      const decoder=new TextDecoder();
      let buffer='';
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const frames=buffer.split('\n\n');
        buffer=frames.pop()||'';
        for(const frame of frames){
          const line=frame.split('\n').find(item=>item.startsWith('data:'));
          if(!line)continue;
          try{onMessage(JSON.parse(line.slice(5).trim()));}catch{}
        }
      }
    }catch(error){
      if(error.name!=='AbortError')onError(error);
    }
  })();
  return()=>controller.abort();
}

// Intercept all fetch calls — attach auth header automatically
const _originalFetch = window.fetch;
window.fetch = async (url, opts = {}) => {
  // Only inject for same-origin /api/ routes
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const authHeaders = await getAuthHeaders();
    opts = { ...opts, headers: { ...authHeaders, ...(opts.headers || {}) } };
  }
  return _originalFetch(url, opts);
};

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
    : { bg:"#FFFFFF",sf:"#F5F5F5",cd:"#FFFFFF",ac:"#F4A261",a2:"#E76F8B",
        gr:"#34A853",gf:"#F0FAF0",tx:"#111827",so:"#6B7280",fa:"#D1D5DB",
        ln:"#E5E7EB",bl:"#3B6FD4",pu:"#7C3AED",inp:"#FFFFFF",hv:"#F5F5F5",
        gradient:"linear-gradient(135deg,#F4A261,#E76F8B)",err:"#ea4335",warn:"#FBBC04" };
}

const DEFAULT_SARAH_AGENT_ID = "c3000000-0000-0000-0000-000000000003";

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

function isPlayableVideoUrl(href="") {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(String(href))
    || /\/api\/public\/video\//i.test(String(href));
}

function isPlayableAudioUrl(href="") {
  return /\.(mp3|wav|m4a|aac|ogg)(?:$|[?#])/i.test(String(href));
}

function isDeliverableFileUrl(href="") {
  return /\.(pdf|docx?|xlsx?|pptx?|csv|zip|html?)(?:$|[?#])/i.test(String(href))
    || /\/api\/files\/(preview|publish|download)\//i.test(String(href));
}

function MarkdownInlineImage({src,alt}) {
  return <img src={src} alt={alt||"Generated deliverable"} loading="lazy" style={{display:"block",width:"100%",maxWidth:720,maxHeight:560,objectFit:"contain",borderRadius:12,margin:"10px 0",background:"rgba(0,0,0,.08)"}}/>;
}

function requestedMediaKind(text="") {
  const value=String(text);
  // Mentioning an image or video in a question is not a generation request.
  // Only show processing UI when the turn contains a concrete creation/edit
  // action; the agent can still discuss or inspect media without a false card.
  const hasCreationIntent=/\b(generate|create|make|render|produce|design|draw|illustrate|edit|remake|regenerate|animate|lip[ -]?sync(?:ing)?|turn\b.{0,40}\binto)\b/i.test(value);
  if(!hasCreationIntent) return null;
  if(/\b(video|lip[ -]?sync|animate|talking[ -]?head)\b/i.test(value)) return "video";
  if(/\b(image|photo|picture|portrait|headshot|graphic|illustration)\b/i.test(value)) return "image";
  return null;
}

function MediaProcessingCard({kind="image",c}) {
  const isVideo=kind==="video";
  return(
    <div data-testid="media-processing-card" style={{width:"min(100%, 420px)",maxWidth:420,margin:"8px auto 12px",borderRadius:14,overflow:"hidden",border:"1px solid "+c.ln,background:c.sf,boxSizing:"border-box"}}>
      <div data-testid="media-processing-preview" style={{width:"100%",aspectRatio:"16 / 9",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",background:`linear-gradient(110deg,${c.sf} 20%,${c.cd} 42%,${c.sf} 64%)`,backgroundSize:"220% 100%",animation:"processingSweep 1.7s ease-in-out infinite"}}>
        <div style={{width:54,height:54,borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,rgba(244,162,97,.24),rgba(231,111,139,.24))",border:"1px solid rgba(244,162,97,.35)",fontSize:24}}>{isVideo?"▶":"✦"}</div>
      </div>
      <div style={{padding:"11px 13px",display:"flex",alignItems:"center",gap:9}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:c.ac,animation:"pulse 1.2s ease infinite"}}/>
        <div><div style={{fontSize:13,fontWeight:700,color:c.tx}}>{isVideo?"Rendering video":"Generating image"}</div><div style={{fontSize:11,color:c.so,marginTop:1}}>This preview will become the finished deliverable automatically.</div></div>
      </div>
    </div>
  );
}

function MarkdownMediaLink({href,children,color}) {
  if(isPlayableVideoUrl(href)) {
    return(
      <div style={{margin:"10px 0",width:"100%",maxWidth:720}}>
        <video
          src={href}
          controls
          playsInline
          preload="metadata"
          style={{display:"block",width:"100%",maxHeight:480,borderRadius:12,background:"#000"}}
        >
          <a href={href} target="_blank" rel="noopener noreferrer">Open video</a>
        </video>
        <a href={href} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:6,color,textDecoration:"underline",fontSize:12}}>Open video in a new tab</a>
      </div>
    );
  }
  if(isPlayableAudioUrl(href)) {
    return(
      <div style={{margin:"10px 0",width:"100%",maxWidth:720}}>
        <audio src={href} controls preload="metadata" style={{display:"block",width:"100%"}}>
          <a href={href} target="_blank" rel="noopener noreferrer">Open audio</a>
        </audio>
        <a href={href} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:6,color,textDecoration:"underline",fontSize:12}}>Open audio in a new tab</a>
      </div>
    );
  }
  if(isDeliverableFileUrl(href)) {
    return(
      <a href={href} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,width:"100%",maxWidth:720,margin:"10px 0",padding:"12px 14px",border:"1px solid rgba(127,127,127,.28)",borderRadius:12,color,textDecoration:"none",background:"rgba(127,127,127,.08)"}}>
        <span aria-hidden="true" style={{fontSize:20}}>📄</span>
        <span style={{minWidth:0,fontWeight:700,overflowWrap:"anywhere"}}>{children||"Open deliverable"}</span>
        <span aria-hidden="true" style={{marginLeft:"auto"}}>↗</span>
      </a>
    );
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" style={{color,textDecoration:"underline"}}>{children}</a>;
}

function createChatMarkdownComponents(c,setChatLightbox) {
  return {
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
    code:({inline,children})=>{
      if(inline) return <code style={{background:c.bg,border:"1px solid "+c.ln,padding:"1px 6px",borderRadius:4,fontSize:"12.5px",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}}>{children}</code>;
      return <pre style={{background:c.bg,border:"1px solid "+c.ln,borderRadius:8,padding:"12px 16px",margin:"10px 0",overflowX:"auto",fontSize:"12.5px",lineHeight:1.5,fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}}><code>{children}</code></pre>;
    },
    hr:()=><hr style={{border:"none",borderTop:"1px solid "+c.ln,margin:"16px 0"}}/>,
    a:({href,children})=><MarkdownMediaLink href={href} color={c.ac}>{children}</MarkdownMediaLink>,
    table:({children})=><div style={{overflowX:"auto",margin:"10px 0"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}>{children}</table></div>,
    th:({children})=><th style={{border:"1px solid "+c.ln,padding:"6px 10px",fontWeight:600,textAlign:"left",background:c.sf}}>{children}</th>,
    td:({children})=><td style={{border:"1px solid "+c.ln,padding:"6px 10px"}}>{children}</td>,
    blockquote:({children})=><div style={{borderLeft:"3px solid "+c.ac,paddingLeft:12,margin:"10px 0",color:c.so}}>{children}</div>,
  };
}

/* ═══════════════════════════════════════════════════════════════
   BLOOM + FACE — exact copy from Jaden
   ═══════════════════════════════════════════════════════════════ */
function Face({sz,agent,onClick,style:extraStyle}) {
  const s=sz||30;
  const ag=agent||{nm:"Agent",img:null,grad:"linear-gradient(135deg,#F4A261,#E76F8B)"};
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
    markConversationRead('chat',sessionId);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch("/api/chat/sessions/"+sessionId,{headers});
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
  const queuedMessagesRef = useRef([]);

  const stopSarah = () => {
    if(abortRef.current) { abortRef.current.abort(); abortRef.current=null; }
    setLoading(false);
    setWorkingStatus("");
  };

  const send = async (text, projectId = null, activeArtifactContext = null, queuedMeta = null) => {
    if(!text.trim()) return false;
    unlockBloomNotificationSound();
    // Never start overlapping requests for the same chat. Aborting the browser
    // fetch does not stop server-side tools, so overlapping turns can duplicate
    // paid work and overwrite the durable execution checkpoint. Follow-up text
    // is displayed immediately, then executed in order after the active turn.
    if(abortRef.current && !queuedMeta) {
      const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      const userMsgId = Date.now();
      const queueAckId = userMsgId + 1;
      queuedMessagesRef.current.push({text,projectId,activeArtifactContext,userMsgId,queueAckId});
      setMessages(p=>[
        ...p,
        {id:userMsgId,b:false,t:text,tm:ts,queued:true},
        {id:queueAckId,b:true,t:"Queued — I’ll finish the active step, then apply this next.",tm:ts,isAck:true,isQueuedAck:true}
      ]);
      return true;
    }
    if(!sid.current) { const id="session-"+Date.now(); sid.current=id; setCurrentSessionId(id); }
    const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    const userMsgId = queuedMeta?.userMsgId || Date.now();
    if(queuedMeta?.queueAckId) {
      setMessages(p=>p.filter(m=>m.id!==queuedMeta.queueAckId));
    } else {
      setMessages(p=>[...p,{id:userMsgId,b:false,t:text,tm:ts}]);
    }
    setLoading(true);

    // Detect if this is a WORK task or just casual chat
    // Direct work keywords
    const hasWorkVerbs = /\b(write|create|build|make|draft|design|generate|research|inspect|investigate|audit|diagnose|verify|validate|test|check|find|locate|search|send|share|show|display|schedule|update|look up|go to|navigate|analyze|summarize|review|edit|fix|compile|prepare|pull|set up|book|cancel|redo|retry|try again|do it|do that|go ahead|start|finish|continue|proceed|run|execute|launch|publish|deploy|commit)\b/i.test(text);
    const hasWorkNouns = /\b(blog|email|post|website|landing page|report|document|contact|lead|campaign|sequence|flyer|graphic|visual|image|photo|picture|portrait|headshot|avatar|proposal|invoice|spreadsheet|calendar|appointment|site|page|sop|newsletter|funnel|book|chapter|repository|repo|codebase|source tree|branch|file|framework|deployment|build|logs?|database|api|integration|connector|webhook)\b/i.test(text);
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
    const fn=(currentAgent?.name||"Agent").split(" ")[0];
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
        body:JSON.stringify({message:text,sessionId:sid.current,agentId:currentAgentId,projectId,audio:false,activeArtifact:activeArtifactContext}),
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
      if(data.audio) {
        try {
          const audio = new Audio(data.audio);
          audio.play().catch(()=>{});
        } catch {}
      } else playBloomResponseSound();
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
    } finally {
      setLoading(false);
      setWorkingStatus("");
      const next = queuedMessagesRef.current.shift();
      if(next) {
        setTimeout(()=>send(next.text,next.projectId,next.activeArtifactContext,next),0);
      }
    }
  };

  const sendFiles = async (files, text='', projectId = null) => {
    unlockBloomNotificationSound();
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
      const resp = await fetch("/api/chat/upload",{method:"POST",headers:uploadHeaders,body:JSON.stringify({message:text,sessionId:sid.current,agentId:currentAgentId,projectId,files:encoded})});
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
      playBloomResponseSound();
      fetchSessions();
      return true;
    } catch {
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:"Couldn't process that file. Please try again.",tm:ts2}]);
      return false;
    } finally { setLoading(false); }
  };

  // sendFilesEncoded — same as sendFiles but skips FileReader (base64 already encoded, e.g. screenshots)
  const sendFilesEncoded = async (encoded, text='', projectId = null) => {
    unlockBloomNotificationSound();
    const ts = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    setLoading(true);
    try {
      const msgId2 = Date.now();
      setMessages(p=>[...p,{id:msgId2,b:false,t:text||'',tm:ts,files:encoded}]);
      if(!sid.current){ const id="session-"+Date.now(); sid.current=id; setCurrentSessionId(id); }
      const uploadHeaders = await getAuthHeaders();
      const resp = await fetch("/api/chat/upload",{method:"POST",headers:uploadHeaders,body:JSON.stringify({message:text,sessionId:sid.current,agentId:currentAgentId,projectId,files:encoded})});
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
      playBloomResponseSound();
      fetchSessions();
      return true;
    } catch {
      const ts2 = new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      setMessages(p=>[...p,{id:Date.now(),b:true,t:"Couldn't process that file. Please try again.",tm:ts2}]);
      return false;
    } finally { setLoading(false); }
  };

  return {messages,setMessages,send,sendFiles,sendFilesEncoded,loading,workingStatus,sessions,setSessions,currentSessionId,newSession,loadSession,deleteSession,fetchSessions,stopSarah,sid,agents,currentAgentId,currentAgent,switchAgent};
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
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/health",{headers:_hh}); if(r.ok) setData(await r.json()); }catch{} };
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
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/trust-gate",{headers:_hh}); if(r.ok) setData(await r.json()); }catch{} };
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
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/agentic-executions?limit=5",{headers:_hh}); if(r.ok){ const d=await r.json(); setExecs(d.executions||d||[]); } }catch{} };
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
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/sub-agents",{headers:_hh}); if(r.ok){ const d=await r.json(); setAgents(d.agents||d||[]); } }catch{} };
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
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/tool-performance",{headers:_hh}); if(r.ok) setData(await r.json()); }catch{} };
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
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/context-analytics",{headers:_hh}); if(r.ok) setData(await r.json()); }catch{} };
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
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/action-log?limit=20",{headers:_hh}); if(r.ok){ const d=await r.json(); setActions(d.actions||d||[]); } }catch{} };
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
function InternalTasks({c,sse,aFN="Agent"}) {
  const [tasks,setTasks] = useState([]);
  useEffect(()=>{
    const go=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/internal-tasks",{headers:_hh}); if(r.ok){ const d=await r.json(); setTasks(d.tasks||d||[]); } }catch{} };
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
        const r=await fetch(`/api/agent/tasks/runs${qs}`);
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
    const fetchH=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch(`/api/dashboard/handoff-log?limit=10${qs}`,{headers:_hh}); if(r.ok){ const d=await r.json(); setHandoffs(d.handoffs||d||[]); } }catch{} };
    const fetchR=async()=>{ try{ const _hh=await getAuthHeaders();const r=await fetch(`/api/dashboard/rejection-log?limit=10${qs}`,{headers:_hh}); if(r.ok){ const d=await r.json(); setRejections(d.rejections||d||[]); } }catch{} };
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
function Screen({c,mob,mode,setMode,aFN="Agent"}) {
  const [screenshot,setScreenshot] = useState(null);
  const [browserUrl,setBrowserUrl] = useState(null);
  const [live,setLive] = useState(false);

  useEffect(()=>{
    if(mode==="hidden") return;
    let es;
    let retryCount = 0;
    let retryTimer = null;
    let stateTimer = null;
    const MAX_RETRIES = 5;
    const refreshCurrentState = async () => {
      try {
        const response = await fetch("/api/browser/screenshot", { cache: "no-store" });
        const state = await response.json();
        if (state.live && state.screenshot) {
          setScreenshot("data:image/jpeg;base64," + state.screenshot);
          if (state.url) setBrowserUrl(state.url);
          setLive(true);
        } else if (!state.live) {
          setLive(false);
        }
      } catch {}
    };
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
    refreshCurrentState();
    // SSE connections can remain pinned to a retired Railway instance during
    // a rolling deploy. Polling the current endpoint keeps the viewer accurate
    // without requiring the user to refresh or reopen the panel.
    stateTimer = setInterval(refreshCurrentState, 2000);
    return () => {
      if(retryTimer) clearTimeout(retryTimer);
      if(stateTimer) clearInterval(stateTimer);
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

function LiveAvatarPanel({c, agentId, agentName="Agent", agentImg=null, lastSarahText=""}) {
  const [cfg,setCfg]=useState(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [embedUrl,setEmbedUrl]=useState("");
  const [avatars,setAvatars]=useState([]);
  const [voices,setVoices]=useState([]);
  const [avatarId,setAvatarId]=useState("");
  const [voiceId,setVoiceId]=useState("");
  const [contextId,setContextId]=useState("");
  const [language,setLanguage]=useState("en");
  const [mode,setMode]=useState("liveavatar_sdk");
  const [session,setSession]=useState(null);
  const [starting,setStarting]=useState(false);
  const [sdkStatus,setSdkStatus]=useState("idle");
  const [streamReady,setStreamReady]=useState(false);
  const [avatarMicStatus,setAvatarMicStatus]=useState("idle");
  const [speechStatus,setSpeechStatus]=useState("");
  const sdkSessionRef=useRef(null);
  const videoRef=useRef(null);
  const autoStartedRef=useRef(false);
  const [err,setErr]=useState("");
  const lastAvatarSpeechRef=useRef("");
  const pendingAvatarSpeechRef=useRef("");
  const firstName=(agentName||"Agent").split(" ")[0];
  const latestSpeechText=(lastSarahText||"").trim();
  const speechText=()=>latestSpeechText || `Hi, I'm ${firstName}. I'm ready to help.`;
  const agentNameLower=String(agentName||"").toLowerCase();
  const liveAvatarAgentId=(!agentId || agentId==="bloomie-sarah-rodriguez" || agentNameLower==="sarah" || agentNameLower.startsWith("sarah ") || agentNameLower.includes("sarah rodriguez"))
    ? DEFAULT_SARAH_AGENT_ID
    : agentId;
  const isLiveAvatarCommandReady=()=>sdkSessionRef.current?.state===SessionState.CONNECTED;

  const load=()=>{
    if(!liveAvatarAgentId) return;
    setLoading(true); setErr("");
    fetch(`/api/avatar/live/config?agentId=${encodeURIComponent(liveAvatarAgentId)}`)
      .then(r=>r.json().then(d=>({ok:r.ok,d})))
      .then(({ok,d})=>{
        if(!ok) throw new Error(d.error||"Could not load live avatar");
        setCfg(d);
        if(d.embedUrl) setEmbedUrl(d.embedUrl);
        if(d.avatarId) setAvatarId(d.avatarId);
        if(d.voiceId) setVoiceId(d.voiceId);
        if(d.contextId) setContextId(d.contextId);
        if(d.language) setLanguage(d.language);
        if(d.mode) setMode(d.mode);
      })
      .catch(e=>setErr(e.message||"Could not load live avatar"))
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{load();},[liveAvatarAgentId]);

  const loadHeyGenAssets=async()=>{
    try{
      setErr("");
      const [ar,vr]=await Promise.all([
        fetch("/api/avatar/heygen/avatars"),
        fetch("/api/avatar/heygen/voices")
      ]);
      const [ad,vd]=await Promise.all([ar.json().catch(()=>({})),vr.json().catch(()=>({}))]);
      if(!ar.ok) throw new Error(ad.error||"Could not load HeyGen avatars");
      if(!vr.ok) throw new Error(vd.error||"Could not load HeyGen voices");
      setAvatars(ad.avatars||[]);
      setVoices(vd.voices||[]);
      if(!avatarId && ad.avatars?.[0]) {
        setAvatarId(ad.avatars[0].id);
        if(ad.avatars[0].defaultVoiceId) setVoiceId(ad.avatars[0].defaultVoiceId);
      }
      if(!voiceId && vd.voices?.[0]) setVoiceId(vd.voices[0].id);
    }catch(e){ setErr(e.message||"Could not load HeyGen assets"); }
  };

  useEffect(()=>{
    if(cfg?.heygenApiConfigured) loadHeyGenAssets();
  },[cfg?.heygenApiConfigured,liveAvatarAgentId]);

  const save=async()=>{
    const body={agentId:liveAvatarAgentId,provider:mode==="liveavatar_sdk"?"liveavatar":"heygen",mode};
    if(mode==="embed") {
      const url=embedUrl.trim();
      if(!url.startsWith("https://")) { setErr("Use a secure HeyGen embed URL"); return; }
      body.embedUrl=url;
    } else if(mode==="liveavatar_sdk") {
      if(!avatarId || !contextId) { setErr("Enter the LiveAvatar avatar ID and context ID"); return; }
      body.avatarId=avatarId;
      body.contextId=contextId;
      body.voiceId=voiceId || null;
      body.language=language||"en";
      body.avatarName=agentName;
    } else {
      if(!avatarId || !voiceId) { setErr("Choose a HeyGen avatar and voice"); return; }
      const chosen=avatars.find(a=>a.id===avatarId);
      body.avatarId=avatarId;
      body.voiceId=voiceId;
      body.avatarName=chosen?.name || agentName;
    }
    setSaving(true); setErr("");
    try{
      const h=await getAuthHeaders();
      const r=await fetch("/api/avatar/live/config",{method:"POST",headers:h,body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Could not save live avatar");
      load();
    }catch(e){ setErr(e.message||"Could not save live avatar"); }
    finally{ setSaving(false); }
  };

  const startLive=async(textOverride=null)=>{
    setStarting(true); setErr(""); setSession(null);
    try{
      const h=await getAuthHeaders();
      const text=String(textOverride||speechText()).trim();
      const r=await fetch("/api/avatar/live/session",{method:"POST",headers:h,body:JSON.stringify({agentId:liveAvatarAgentId,text})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Could not start live avatar");
      if(d.errorMessage) throw new Error(d.errorMessage);
      setSession(d);
    }catch(e){ setErr(e.message||"Could not start live avatar"); }
    finally{ setStarting(false); }
  };

  const sendTextToAvatar=(text, reason="chat")=>{
    const clean=String(text||"").trim();
    if(!clean) return false;
    const live=sdkSessionRef.current;
    if(!live || live.state!==SessionState.CONNECTED) {
      pendingAvatarSpeechRef.current=clean;
      setSpeechStatus(`${firstName} Live is connecting...`);
      return false;
    }
    try {
      live.repeat(clean);
      setSpeechStatus(reason==="manual"?"Speaking now":`Speaking ${firstName}'s latest reply`);
      setTimeout(()=>setSpeechStatus(""),3500);
      return true;
    } catch(e) {
      pendingAvatarSpeechRef.current=clean;
      setErr(e.message||"Could not send text to LiveAvatar");
      return false;
    }
  };

  const flushPendingAvatarSpeech=(delay=0)=>{
    setTimeout(()=>{
      const text=pendingAvatarSpeechRef.current;
      if(!text) return;
      if(sendTextToAvatar(text)) pendingAvatarSpeechRef.current="";
    },delay);
  };

  const startSdkLive=async()=>{
    setStarting(true); setErr(""); setSdkStatus("starting"); setStreamReady(false);
    try{
      if(sdkSessionRef.current) {
        try { await sdkSessionRef.current.stop(); } catch {}
        sdkSessionRef.current=null;
      }
      const h=await getAuthHeaders();
      const r=await fetch("/api/avatar/live/session-token",{method:"POST",headers:h,body:JSON.stringify({agentId:liveAvatarAgentId})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Could not start LiveAvatar");
      if(!d.sessionToken) throw new Error("LiveAvatar did not return a session token");
      const liveSession=new LiveAvatarWebSession(d.sessionToken,{voiceChat:false});
      sdkSessionRef.current=liveSession;
      liveSession.on(SessionEvent.SESSION_STATE_CHANGED,state=>{
        setSdkStatus(state);
        if(state===SessionState.CONNECTED) {
          setSpeechStatus(`Use the main mic below to talk through ${firstName} Live`);
          flushPendingAvatarSpeech(250);
          flushPendingAvatarSpeech(1000);
        }
      });
      liveSession.on(SessionEvent.SESSION_STREAM_READY,()=>{
        setStreamReady(true);
        if(videoRef.current) liveSession.attach(videoRef.current);
        flushPendingAvatarSpeech(250);
        flushPendingAvatarSpeech(1200);
      });
      await liveSession.start();
      setSdkStatus(liveSession.state||SessionState.CONNECTED);
      flushPendingAvatarSpeech(750);
      flushPendingAvatarSpeech(2200);
    }catch(e){ setErr(e.message||"Could not start LiveAvatar"); setSdkStatus("error"); }
    finally{ setStarting(false); }
  };

  const stopSdkLive=async()=>{
    try { await sdkSessionRef.current?.stop(); } catch {}
    sdkSessionRef.current=null;
    setSdkStatus("idle");
    setStreamReady(false);
    setAvatarMicStatus("idle");
    setSpeechStatus("");
  };

  const ensureSdkLive=()=>{
    if(cfg?.enabled && cfg.mode==="liveavatar_sdk" && cfg.avatarId && cfg.contextId && !starting && sdkStatus!=="starting" && sdkStatus!==SessionState.CONNECTED) {
      autoStartedRef.current=true;
      startSdkLive();
      return true;
    }
    return sdkStatus===SessionState.CONNECTED;
  };

  const speakSdkText=()=>{
    const text=speechText();
    if(!text) return;
    if(!sendTextToAvatar(text,"manual")) setErr(`Start ${firstName} Live first, then try speaking again.`);
  };

  const startAvatarListening=()=>{
    if(!isLiveAvatarCommandReady()) {
      setSpeechStatus(`${firstName} Live is still connecting. Try again in a moment.`);
      return false;
    }
    try {
      sdkSessionRef.current?.startListening();
      setAvatarMicStatus("listening");
      setSpeechStatus(`${firstName} is listening through LiveAvatar`);
      return true;
    } catch(e) {
      setErr(e.message||"Could not start LiveAvatar listening");
      return false;
    }
  };

  const stopAvatarListening=()=>{
    if(!isLiveAvatarCommandReady()) {
      setAvatarMicStatus("idle");
      setSpeechStatus("");
      return false;
    }
    try {
      sdkSessionRef.current?.stopListening();
      setAvatarMicStatus("idle");
      setSpeechStatus("");
      return true;
    } catch(e) {
      setErr(e.message||"Could not stop LiveAvatar listening");
      return false;
    }
  };

  useEffect(()=>{
    if(!latestSpeechText || !cfg?.enabled) return;
    if(lastAvatarSpeechRef.current===latestSpeechText) return;
    const sdkConnected=isLiveAvatarCommandReady();

    if(cfg.mode==="liveavatar_sdk" && sdkConnected) {
      lastAvatarSpeechRef.current=latestSpeechText;
      sendTextToAvatar(latestSpeechText);
      return;
    }

    if(cfg.mode==="liveavatar_sdk" && cfg.avatarId && cfg.contextId && !starting && sdkStatus!=="starting") {
      lastAvatarSpeechRef.current=latestSpeechText;
      pendingAvatarSpeechRef.current=latestSpeechText;
      startSdkLive();
      return;
    }

    if(cfg.mode==="heygen_realtime" && cfg.avatarId && cfg.voiceId && !starting) {
      lastAvatarSpeechRef.current=latestSpeechText;
      startLive(latestSpeechText);
    }
  },[latestSpeechText,cfg?.enabled,cfg?.mode,cfg?.avatarId,cfg?.voiceId,sdkStatus,starting]);

  useEffect(()=>()=>{ try { sdkSessionRef.current?.stop(); } catch {} },[]);

  useEffect(()=>{
    const connected=isLiveAvatarCommandReady();
    window.__bloomieLiveAvatar = {
      connected,
      videoReady: streamReady,
      status: sdkStatus,
      ensureStarted: ensureSdkLive,
      startListening: startAvatarListening,
      stopListening: stopAvatarListening,
      speakLatest: speakSdkText
    };
    return()=>{ if(window.__bloomieLiveAvatar?.startListening===startAvatarListening) delete window.__bloomieLiveAvatar; };
  },[sdkStatus,streamReady,latestSpeechText]);

  const selectStyle={width:"100%",padding:"10px 12px",borderRadius:9,border:"1px solid "+c.ln,background:c.inp,color:c.tx,fontSize:12,fontFamily:"inherit",boxSizing:"border-box",marginBottom:10};

  if(loading && !cfg) {
    return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:"#0b0b0c",color:c.so,fontSize:13}}>Loading live avatar...</div>;
  }

  if(cfg?.enabled && cfg.mode==="embed" && cfg.embedUrl) {
    return(
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",background:"#050505"}}>
        <div style={{height:36,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px",background:c.cd,borderBottom:"1px solid "+c.ln,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:c.gr,animation:"pulse 1.4s ease infinite",flexShrink:0}}/>
            <span style={{fontSize:11,fontWeight:700,color:c.gr}}>LIVE</span>
            <span style={{fontSize:11,color:c.so,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{firstName}</span>
          </div>
          <button onClick={load} title="Refresh live avatar" style={{width:24,height:24,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",color:c.so,fontSize:12}}>↻</button>
        </div>
        <iframe
          src={cfg.embedUrl}
          title={`${firstName} live avatar`}
          allow="microphone; camera; autoplay; encrypted-media; fullscreen; clipboard-read; clipboard-write"
          style={{flex:1,width:"100%",height:"100%",border:"none",background:"#050505"}}
        />
      </div>
    );
  }

  if(cfg?.enabled && cfg.mode==="liveavatar_sdk" && cfg.avatarId && cfg.contextId) {
    const connected=sdkStatus===SessionState.CONNECTED;
    return(
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",background:"#050505"}}>
        <div style={{height:36,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px",background:c.cd,borderBottom:"1px solid "+c.ln,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:connected?c.gr:c.ac,animation:"pulse 1.4s ease infinite",flexShrink:0}}/>
            <span style={{fontSize:11,fontWeight:700,color:connected?c.gr:c.ac}}>LIVEAVATAR</span>
            <span style={{fontSize:11,color:c.so,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cfg.avatarName||firstName}</span>
          </div>
          <button onClick={load} title="Refresh live avatar" style={{width:24,height:24,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",color:c.so,fontSize:12}}>↻</button>
        </div>
        <div style={{flex:1,minHeight:0,position:"relative",background:"#050505",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
          <video ref={videoRef} autoPlay playsInline style={{width:"100%",height:"100%",minHeight:480,objectFit:"cover",background:"#050505"}}/>
          {!streamReady&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:c.so,fontSize:12,pointerEvents:"none"}}>{starting?"Starting live avatar...":"LiveAvatar ready"}</div>}
        </div>
        <div style={{padding:10,borderTop:"1px solid "+c.ln,background:c.cd,display:"flex",gap:8,flexDirection:"column"}}>
          {err&&<div style={{fontSize:11,color:c.err,lineHeight:1.4}}>{err}</div>}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={connected?stopSdkLive:startSdkLive} disabled={starting} style={{padding:"9px 12px",borderRadius:8,border:"none",background:connected?"#EF4444":c.gradient,color:"#fff",fontSize:12,fontWeight:800,cursor:starting?"wait":"pointer",flexShrink:0}}>{connected?"End":"Start"}</button>
            <div style={{flex:1,minWidth:0,padding:"8px 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,color:c.so,fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {speechStatus || (connected ? `Use the main mic below to talk through ${firstName} Live` : `Start the live avatar, then ${firstName} can speak here`)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if(cfg?.enabled && cfg.mode==="heygen_realtime" && cfg.avatarId) {
    return(
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",background:"#050505"}}>
        <div style={{height:36,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px",background:c.cd,borderBottom:"1px solid "+c.ln,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:session?.hlsUrl?c.gr:c.ac,animation:"pulse 1.4s ease infinite",flexShrink:0}}/>
            <span style={{fontSize:11,fontWeight:700,color:session?.hlsUrl?c.gr:c.ac}}>HEYGEN</span>
            <span style={{fontSize:11,color:c.so,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cfg.avatarName||firstName}</span>
          </div>
          <button onClick={load} title="Refresh live avatar" style={{width:24,height:24,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",color:c.so,fontSize:12}}>↻</button>
        </div>
        <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#050505",padding:0,overflow:"hidden"}}>
          {session?.hlsUrl
            ? <video src={session.hlsUrl} autoPlay playsInline controls style={{width:"100%",height:"100%",minHeight:480,objectFit:"cover",background:"#050505"}}/>
            : <div style={{position:"relative",width:"100%",height:"100%",minHeight:480,display:"flex",alignItems:"center",justifyContent:"center",background:"#050505"}}>
                {agentImg
                  ? <img src={agentImg} alt="" style={{width:"100%",height:"100%",minHeight:480,objectFit:"cover",objectPosition:"center",filter:starting?"brightness(0.75)":"none"}}/>
                  : <div style={{width:"100%",height:"100%",minHeight:480,background:c.gradient,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:96,fontWeight:800}}>{firstName[0]||"A"}</div>}
                <div style={{position:"absolute",left:0,right:0,bottom:0,padding:"18px 20px",background:"linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.74))",color:"#fff"}}>
                  <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>{firstName} Live</div>
                  <div style={{fontSize:12,opacity:.82,lineHeight:1.4}}>
                    {starting ? "Preparing Sarah's speaking video..." : latestSpeechText ? "Sarah is ready to speak her latest reply." : "Send Sarah a message and she will talk here."}
                  </div>
                  {err&&<div style={{fontSize:11,color:"#ff9b9b",marginTop:8,lineHeight:1.4}}>{err}</div>}
                  {latestSpeechText&&!starting&&<button onClick={()=>startLive(latestSpeechText)} style={{marginTop:10,padding:"8px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.24)",background:"rgba(255,255,255,.14)",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:800}}>Replay Sarah</button>}
                </div>
              </div>}
        </div>
      </div>
    );
  }

  return(
    <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(180deg,#111,#070707)",padding:22}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
          {agentImg
            ? <img src={agentImg} alt="" style={{width:82,height:82,borderRadius:18,objectFit:"cover",border:"1px solid "+c.ln}}/>
            : <div style={{width:82,height:82,borderRadius:18,background:c.gradient,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:28,fontWeight:800}}>{firstName[0]||"A"}</div>}
        </div>
        <div style={{textAlign:"center",fontSize:17,fontWeight:800,color:c.tx,marginBottom:6}}>{firstName} Live</div>
        <div style={{textAlign:"center",fontSize:12,color:c.so,lineHeight:1.5,marginBottom:18}}>Choose how this employee should appear live.</div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {[
            ["liveavatar_sdk","LiveAvatar"],
            ["heygen_realtime","HeyGen API"],
            ["embed","Embed URL"]
          ].map(([k,l])=><button key={k} onClick={()=>setMode(k)} style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid "+(mode===k?c.ac:c.ln),background:mode===k?c.ac+"20":"transparent",color:mode===k?c.ac:c.so,fontSize:11,fontWeight:800,cursor:"pointer"}}>{l}</button>)}
        </div>
        {mode==="embed" ? (
          <input
            value={embedUrl}
            onChange={e=>setEmbedUrl(e.target.value)}
            placeholder="https://embed.liveavatar.com/..."
            style={selectStyle}
          />
        ) : mode==="liveavatar_sdk" ? (
          <>
            <input value={avatarId} onChange={e=>setAvatarId(e.target.value)} placeholder="LiveAvatar avatar_id" style={selectStyle}/>
            <input value={contextId} onChange={e=>setContextId(e.target.value)} placeholder="LiveAvatar context_id" style={selectStyle}/>
            <input value={voiceId} onChange={e=>setVoiceId(e.target.value)} placeholder="Voice ID (optional)" style={selectStyle}/>
            <input value={language} onChange={e=>setLanguage(e.target.value)} placeholder="Language, e.g. en" style={selectStyle}/>
            {!cfg?.liveAvatarApiConfigured&&<div style={{fontSize:12,color:c.so,lineHeight:1.45,background:c.cd,border:"1px solid "+c.ln,borderRadius:9,padding:12,marginBottom:10}}>LiveAvatar API key is not configured on the server yet.</div>}
          </>
        ) : cfg?.heygenApiConfigured ? (
          <>
            <select value={avatarId} onChange={e=>{setAvatarId(e.target.value); const a=avatars.find(x=>x.id===e.target.value); if(a?.defaultVoiceId) setVoiceId(a.defaultVoiceId);}} style={selectStyle}>
              <option value="">Choose avatar...</option>
              {avatars.map(a=><option key={a.id} value={a.id}>{a.name||a.id}</option>)}
            </select>
            <select value={voiceId} onChange={e=>setVoiceId(e.target.value)} style={selectStyle}>
              <option value="">Choose voice...</option>
              {voices.map(v=><option key={v.id} value={v.id}>{v.name||v.id}{v.language?` · ${v.language}`:""}</option>)}
            </select>
          </>
        ) : (
          <div style={{fontSize:12,color:c.so,lineHeight:1.45,background:c.cd,border:"1px solid "+c.ln,borderRadius:9,padding:12,marginBottom:10}}>HeyGen API key is not configured on the server yet.</div>
        )}
        {err&&<div style={{fontSize:11,color:c.err,marginBottom:10,lineHeight:1.4}}>{err}</div>}
        <button onClick={save} disabled={saving||(mode==="embed"?!embedUrl.trim():mode==="liveavatar_sdk"?(!avatarId||!contextId):(!avatarId||!voiceId))} style={{width:"100%",padding:"10px 12px",borderRadius:9,border:"none",background:(mode==="embed"?embedUrl.trim():mode==="liveavatar_sdk"?(avatarId&&contextId):(avatarId&&voiceId))?c.gradient:c.ln,cursor:!saving&&(mode==="embed"?embedUrl.trim():mode==="liveavatar_sdk"?(avatarId&&contextId):(avatarId&&voiceId))?"pointer":"not-allowed",color:"#fff",fontSize:12,fontWeight:800}}>
          {saving?"Saving...":"Save Live Avatar"}
        </button>
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

/* ═══════════════════════════════════════════════════════════════
   THINKING PANEL — Real-time reasoning, tool calls, and results
   Toggle on/off via the + button in the chat input area
   ═══════════════════════════════════════════════════════════════ */
function mergeExecutionCalls(existing=[],events=[]){
  const byId=new Map((existing||[]).map(call=>[call.callId,{...call,events:[...(call.events||[])]}]));
  for(const event of events||[]){
    if(!event?.callId)continue;
    const call=byId.get(event.callId)||{
      callId:event.callId,toolName:event.toolName||'tool',status:'running',
      startedAt:event.startedAt||event.timestamp||Date.now(),finishedAt:null,
      elapsedMs:null,input:event.input||{},output:'',events:[]
    };
    if(!call.events.some(item=>item.id&&item.id===event.id))call.events.push(event);
    if(event.type==='tool.start'){call.toolName=event.toolName||call.toolName;call.input=event.input||{};call.status='running';call.startedAt=event.startedAt||event.timestamp||call.startedAt;}
    if(event.type==='tool.output'){
      const chunk=typeof event.output==='string'?event.output:JSON.stringify(event.output||'');
      call.output=(call.output+(call.output?'\n':'')+chunk).slice(-24000);
    }
    if(event.type==='tool.finish'){
      call.status=event.status||'passed';call.finishedAt=event.finishedAt||event.timestamp||Date.now();
      call.elapsedMs=event.elapsedMs??Math.max(0,call.finishedAt-call.startedAt);
      if(event.output){
        call.output=typeof event.output==='string'?event.output:JSON.stringify(event.output,null,2);
      }
    }
    byId.set(event.callId,call);
  }
  return Array.from(byId.values()).sort((a,b)=>(a.startedAt||0)-(b.startedAt||0));
}

function ExecutionCommandCard({c,call}){
  const [open,setOpen]=useState(call.status==='running'||call.status==='failed');
  const [,tick]=useState(0);
  useEffect(()=>{
    if(call.status!=='running')return;
    const timer=setInterval(()=>tick(value=>value+1),1000);
    return()=>clearInterval(timer);
  },[call.status]);
  useEffect(()=>{if(call.status==='failed')setOpen(true);},[call.status]);
  const elapsed=call.elapsedMs??Math.max(0,Date.now()-(call.startedAt||Date.now()));
  const elapsedLabel=elapsed<1000?`${elapsed}ms`:elapsed<60000?`${(elapsed/1000).toFixed(1)}s`:`${Math.floor(elapsed/60000)}m ${Math.round((elapsed%60000)/1000)}s`;
  const passed=call.status==='passed';
  const failed=call.status==='failed';
  const statusColor=passed?(c.gr||'#22c55e'):failed?'#ef4444':(c.ac||'#F4A261');
  const label=String(call.toolName||'tool').replace(/_/g,' ');
  const command=Array.isArray(call.input?.command)
    ?call.input.command.join(' ')
    :call.input?.command&&Array.isArray(call.input?.args)
      ?[call.input.command,...call.input.args].join(' ')
      :label;
  return <div data-testid="execution-command-card" style={{border:'1px solid '+c.ln,borderRadius:11,background:c.cd,overflow:'hidden',margin:'7px 0',maxWidth:'100%'}}>
    <button onClick={()=>setOpen(value=>!value)} style={{width:'100%',padding:'9px 11px',border:'none',background:'transparent',color:c.tx,cursor:'pointer',display:'flex',alignItems:'center',gap:8,textAlign:'left'}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:statusColor,boxShadow:call.status==='running'?`0 0 0 4px ${statusColor}22`:'none',flexShrink:0}}/>
      <code style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11,color:c.tx}}>{command}</code>
      <span style={{fontSize:10,fontWeight:700,color:statusColor,textTransform:'uppercase'}}>{call.status==='running'?'Running':passed?'Passed':'Failed'}</span>
      <span style={{fontSize:10,color:c.so,minWidth:38,textAlign:'right'}}>{elapsedLabel}</span>
      <span style={{fontSize:10,color:c.so,transform:open?'rotate(90deg)':'none'}}>▶</span>
    </button>
    {open&&<div style={{borderTop:'1px solid '+c.ln,padding:'9px 11px'}}>
      {Object.keys(call.input||{}).length>0&&<details style={{marginBottom:8}}>
        <summary style={{fontSize:10,color:c.so,cursor:'pointer'}}>Sanitized input</summary>
        <pre style={{margin:'6px 0 0',padding:8,borderRadius:7,background:c.bg,color:c.tx,fontSize:10,lineHeight:1.45,whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:160,overflow:'auto'}}>{JSON.stringify(call.input,null,2)}</pre>
      </details>}
      <div style={{fontSize:10,fontWeight:700,color:c.so,marginBottom:5}}>COMMAND OUTPUT</div>
      <pre aria-live="polite" style={{margin:0,padding:8,borderRadius:7,background:'#0d1117',color:'#d1d5db',fontSize:10,lineHeight:1.45,whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:260,overflow:'auto'}}>{call.output||(call.status==='running'?'Waiting for output…':'No output returned.')}</pre>
    </div>}
  </div>;
}

function ExecutionCommandCards({c,sessionId,source='chat'}){
  const [calls,setCalls]=useState([]);
  useEffect(()=>{
    if(!sessionId){setCalls([]);return;}
    let active=true;
    setCalls([]);
    getAuthHeaders().then(headers=>fetch(source==='work'?`/api/builds/${sessionId}`:`/api/chat/sessions/${sessionId}`,{headers}))
      .then(response=>response.json()).then(data=>{if(active)setCalls(data.executionEvents||[]);}).catch(()=>{});
    const unsubscribe=subscribeAuthenticatedEvents(`/api/chat/progress-stream?sessionId=${encodeURIComponent(sessionId)}`,data=>{
      if(active&&Array.isArray(data.executionEvents)&&data.executionEvents.length){
        setCalls(current=>mergeExecutionCalls(current,data.executionEvents));
      }
    });
    return()=>{active=false;unsubscribe();};
  },[sessionId,source]);
  if(!calls.length)return null;
  return <div data-testid="execution-command-history" style={{width:'100%',minWidth:0}}>
    {calls.map(call=><ExecutionCommandCard key={call.callId} c={c} call={call}/>)}
  </div>;
}

function ThinkingPanel({c, sessionId, isOpen, onClose, agentName='Agent'}) {
  const agentFirstName=(agentName||'Agent').split(' ')[0];
  const [events,setEvents]=useState([]);
  const [collapsed,setCollapsed]=useState(false);
  const scrollRef=useRef(null);
  const lastEventTime=useRef(0);
  useEffect(()=>{
    if(!sessionId){return;}
    const unsubscribe=subscribeAuthenticatedEvents(`/api/chat/progress-stream?sessionId=${encodeURIComponent(sessionId)}`,d=>{
      if(d.connected) return;
      if(d.thinkingEvents && Array.isArray(d.thinkingEvents)){
          setEvents(prev=>[...prev,...d.thinkingEvents]);
          setCollapsed(false);
          lastEventTime.current=Date.now();
      }
    });
    return unsubscribe;
  },[sessionId]);
  // Auto-collapse when no new events for 4 seconds (the active agent finished thinking)
  useEffect(()=>{
    if(events.length===0) return;
    const timer=setInterval(()=>{
      if(lastEventTime.current>0 && Date.now()-lastEventTime.current>4000){
        setCollapsed(true);
      }
    },2000);
    return()=>clearInterval(timer);
  },[events.length]);
  useEffect(()=>{
    if(scrollRef.current && !collapsed) scrollRef.current.scrollTop=scrollRef.current.scrollHeight;
  },[events,collapsed]);
  if(!isOpen) return null;
  // Filter: only show thinking and tool_call, skip task_progress noise
  const filtered = events.filter(ev => ev.type === 'thinking' || ev.type === 'tool_call' || ev.type === 'tool_result');
  const merged = [];
  for (const ev of filtered) {
    if (ev.type === 'thinking' && ev.text) merged.push(ev);
    else if (ev.type === 'tool_call') merged.push(ev);
    else if (ev.type === 'tool_result' && ev.result) merged.push(ev);
  }
  if(merged.length===0) return null;
  // Collapsed state — just a subtle line showing the active agent finished
  if(collapsed) {
    return(
      <div onClick={()=>setCollapsed(false)} style={{
        margin:'4px 0',padding:'6px 12px',cursor:'pointer',
        display:'flex',alignItems:'center',gap:6,
        opacity:0.5,fontSize:11,color:c.so||'#a0a0a0',fontStyle:'italic'
      }}>
        <span style={{color:c.ac||'#F4A261'}}>{String.fromCodePoint(0x1F4AD)}</span>
        {agentFirstName}'s thought process ({merged.length} steps) — tap to expand
      </div>
    );
  }
  return(
    <div style={{
      margin:'6px 0',
      maxHeight:150,
      backgroundColor:'transparent',
      display:'flex',flexDirection:'column',
      overflow:'hidden'
    }}>
      {/* Compact header */}
      <div style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'2px 8px',
        flexShrink:0
      }}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:6,height:6,borderRadius:'50%',
            backgroundColor:c.ac||'#F4A261',
            animation:'pulse 1.5s infinite'
          }}/>
          <span style={{fontSize:11,fontWeight:500,color:c.so||'#a0a0a0',fontStyle:'italic'}}>
            {agentFirstName} is thinking...
          </span>
        </div>
        <button onClick={()=>setCollapsed(true)} style={{
          background:'none',border:'none',color:c.so||'#a0a0a0',
          cursor:'pointer',fontSize:14,padding:'0 4px',lineHeight:1
        }}>×</button>
      </div>
      {/* Conversational thought stream */}
      <div ref={scrollRef} style={{
        flex:1,overflowY:'auto',padding:'2px 12px',
        fontSize:12,lineHeight:1.4
      }}>
        {merged.map((ev,i)=>{
          if(ev.type==='thinking' && ev.text) {
            return (
              <div key={i} style={{
                color:c.so||'#a0a0a0',
                padding:'2px 0',
                fontStyle:'italic',
                fontSize:12,
                lineHeight:1.4,
                borderLeft:'2px solid '+(c.ln||'#353535'),
                paddingLeft:10,
                marginBottom:3
              }}>
                {ev.text.length>250?ev.text.slice(0,250)+'...':ev.text}
              </div>
            );
          }
          if(ev.type==='tool_call') {
            const name = (ev.name||'unknown').replace(/_/g,' ');
            return (
              <div key={i} style={{color:c.ac||'#F4A261',padding:'1px 0',fontSize:11,opacity:0.6}}>
                {String.fromCodePoint(0x1F527)} {name}
              </div>
            );
          }
          if(ev.type==='tool_result') {
            return (
              <div key={i} style={{color:ev.success===false?(c.err||'#ea4335'):(c.gr||'#34A853'),padding:'1px 0',fontSize:11,opacity:0.6}}>
                {ev.success===false?String.fromCodePoint(0x274C):String.fromCodePoint(0x2705)} {(ev.result||'done').slice(0,80)}
              </div>
            );
          }
          return null;
        })}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

/* User-facing execution commentary. This is intentionally separate from the
   private Thinking Stream: it contains concise milestones, evidence, pending
   states, and next actions that are safe and useful to show by default. */
function LiveProgressNarration({c, sessionId}) {
  const [updates,setUpdates]=useState([]);
  useEffect(()=>{
    if(!sessionId){setUpdates([]);return;}
    setUpdates([]);
    const unsubscribe=subscribeAuthenticatedEvents(`/api/chat/progress-stream?sessionId=${encodeURIComponent(sessionId)}`,d=>{
      if(Array.isArray(d.progressUpdates)&&d.progressUpdates.length){
          setUpdates(prev=>{
            const byId=new Map([...prev,...d.progressUpdates].map(item=>[item.id,item]));
            return Array.from(byId.values()).slice(-4);
          });
      }
    });
    return unsubscribe;
  },[sessionId]);
  if(updates.length===0) return <span>Processing the next verified step…</span>;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {updates.map((item,index)=>(
        <div key={item.id||index} style={{
          display:"flex",alignItems:"flex-start",gap:6,
          color:index===updates.length-1?c.tx:c.so,
          fontWeight:index===updates.length-1?600:400
        }}>
          <span style={{
            width:6,height:6,borderRadius:"50%",marginTop:5,flexShrink:0,
            background:item.kind==="success"?c.gr:item.kind==="error"?"#ea4335":c.ac
          }}/>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
function ActiveTaskTracker({c, sessionId}) {
  const [todos,setTodos]=useState([]);
  const [isActive,setIsActive]=useState(false);

  useEffect(()=>{
    if(!sessionId){setTodos([]);setIsActive(false);return;}

    // Clear immediately on session change
    setTodos([]);setIsActive(false);

    // Subscribe to real-time task_progress SSE stream
    const unsubscribe=subscribeAuthenticatedEvents(`/api/chat/progress-stream?sessionId=${encodeURIComponent(sessionId)}`,d=>{
      if(d.connected) return;
      if(Array.isArray(d.todos)){
        setTodos(d.todos);
        setIsActive(d.todos.some(t=>t.status==='in_progress'));
      }
    });
    let statusTimer = null;
    const refreshProgress = async () => {
      try {
        const response = await fetch(`/api/chat/progress-status?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const data = await response.json();
        if(Array.isArray(data.todos)){
          setTodos(data.todos);
          setIsActive(data.todos.some(t=>t.status==='in_progress'));
        }
      } catch {}
    };

    refreshProgress();
    statusTimer=setInterval(refreshProgress,2000);

    return()=>{unsubscribe();if(statusTimer)clearInterval(statusTimer);};
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

function parseUberEatsResults(text) {
  if (!text) return null;
  const match = String(text).match(/<!--\s*uber_eats_results:([A-Za-z0-9_-]+)\s*-->/i);
  if (!match) return null;
  try {
    const normalized = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed?.candidates) || parsed.candidates.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function UberEatsResultsCard({results,c}) {
  if (!results?.candidates?.length) return null;
  const openOption = url => {
    if (!/^https:\/\/([a-z0-9-]+\.)*ubereats\.com\//i.test(url || '')) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  return <div style={{marginTop:12,width:'100%',maxWidth:520,borderRadius:16,border:'1px solid '+c.ln,background:c.sf,overflow:'hidden'}}>
    <div style={{padding:'13px 14px 11px',borderBottom:'1px solid '+c.ln}}>
      <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:750,fontSize:14,color:c.tx}}>
        <span aria-hidden="true">🍽️</span> Uber Eats options
      </div>
      <div style={{marginTop:4,fontSize:11,lineHeight:1.45,color:c.so}}>
        {results.addressSummary ? `${results.addressSummary} · ` : ''}Live availability, menu, fees, and ETA will be verified in Uber Eats.
      </div>
    </div>
    <div style={{display:'grid',gap:0}}>
      {results.candidates.map((option,index)=><button
        key={`${option.url}-${index}`}
        type="button"
        onClick={()=>openOption(option.url)}
        style={{width:'100%',minWidth:0,padding:'12px 14px',display:'flex',alignItems:'center',gap:11,textAlign:'left',border:0,borderBottom:index<results.candidates.length-1?'1px solid '+c.ln:'none',background:'transparent',color:c.tx,cursor:'pointer'}}
      >
        <span style={{width:26,height:26,flex:'0 0 26px',borderRadius:9,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:11,fontWeight:800}}>{index+1}</span>
        <span style={{minWidth:0,flex:1}}>
          <span style={{display:'block',fontSize:13,fontWeight:720,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{option.name}</span>
          {option.summary&&<span style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',marginTop:2,fontSize:11,lineHeight:1.4,color:c.so}}>{option.summary}</span>}
        </span>
        <span aria-hidden="true" style={{flexShrink:0,color:c.ac,fontWeight:800}}>›</span>
      </button>)}
    </div>
    <button type="button" onClick={()=>openOption(results.browserHandoffUrl)} style={{width:'100%',padding:'11px 14px',border:0,borderTop:'1px solid '+c.ln,background:'rgba(244,162,97,.08)',color:c.ac,fontSize:12,fontWeight:750,cursor:'pointer'}}>
      See all results in Uber Eats →
    </button>
  </div>;
}

// Strip hidden file tags and legacy trigger phrases from message text before rendering
function cleanMessageText(text) {
  if (!text) return text;
  let cleaned = text;
  // Remove hidden file tags: <!-- file:filename.ext -->
  cleaned = cleaned.replace(/<!--\s*file:\s*[^>]+?-->\n?/g, '');
  // Restaurant options render as an interactive card instead of encoded text.
  cleaned = cleaned.replace(/<!--\s*uber_eats_results:[A-Za-z0-9_-]+\s*-->\n?/gi, '');
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

function SessionFilesPanel({c, sessionId, setActiveArtifact, aFN="Agent"}){
  const [lightbox,setLightbox]=useState(null);
  const [files,setFiles]=useState([]);
  const [uploads,setUploads]=useState([]);
  const [loading,setLoading]=useState(true);

  const fetchAll = ()=>{
    if(!sessionId) return;
    Promise.all([
      fetch(`/api/files/artifacts?sessionId=${sessionId}&limit=20`).then(r=>r.json()).catch(()=>({})),
      fetch(`/api/chat/uploads/list?sessionId=${sessionId}`).then(r=>r.json()).catch(()=>({}))
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
                const pr=await fetch(`/api/files/preview/${f.fileId}`);
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
                    src={`/api/files/thumbnail/${f.fileId}`}
                    alt={f.name}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
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

function artifactExt(name='') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

function isOfficeArtifact(name='') {
  return ['docx', 'pptx', 'xlsx'].includes(artifactExt(name));
}

function isPdfArtifact(name='') {
  return artifactExt(name) === 'pdf';
}

function isBinaryArtifactName(name='') {
  return ['docx', 'pptx', 'xlsx', 'pdf', 'zip', 'csv'].includes(artifactExt(name));
}

function artifactEmbedUrl(fileId) {
  if (!fileId) return '';
  return `${window.location.origin}/api/files/embed/${fileId}`;
}

function officeViewerUrl(fileId) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(artifactEmbedUrl(fileId))}`;
}

function responsiveArtifactDocument(content='', mobile=false) {
  if (!mobile || !content) return content;
  const mobileHead = `<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style id="bloom-mobile-artifact-fit">
  html,body{width:100%!important;max-width:100%!important;min-width:0!important;overflow-x:hidden!important;box-sizing:border-box!important}
  *,*::before,*::after{box-sizing:border-box}
  img,video,canvas,svg,iframe{max-width:100%!important}
  pre,code,table{max-width:100%!important;overflow-wrap:anywhere;word-break:break-word}
</style>`;
  if (/<head[\s>]/i.test(content)) {
    return content.replace(/<head([^>]*)>/i, `<head$1>${mobileHead}`);
  }
  return `<!doctype html><html><head>${mobileHead}</head><body>${content}</body></html>`;
}

function googleImportLabel(name='') {
  const ext = artifactExt(name);
  if (ext === 'docx') return 'Open in Google Docs';
  if (ext === 'xlsx' || ext === 'csv') return 'Open in Google Sheets';
  if (ext === 'pptx') return 'Open in Google Slides';
  if (ext === 'pdf') return 'Open in Google Drive';
  return null;
}

function isSpreadsheetArtifact(name='') {
  return ['xlsx', 'csv'].includes(artifactExt(name));
}

function GoogleImportButton({ file, c, compact=false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reconnectUrl, setReconnectUrl] = useState('');
  const fileId = file?.fileId || file?.id;
  const label = googleImportLabel(file?.name);
  if (!fileId || !label) return null;

  const importFile = async () => {
    setBusy(true);
    setError('');
    setReconnectUrl('');
    try {
      const response = await fetch(`/api/files/google-import/${fileId}`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && data.reconnectUrl) {
        setReconnectUrl(data.reconnectUrl);
        throw new Error(data.error || 'Google Drive needs to be reconnected.');
      }
      if (!response.ok || !data.webViewLink) throw new Error(data.error || 'Google import failed');
      window.open(data.webViewLink, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'Google import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{display:'inline-flex',flexDirection:'column',gap:4,alignItems:compact?'stretch':'center'}}>
      <button onClick={importFile} disabled={busy} style={{padding:compact?'6px 10px':'10px 18px',borderRadius:compact?8:10,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:compact?11:13,fontWeight:700,cursor:busy?'default':'pointer',fontFamily:'inherit',opacity:busy?0.65:1}}>
        {busy ? 'Opening...' : label}
      </button>
      {error && <span style={{maxWidth:compact?180:360,fontSize:10,lineHeight:1.35,color:'#ea4335',textAlign:compact?'left':'center'}}>{error}</span>}
      {reconnectUrl && <a href={reconnectUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10,fontWeight:800,color:c.ac,textDecoration:'underline',textAlign:compact?'left':'center'}}>Reconnect Google Drive</a>}
    </span>
  );
}

function SpreadsheetGridPreview({ file, c, compact=false }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const fileId = file?.fileId || file?.id;
  const name = file?.name || 'spreadsheet';
  const ext = artifactExt(name).toUpperCase();

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    const rows = compact ? 8 : 24;
    const cols = compact ? 6 : 12;
    fetch(`/api/files/sheet-preview/${fileId}?rows=${rows}&cols=${cols}`)
      .then(response => response.ok ? response.json() : response.json().then(data => Promise.reject(new Error(data.error || 'Preview failed'))))
      .then(data => { if (!cancelled) setPreview(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Preview failed'); });
    return () => { cancelled = true; };
  }, [fileId, compact]);

  const sheet = preview?.sheets?.[0];
  const rows = sheet?.rows || [];

  if (error) {
    return (
      <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:compact?10:24,textAlign:'center',background:c.bg,color:c.so}}>
        <div>
          <div style={{fontSize:compact?11:14,fontWeight:800,color:c.tx,marginBottom:4}}>{ext || 'SHEET'}</div>
          <div style={{fontSize:compact?9:12,lineHeight:1.35}}>Spreadsheet preview unavailable. Open in Google Sheets or download the file.</div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:c.bg,color:c.so,fontSize:compact?10:13,fontWeight:700}}>
        Loading spreadsheet...
      </div>
    );
  }

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',background:'#fff',color:'#1f2937',overflow:'hidden'}}>
      {!compact && (
        <div style={{padding:'8px 10px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,background:'#f9fafb'}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12,fontWeight:800,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
            <div style={{fontSize:10,color:'#6b7280'}}>{sheet?.name || 'Sheet1'}</div>
          </div>
          <GoogleImportButton file={file} c={c} compact />
        </div>
      )}
      <div style={{flex:1,overflow:'hidden'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:compact?8:12,tableLayout:'fixed'}}>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} style={{border:'1px solid #e5e7eb',padding:compact?'3px 4px':'7px 8px',fontWeight:rowIndex===0?800:500,background:rowIndex===0?'#f3f4f6':'#fff',color:'#1f2937',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {cell || '\u00a0'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{padding:compact?10:24,fontSize:compact?10:13,color:'#6b7280',textAlign:'center'}}>No rows to preview</div>}
      </div>
    </div>
  );
}

function BinaryArtifactPreview({ file, c, compact=false }) {
  const name = file?.name || 'file';
  const fileId = file?.fileId;
  const ext = artifactExt(name).toUpperCase() || 'FILE';
  const embedUrl = artifactEmbedUrl(fileId);
  const canSheetPreview = fileId && isSpreadsheetArtifact(name);
  const canOfficePreview = fileId && isOfficeArtifact(name) && window.location.protocol.startsWith('http');
  const canPdfPreview = fileId && isPdfArtifact(name);

  if (canSheetPreview) {
    return <SpreadsheetGridPreview file={file} c={c} compact={compact} />;
  }

  if (canPdfPreview) {
    return (
      <div style={{height:'100%',display:'flex',flexDirection:'column',background:c.bg}}>
        <div style={{padding:'8px 10px',borderBottom:'1px solid '+c.ln,background:c.cd,display:'flex',gap:8,justifyContent:'flex-end',alignItems:'center'}}>
          <GoogleImportButton file={file} c={c} compact />
        </div>
        <iframe src={embedUrl} title={name} style={{flex:1,width:'100%',border:'none',background:'#fff'}}/>
      </div>
    );
  }

  if (canOfficePreview) {
    return (
      <div style={{height:'100%',display:'flex',flexDirection:'column',background:c.bg}}>
        <div style={{padding:'8px 10px',borderBottom:'1px solid '+c.ln,background:c.cd,display:'flex',gap:8,justifyContent:'flex-end',alignItems:'center'}}>
          <GoogleImportButton file={file} c={c} compact />
        </div>
        <iframe src={officeViewerUrl(fileId)} title={name} style={{flex:1,width:'100%',border:'none',background:'#fff'}}/>
      </div>
    );
  }

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,padding:compact?20:32,textAlign:'center',color:c.so}}>
      <div style={{width:64,height:64,borderRadius:16,background:c.ac+'18',border:'1px solid '+c.ac+'44',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:c.ac}}>{ext}</div>
      <div style={{fontSize:16,fontWeight:700,color:c.tx,maxWidth:'90%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
      <div style={{fontSize:13,lineHeight:1.5,maxWidth:420}}>Preview is available for PDF, PowerPoint, Word, and Excel when the file has a public embed URL. You can still open or download this file.</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginTop:4}}>
        <GoogleImportButton file={file} c={c} />
        {fileId && <a href={`/api/files/embed/${fileId}`} target="_blank" rel="noopener noreferrer" style={{padding:'10px 18px',borderRadius:10,border:'1px solid '+c.ln,background:c.cd,color:c.tx,textDecoration:'none',fontSize:13,fontWeight:700}}>Open</a>}
        {fileId && <a href={`/api/files/download/${fileId}`} download={name} style={{padding:'10px 20px',borderRadius:10,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',textDecoration:'none',fontSize:13,fontWeight:800}}>Download {ext}</a>}
      </div>
    </div>
  );
}

function BinaryArtifactCardPreview({ file, c }) {
  const name = file?.name || '';
  const fileId = file?.fileId || file?.id;
  const ext = artifactExt(name);
  const frameScale = 0.26;

  if (fileId && isSpreadsheetArtifact(name)) {
    return <SpreadsheetGridPreview file={file} c={c} compact />;
  }

  if (fileId && isPdfArtifact(name)) {
    return (
      <div style={{position:'absolute',inset:0,overflow:'hidden',background:'#fff'}}>
        <iframe
          src={artifactEmbedUrl(fileId)}
          title={name}
          scrolling="no"
          style={{position:'absolute',top:0,left:0,width:`${100/frameScale}%`,height:`${100/frameScale}%`,border:'none',pointerEvents:'none',transform:`scale(${frameScale})`,transformOrigin:'top left',background:'#fff'}}
        />
      </div>
    );
  }

  if (fileId && isOfficeArtifact(name) && window.location.protocol.startsWith('http')) {
    return (
      <div style={{position:'absolute',inset:0,overflow:'hidden',background:'#fff'}}>
        <iframe
          src={officeViewerUrl(fileId)}
          title={name}
          scrolling="no"
          style={{position:'absolute',top:0,left:0,width:`${100/frameScale}%`,height:`${100/frameScale}%`,border:'none',pointerEvents:'none',transform:`scale(${frameScale})`,transformOrigin:'top left',background:'#fff'}}
        />
      </div>
    );
  }

  if (ext === 'csv') {
    return (
      <div style={{position:'absolute',inset:0,overflow:'hidden',background:'#fff',padding:10}}>
        <pre style={{margin:0,fontSize:9,lineHeight:1.55,color:'#1f2937',whiteSpace:'pre-wrap',fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'}}>
          {(file?.content || 'CSV file').split('\n').slice(0,8).join('\n')}
        </pre>
      </div>
    );
  }

  return (
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:14,textAlign:"center",background:`linear-gradient(135deg, ${c.cd}, ${c.gf})`}}>
      <div style={{padding:"8px 12px",borderRadius:10,background:c.ac+"14",border:"1px solid "+c.ac+"35",fontSize:13,fontWeight:900,color:c.ac,letterSpacing:0}}>{ext.toUpperCase()}</div>
      <div style={{maxWidth:"85%",fontSize:12,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
      <div style={{fontSize:10,fontWeight:700,color:c.gr,textTransform:"uppercase",letterSpacing:0}}>Open preview</div>
    </div>
  );
}

// ── ArtifactPane — Claude-style code/preview panel in right sidebar ──────────
function ArtifactPane({ art, c, onClose, onRequestChanges }) {
  const paneWidth = useW();
  const mob = paneWidth < 768;
  const [artView, setArtView] = useState('preview'); // 'preview' | 'code'
  const [publishing, setPublishing] = useState(false);
  const [publishSlug, setPublishSlug] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState(art.slug ? window.location.origin+'/p/'+art.slug : null);
  const [artContent, setArtContent] = useState(art.content || '');
  const isHtml = art.name?.endsWith('.html');
  const previewContent = useMemo(
    () => responsiveArtifactDocument(artContent, mob),
    [artContent, mob],
  );

  // If content wasn't loaded yet, fetch it
  useEffect(() => {
    if (!art.content && art.fileId) {
      fetch(`/api/files/preview/${art.fileId}`)
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
      const r = await fetch(`/api/files/artifacts/${art.fileId}/publish`, {
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
    <div style={{flex:1,minWidth:0,maxWidth:'100vw',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:mob?'8px':'10px 14px',borderBottom:'1px solid '+c.ln,background:c.cd,display:'flex',alignItems:'center',gap:mob?5:8,flexWrap:mob?'wrap':'nowrap',maxWidth:'100%',overflow:'hidden',flexShrink:0}}>
        <button onClick={onClose} style={{width:22,height:22,borderRadius:5,border:'1px solid '+c.ln,background:'transparent',cursor:'pointer',fontSize:11,color:c.so,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <div style={{flex:1,minWidth:0,flexBasis:mob?'calc(100% - 58px)':'auto',fontSize:12,fontWeight:700,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{art.name}</div>
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
            <iframe srcDoc={previewContent} style={{display:'block',width:'100%',maxWidth:'100%',height:'100%',border:'none',background:'#fff',overflow:'hidden'}} sandbox="allow-scripts allow-same-origin" title={art.name}/>
          ) : (
            <div style={{height:'100%',overflow:'auto',background:'#1a1a2e'}}>
              <pre style={{margin:0,padding:'14px 16px',fontSize:11,lineHeight:1.6,color:'#e8e8f0',fontFamily:'monospace',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{artContent}</pre>
            </div>
          )
        ) : isBinaryArtifactName(art.name) ? (
          <BinaryArtifactPreview file={art} c={c} compact />
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
        <button onClick={()=>onRequestChanges(art.name,art.fileId)} style={{flex:1,padding:'8px 0',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,cursor:'pointer',fontSize:12,fontWeight:600,color:c.tx,fontFamily:'inherit'}}>Request Changes</button>
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
  const icon = isBinaryArtifactName(dn) ? ext.toUpperCase() : 'FILE';

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
        onOpenSide({ ...artData, name: artData.name, content, fileId: artData.fileId });
      }
    } catch {}
  };

  return (
    <div onClick={handleClick} style={{marginTop:8,borderRadius:12,border:"1px solid rgba(52,168,83,0.3)",background:c.cd,cursor:"pointer",overflow:"hidden",transition:"transform .15s",display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}
      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
      onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
      <span style={{minWidth:38,padding:"4px 6px",borderRadius:7,background:isBinaryArtifactName(dn)?c.ac+"12":c.gf,border:"1px solid "+(isBinaryArtifactName(dn)?c.ac+"33":c.ln),fontSize:10,fontWeight:800,color:isBinaryArtifactName(dn)?c.ac:c.so,textAlign:"center"}}>{icon}</span>
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
function CallsPage({c,mob,aFN="Agent"}){
  const [calls,setCalls]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(null);

  useEffect(()=>{
    fetch('/api/chat/calls').then(r=>r.json()).then(d=>{setCalls(d.calls||[]);setLoading(false);}).catch(()=>setLoading(false));
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

function SkillsPage({c,mob,aFN="Agent"}){
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
      const r=await fetch('/api/skills');
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
    try{ await fetch(`/api/skills/${id}/toggle`,{method:'POST'}); }catch(e){}
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
    try{ await fetch(`/api/skills/${id}`,{method:'DELETE'}); }catch(e){}
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
  const [brandDriveOpen,setBrandDriveOpen]=useState(false);

  const brand=kits[activeIdx]||kits[0]||emptyKit;
  const setBrand=(fn)=>setKits(prev=>{const next=[...prev];next[activeIdx]=typeof fn==='function'?fn(next[activeIdx]):{...next[activeIdx],...fn};return next;});

  useEffect(()=>{
    Promise.all([
      getAuthHeaders().then(h=>fetch('/api/dashboard/business-profile',{headers:h})).then(r=>r.json()),
      getAuthHeaders().then(h=>fetch('/api/dashboard/brand-kit',{headers:h})).then(r=>r.json()).catch(()=>({kits:[],brand:null}))
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
      await (async()=>{const _h=await getAuthHeaders();return fetch('/api/dashboard/brand-kit',{method:'POST',headers:{..._h,'Content-Type':'application/json'},body:JSON.stringify({kits:toSave})});})();
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

  const processLogoFile=(f)=>{
    if(!f)return;
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
  const handleLogoUpload=(e)=>processLogoFile(e.target.files[0]);

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
                <br/><button onClick={()=>setBrandDriveOpen(true)} style={{marginTop:5,padding:"4px 8px",borderRadius:6,border:"1px solid "+c.ac,background:"transparent",cursor:"pointer",fontSize:10,color:c.ac,fontWeight:700}}>Choose from Google Drive</button>
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
          {brandDriveOpen&&<GoogleDrivePicker c={c} onClose={()=>setBrandDriveOpen(false)} onSelect={file=>{if(!file.type?.startsWith("image/"))throw new Error("Choose an image file for the logo.");const bytes=Uint8Array.from(atob(file.data),ch=>ch.charCodeAt(0));processLogoFile(new File([bytes],file.name,{type:file.type}));}}/>}
    </div>
  );
}

function SiteLoginsManager({c,mob,aFN="Agent"}){
  const [sites,setSites]=useState({configured:[],available:[]});
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [addForm,setAddForm]=useState({siteKey:'',username:'',password:'',notes:''});
  const [saving,setSaving]=useState(false);
  const [showPw,setShowPw]=useState(false);

  const loadSites=async()=>{
    try{
      const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/credential-registry",{headers:_hh});
      if(r.ok){const d=await r.json();setSites(d);}
    }catch{}
    setLoading(false);
  };

  useEffect(()=>{loadSites();},[]);

  const saveSite=async()=>{
    if(!addForm.siteKey||!addForm.username||!addForm.password)return;
    setSaving(true);
    try{
      const _hh3=await getAuthHeaders();const r=await fetch("/api/dashboard/credential-registry",{
        method:"POST",headers:{..._hh3,"Content-Type":"application/json"},
        body:JSON.stringify(addForm)
      });
      if(r.ok){setShowAdd(false);setAddForm({siteKey:'',username:'',password:'',notes:''});await loadSites();}
    }catch{}
    setSaving(false);
  };

  const removeSite=async(siteKey)=>{
    try{
      const _hh=await getAuthHeaders();const r=await fetch(`/api/dashboard/credential-registry/${siteKey}`,{method:"DELETE",headers:_hh});
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

function countBookWords(value){
  return String(value||'').replace(/```[\s\S]*?```/g,' ').replace(/[#>*_`~[\](){}|\\-]/g,' ').trim().split(/\s+/).filter(Boolean).length;
}
function bookSectionRank(file){
  const name=String(file?.name||'').toLowerCase();
  if(/complete[-_ ]?manuscript|outline(?!.*table)|front[-_ ]matter|back[-_ ]matter/.test(name))return 999;
  if(/half[-_ ]?title/.test(name))return 10;
  if(/title[-_ ]?page/.test(name))return 20;
  if(/copyright/.test(name))return 30;
  if(/dedication/.test(name))return 40;
  if(/table[-_ ]of[-_ ]contents|\btoc\b/.test(name))return 50;
  if(/preface/.test(name))return 60;
  if(/acknowledg/.test(name))return 70;
  if(/introduction/.test(name))return 80;
  const chapter=Number(name.match(/(?:chapter|ch)[-_ ]?(\d+)/)?.[1]||0);
  if(chapter)return 100+chapter;
  if(/conclusion|epilogue|afterword/.test(name))return 300;
  if(/about[-_ ]the[-_ ]author|author[-_ ]bio/.test(name))return 310;
  if(/resources/.test(name))return 320;
  if(/references|bibliography/.test(name))return 330;
  return 999;
}
function formatBookElapsed(milliseconds){
  const minutes=Math.max(0,Math.floor(milliseconds/60000));
  const seconds=Math.max(0,Math.floor((milliseconds%60000)/1000));
  return `${minutes}:${String(seconds).padStart(2,'0')}`;
}
function paginateBookSection(markdown='',wordsPerPage=165){
  const blocks=String(markdown||'').split(/\n{2,}/).map(block=>block.trim()).filter(Boolean);
  if(!blocks.length)return[''];
  const pages=[];let current=[];let words=0;
  for(const block of blocks){
    const blockWords=countBookWords(block);
    if(blockWords>wordsPerPage){
      if(current.length){pages.push(current.join('\n\n'));current=[];words=0;}
      const tokens=block.split(/\s+/).filter(Boolean);
      while(tokens.length>wordsPerPage){
        pages.push(tokens.splice(0,wordsPerPage).join(' '));
      }
      if(tokens.length){current=[tokens.join(' ')];words=tokens.length;}
      continue;
    }
    if(current.length&&words+blockWords>wordsPerPage){
      pages.push(current.join('\n\n'));current=[];words=0;
    }
    current.push(block);words+=blockWords;
  }
  if(current.length)pages.push(current.join('\n\n'));
  return pages.length?pages:[''];
}
function inspectBookArtifacts(files=[]){
  const textFiles=files.filter(file=>typeof file.content==='string'&&file.content.trim());
  const chapters=textFiles.filter(file=>/(?:^|[-_ ])(?:chapter|ch)[-_ ]?\d+/i.test(file.name||'')).sort((a,b)=>{
    const number=file=>Number(String(file.name||'').match(/(?:chapter|ch)[-_ ]?(\d+)/i)?.[1]||999);
    return number(a)-number(b);
  });
  const manuscripts=textFiles.filter(file=>/(?:complete[-_ ]?)?manuscript/i.test(file.name||'')&&!/outline/i.test(file.name||'')).sort((a,b)=>countBookWords(b.content)-countBookWords(a.content));
  const wordCount=chapters.reduce((sum,file)=>sum+countBookWords(file.content),0);
  const outline=files.some(file=>/outline|table[-_ ]of[-_ ]contents/i.test(file.name||''));
  const frontMatter=files.some(file=>/front[-_ ]matter|preface|introduction|copyright|title[-_ ]page/i.test(file.name||''));
  const backMatter=files.some(file=>/back[-_ ]matter|about[-_ ]the[-_ ]author|acknowledg|bibliography|references/i.test(file.name||''));
  const docx=files.some(file=>/\.docx$/i.test(file.name||'')||/wordprocessingml/i.test(file.mimeType||''));
  const printPdf=files.some(file=>/kdp|print|interior/i.test(file.name||'')&&/\.pdf$/i.test(file.name||''));
  const kdpChecklist=files.some(file=>/kdp[-_ ](?:package[-_ ])?checklist|upload[-_ ]checklist/i.test(file.name||''));
  const cover=files.some(file=>/cover/i.test(file.name||'')&&/image|png|jpe?g|webp/i.test(`${file.fileType} ${file.mimeType} ${file.name}`));
  const sections=textFiles.filter(file=>bookSectionRank(file)<999).sort((a,b)=>bookSectionRank(a)-bookSectionRank(b));
  const titlePage=files.some(file=>/title[-_ ]?page/i.test(file.name||''));
  const copyright=files.some(file=>/copyright/i.test(file.name||''));
  const toc=files.some(file=>/table[-_ ]of[-_ ]contents|\btoc\b/i.test(file.name||''));
  const preface=files.some(file=>/preface/i.test(file.name||''));
  const introduction=files.some(file=>/introduction/i.test(file.name||''));
  const aboutAuthor=files.some(file=>/about[-_ ]the[-_ ]author|author[-_ ]bio/i.test(file.name||''));
  return {wordCount,chapters,sections,manuscript:manuscripts[0]||null,outline,frontMatter,titlePage,copyright,toc,preface,introduction,backMatter,aboutAuthor,docx,printPdf,kdpChecklist,cover,complete:wordCount>=10000&&!!manuscripts[0]&&outline&&titlePage&&copyright&&toc&&preface&&introduction&&aboutAuthor&&docx&&printPdf&&kdpChecklist&&cover};
}
function deriveBookProjectState(project,history=[],proof={}){
  if(proof.complete)return'complete';
  const recentText=(history||[]).slice(-5).map(message=>String(message?.content||message?.text||'')).join(' ');
  if(/failed to process|generation needs attention|stopped\. what would you like|timed out|technical error|has not passed.*verification/i.test(recentText))return'needs_attention';
  const updatedAt=new Date(project?.updated_at||project?.created_at||0).getTime();
  if(updatedAt&&Date.now()-updatedAt<15*60*1000)return'in_progress';
  return'needs_attention';
}
function bookProjectStateLabel(state){
  return state==='complete'?'Completed book':state==='in_progress'?'Pending':'Needs review';
}

const BookFlipPage=forwardRef(function BookFlipPage({page,coverUrl,coverIsWrap,bookDescription,onEditCover,onSelectText},ref){
  const sectionName=String(page?.sectionName||'').toLowerCase();
  const pageClass=/title[-_ ]?page/.test(sectionName)?'kdp-title-page':/copyright/.test(sectionName)?'kdp-copyright-page':/table[-_ ]of[-_ ]contents|\btoc\b/.test(sectionName)?'kdp-toc-page':/(?:chapter|ch)[-_ ]?\d+/.test(sectionName)?'kdp-chapter-page':'';
  const isCover=page?.kind==='front'||page?.kind==='back';
  return <div ref={ref} data-density={isCover?'hard':'soft'} data-reader-page-key={page?.key||''} className={`bloom-flip-page ${isCover?'bloom-flip-cover':''}`} onMouseUp={event=>!isCover&&onSelectText?.(page,event)} onContextMenu={event=>{if(!isCover){event.preventDefault();onSelectText?.(page,event,true);}}}>
    {page?.kind==='front'?(coverIsWrap?<div className="bloom-wrap-cover" style={{backgroundImage:`url("${coverUrl}")`,backgroundPosition:'right center'}}/>:<img src={coverUrl} alt="Front cover" className="bloom-cover-image"/>)
      :page?.kind==='back'?(coverIsWrap?<div className="bloom-wrap-cover" style={{backgroundImage:`url("${coverUrl}")`,backgroundPosition:'left center'}}/>:<div className="bloom-back-cover"><div><strong>Back cover</strong><p>{bookDescription||'The finished back-cover description will appear here.'}</p></div></div>)
      :<><div className={`kdp-book-page ${pageClass}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{page?.text||''}</ReactMarkdown></div><div className="bloom-page-number">{page?.displayNumber}</div></>}
    {isCover&&<button onClick={onEditCover} className="bloom-cover-edit">Edit cover</button>}
  </div>;
});

function BookSuiteIcon({name,size=21}){
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.9,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
  if(name==='home')return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></svg>;
  if(name==='create')return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m5.6 5.6 2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg>;
  if(name==='projects')return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h8"/></svg>;
  if(name==='authors')return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>;
  if(name==='publish')return <svg {...common}><path d="M12 16V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>;
  if(name==='resources')return <svg {...common}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M17 14v6M14 17h6"/></svg>;
  if(name==='menu')return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>;
}

function AppMenuIcon({name,size=18}){
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.9,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
  if(name==='business')return <svg {...common}><path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16"/><path d="M9 21v-4h4v4M8 7h1m3 0h1M8 11h1m3 0h1M17 9h3v12"/></svg>;
  if(name==='billing')return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>;
  if(name==='desktop')return <svg {...common}><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
  if(name==='skills')return <svg {...common}><path d="M9 18h6M10 22h4"/><path d="M8.2 14.5A7 7 0 1 1 15.8 14.5C14.7 15.3 14 16.2 14 18h-4c0-1.8-.7-2.7-1.8-3.5Z"/></svg>;
  if(name==='settings')return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.36.36.7.6 1 .3.28.7.42 1.1.4h.09v4h-.09c-.4-.02-.8.12-1.1.4-.24.3-.45.64-.6 1Z"/></svg>;
  if(name==='developer')return <svg {...common}><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></svg>;
  if(name==='light')return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>;
  if(name==='dark')return <svg {...common}><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>;
  if(name==='logout')return <svg {...common}><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>;
  if(name==='form')return <svg {...common}><path d="M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="m15 16 1.5 1.5L20 14"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>;
}

const FINISHED_BOOK_LIBRARY=[{
  id:'conquer-your-doubts',
  title:'Conquer Your Doubts: A Guide to Unshakeable Confidence',
  type:'Finished book',
  url:'/assets/book-library/conquer-your-doubts-complete.pdf',
  coverUrl:'/assets/book-library/conquer-your-doubts-cover.png',
}];
const BOOK_BONUS_LIBRARY=[
  {id:'kindle-cash-multiplier',title:'The Kindle Cash Multiplier Training',type:'Training',url:'/assets/book-library/kindle-cash-multiplier-complete.pdf',coverUrl:'/assets/book-library/kindle-cash-multiplier-cover.png'},
  {id:'kdp-optimization-checklist',title:'Amazon KDP Optimization Checklist',type:'Checklist',url:'/assets/book-library/amazon-kdp-checklist-complete.pdf',coverUrl:'/assets/book-library/amazon-kdp-optimization-checklist-cover.png'},
  {id:'book-description-templates',title:'Done-For-You Book Description Templates',type:'Templates',url:'/assets/book-library/book-description-templates-complete.pdf',coverUrl:'/assets/book-library/book-description-templates-cover.png'},
  {id:'30-books-fast-start',title:'30 Books in 30 Days Fast-Start Blueprint',type:'Blueprint',url:'/assets/book-library/30-books-blueprint-complete.pdf',coverUrl:'/assets/book-library/30-books-in-30-days-cover.png'},
];

const PdfFlipPage=forwardRef(function PdfFlipPage({pdf,pageNumber,pageWidth},ref){
  const [pageImage,setPageImage]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const page=await pdf.getPage(pageNumber);
        const base=page.getViewport({scale:1});
        const targetWidth=pageWidth;
        const viewport=page.getViewport({scale:targetWidth/base.width});
        const canvas=document.createElement('canvas');
        const ratio=Math.min(window.devicePixelRatio||1,2);
        canvas.width=Math.floor(viewport.width*ratio);
        canvas.height=Math.floor(viewport.height*ratio);
        const context=canvas.getContext('2d');
        await page.render({canvasContext:context,viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
        if(!cancelled)setPageImage(canvas.toDataURL('image/jpeg',0.94));
      }catch{if(!cancelled)setFailed(true);}
    })();
    return()=>{cancelled=true;};
  },[pdf,pageNumber,pageWidth]);
  return <div ref={ref} data-density={pageNumber===1?'hard':'soft'} className={`bloom-flip-page ${pageNumber===1?'bloom-flip-cover':''}`} style={{padding:0,background:'#fff',display:'grid',placeItems:'center',overflow:'hidden',boxShadow:'inset 0 0 0 1px rgba(20,20,24,.1)'}}>
    {failed?<div style={{color:'#7b7b82',padding:20}}>Page could not be rendered.</div>:pageImage?<img src={pageImage} alt={`Page ${pageNumber}`} draggable="false" style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}}/>:<div style={{color:'#7b7b82',fontSize:11}}>Rendering page {pageNumber}…</div>}
  </div>;
});

function LibraryBookReader({resource,onClose,onEdit,mob,c}){
  const [pdf,setPdf]=useState(null);
  const [page,setPage]=useState(1);
  const [error,setError]=useState('');
  const [readerSize,setReaderSize]=useState({width:mob?320:400,height:mob?480:600});
  const flipRef=useRef(null);
  useEffect(()=>{
    let disposed=false;
    const task=pdfjsLib.getDocument(resource.url);
    task.promise.then(async doc=>{
      if(disposed)return;
      const firstPage=await doc.getPage(1);
      const viewport=firstPage.getViewport({scale:1});
      const maxWidth=mob?320:500;
      const maxHeight=mob?480:640;
      const scale=Math.min(maxWidth/viewport.width,maxHeight/viewport.height);
      setReaderSize({width:Math.round(viewport.width*scale),height:Math.round(viewport.height*scale)});
      setPdf(doc);
    }).catch(()=>{if(!disposed)setError('This book could not be opened.');});
    return()=>{disposed=true;task.destroy();};
  },[resource.url]);
  return <div data-testid="library-book-reader" role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1300,background:'rgba(7,8,12,.88)',backdropFilter:'blur(10px)',display:'grid',placeItems:'center',padding:mob?10:24}}>
    <div style={{width:'min(1180px,100%)',height:mob?'calc(100dvh - 20px)':'min(880px,calc(100vh - 48px))',borderRadius:18,background:c.cd,border:'1px solid '+c.ln,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 28px 90px rgba(0,0,0,.5)'}}>
      <div style={{padding:'12px 15px',borderBottom:'1px solid '+c.ln,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <div style={{minWidth:0}}><div style={{fontSize:9,fontWeight:900,color:c.ac,textTransform:'uppercase',letterSpacing:'.09em'}}>Library reader</div><div style={{fontSize:13,fontWeight:800,color:c.tx,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{resource.title}</div></div>
        <button onClick={onClose} aria-label="Close reader" style={{border:'1px solid '+c.ln,borderRadius:9,background:c.sf,color:c.tx,width:34,height:34,cursor:'pointer'}}>×</button>
      </div>
      <div style={{flex:1,minHeight:0,display:'grid',placeItems:'center',padding:mob?'8px 4px':'18px',overflow:'hidden',background:'#15161b'}}>
        <style>{`
          .bloom-real-book{margin:0 auto!important;filter:drop-shadow(0 22px 26px rgba(0,0,0,.3));overflow:hidden!important;clip-path:inset(0 round 3px);contain:paint}
          .bloom-flip-page{position:relative;box-sizing:border-box;width:100%;height:100%;overflow:hidden;background:#fffdf8;color:#26231f;border:1px solid rgba(83,68,47,.2)}
          .bloom-flip-page:before{content:"";position:absolute;z-index:2;top:0;bottom:0;width:18px;right:0;background:linear-gradient(90deg,transparent,rgba(45,35,25,.1));pointer-events:none}
          .bloom-flip-cover:before{display:none}
          .stf__parent{margin:0 auto;overflow:hidden!important;clip-path:inset(0 round 3px);contain:paint}
          .stf__block{background:transparent!important}
        `}</style>
        {error?<div style={{color:'#ef6464'}}>{error}</div>:!pdf?<div style={{color:c.so}}>Preparing page-turn preview…</div>:<HTMLFlipBook ref={flipRef} className="bloom-real-book" width={readerSize.width} height={readerSize.height} size="fixed" drawShadow autoSize={false} maxShadowOpacity={0.65} startZIndex={10} showCover mobileScrollSupport usePortrait={mob} swipeDistance={20} clickEventForward useMouseEvents flippingTime={1050} onFlip={event=>setPage(event.data+1)} style={{}}>
          {Array.from({length:pdf.numPages},(_,index)=><PdfFlipPage key={index+1} pdf={pdf} pageNumber={index+1} pageWidth={readerSize.width}/>)}
        </HTMLFlipBook>}
      </div>
      <div style={{padding:'11px 14px',borderTop:'1px solid '+c.ln,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:7,alignItems:'center'}}><button onClick={()=>flipRef.current?.pageFlip()?.flipPrev('bottom')} disabled={!pdf||page<=1} style={{padding:'8px 10px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx}}>← Previous</button><span style={{fontSize:10,color:c.so}}>Page {page} of {pdf?.numPages||'—'}</span><button onClick={()=>flipRef.current?.pageFlip()?.flipNext('bottom')} disabled={!pdf||page>=pdf.numPages} style={{padding:'8px 10px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx}}>Next →</button></div>
        <div style={{display:'flex',gap:7}}><button onClick={()=>onEdit(resource,page)} style={{padding:'9px 12px',borderRadius:9,border:'1px solid '+c.ac,background:c.ac+'12',color:c.ac,fontWeight:850,cursor:'pointer'}}>Edit with Bloomie</button><a href={resource.url} download style={{padding:'9px 12px',borderRadius:9,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontWeight:850,textDecoration:'none'}}>Download PDF</a></div>
      </div>
    </div>
  </div>;
}

const cleanChatTitle=title=>String(title||'New conversation').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u,'').trim()||'New conversation';

function BookWorkspace({c,mob,aFN="Bloomie",agentId,onOpenChat,standalone=false}){
  const [access,setAccess]=useState('checking');
  const [boosterResources,setBoosterResources]=useState([]);
  const [libraryReader,setLibraryReader]=useState(null);
  const [boosterStatus,setBoosterStatus]=useState('idle');
  const [checkout,setCheckout]=useState(null);
  const [checkoutError,setCheckoutError]=useState('');
  const [view,setView]=useState('new');
  const [stage,setStage]=useState('setup');
  const [mode,setMode]=useState('keyword');
  const [startMode,setStartMode]=useState('surprise');
  const [setupStep,setSetupStep]=useState(1);
  const [setupMessage,setSetupMessage]=useState('');
  const [brief,setBrief]=useState('');
  const [topic,setTopic]=useState('');
  const [bookDescription,setBookDescription]=useState('');
  const [chapterPlanMode,setChapterPlanMode]=useState('auto');
  const [chapterPlan,setChapterPlan]=useState('');
  const [title,setTitle]=useState('');
  const [bookType,setBookType]=useState('Business / self-help');
  const [reader,setReader]=useState('General audience');
  const [voice,setVoice]=useState('Conversational and encouraging');
  const [projects,setProjects]=useState([]);
  const [projectFilter,setProjectFilter]=useState('all');
  const [active,setActive]=useState(null);
  const [messages,setMessages]=useState([]);
  const [artifacts,setArtifacts]=useState([]);
  const [status,setStatus]=useState('idle');
  const [error,setError]=useState('');
  const [chapterIndex,setChapterIndex]=useState(0);
  const [pageIndex,setPageIndex]=useState(0);
  const [pageTurnDirection,setPageTurnDirection]=useState('');
  const [pageTurnAnimating,setPageTurnAnimating]=useState(false);
  const [readerEdge,setReaderEdge]=useState('front');
  const [coverIsWrap,setCoverIsWrap]=useState(false);
  const flipBookRef=useRef(null);
  const [readerPageNumber,setReaderPageNumber]=useState(0);
  const [pageSelection,setPageSelection]=useState(null);
  const [selectionDraft,setSelectionDraft]=useState('');
  const [selectionEditing,setSelectionEditing]=useState(false);
  const [selectionWorking,setSelectionWorking]=useState(false);
  const [revision,setRevision]=useState('');
  const [revising,setRevising]=useState(false);
  const [directEditing,setDirectEditing]=useState(false);
  const [sectionDraft,setSectionDraft]=useState('');
  const [savingSection,setSavingSection]=useState(false);
  const [sectionSaveMessage,setSectionSaveMessage]=useState('');
  const [bookUpload,setBookUpload]=useState({manuscript:null,cover:null,title:'',rightsConfirmed:false});
  const [bookUploadStatus,setBookUploadStatus]=useState('idle');
  const [bookUploadMessage,setBookUploadMessage]=useState('');
  const [coverRevision,setCoverRevision]=useState('');
  const [coverRevising,setCoverRevising]=useState(false);
  const [coverRevisionMessage,setCoverRevisionMessage]=useState('');
  const [bookSection,setBookSection]=useState('dashboard');
  const [bookNavOpen,setBookNavOpen]=useState(false);
  const [toolMode,setToolMode]=useState('keyword');
  const [toolBrief,setToolBrief]=useState('');
  const [toolProjectId,setToolProjectId]=useState('');
  const [toolStatus,setToolStatus]=useState('idle');
  const [toolMessage,setToolMessage]=useState('');
  const [audioVoice,setAudioVoice]=useState('Warm, natural, conversational');
  const [trimSize,setTrimSize]=useState('6 × 9 inches');
  const [authors,setAuthors]=useState([]);
  const [authorStatus,setAuthorStatus]=useState('idle');
  const [selectedAuthorId,setSelectedAuthorId]=useState('');
  const [authorForm,setAuthorForm]=useState({name:'',biography:'',voiceDirection:'',sample:null,headshot:null});
  const [bookClock,setBookClock]=useState(Date.now());
  const bookProof=useMemo(()=>inspectBookArtifacts(artifacts),[artifacts]);
  const filteredProjects=useMemo(()=>projectFilter==='all'?projects:projects.filter(project=>project.bookState===projectFilter),[projects,projectFilter]);
  const activeSection=bookProof.sections[chapterIndex]||bookProof.sections[0]||null;
  const activeSectionPages=useMemo(()=>paginateBookSection(activeSection?.content||''),[activeSection?.fileId,activeSection?.content]);
  const bookPageCounts=useMemo(()=>bookProof.sections.map(section=>paginateBookSection(section.content||'').length),[bookProof.sections]);
  const totalBookPages=useMemo(()=>bookPageCounts.reduce((sum,count)=>sum+count,0),[bookPageCounts]);
  const globalBookPage=useMemo(()=>bookPageCounts.slice(0,chapterIndex).reduce((sum,count)=>sum+count,0)+pageIndex,[bookPageCounts,chapterIndex,pageIndex]);
  const outlineArtifact=useMemo(()=>artifacts.find(file=>/outline|table[-_ ]of[-_ ]contents/i.test(file.name||''))||null,[artifacts]);
  const coverArtifact=useMemo(()=>artifacts.find(file=>/cover/i.test(file.name||'')&&/image|png|jpe?g|webp/i.test(`${file.fileType} ${file.mimeType} ${file.name}`))||null,[artifacts]);
  const coverPreviewUrl=coverArtifact?.previewUrl||coverArtifact?.downloadUrl||coverArtifact?.url||coverArtifact?.download_url||coverArtifact?.storage_url||'/assets/book-studio-stage-bestseller.png';
  const totalReaderPages=totalBookPages+(coverArtifact?2:0);
  const readerPages=useMemo(()=>{
    const pages=[];
    if(coverArtifact)pages.push({kind:'front',key:`front-${coverArtifact.fileId||coverArtifact.name}`});
    let displayNumber=1;
    bookProof.sections.forEach((section,sectionIndex)=>{
      paginateBookSection(section.content||'').forEach((text,sectionPageIndex)=>{
        pages.push({kind:'content',key:`${section.fileId}-${sectionPageIndex}`,text,sectionName:section.name,sectionIndex,sectionPageIndex,displayNumber});
        displayNumber+=1;
      });
    });
    if(coverArtifact)pages.push({kind:'back',key:`back-${coverArtifact.fileId||coverArtifact.name}`});
    return pages;
  },[bookProof.sections,coverArtifact]);
  const handleReaderFlip=useCallback(event=>{
    const nextIndex=Number(event?.data||0);
    setReaderPageNumber(nextIndex);
    const page=readerPages[nextIndex];
    if(page?.kind==='content'){
      setReaderEdge('content');
      setChapterIndex(page.sectionIndex);
      setPageIndex(page.sectionPageIndex);
    }else if(page?.kind==='front')setReaderEdge('front');
    else if(page?.kind==='back')setReaderEdge('back');
  },[readerPages]);
  const capturePageSelection=useCallback((page,event,force=false)=>{
    const text=window.getSelection()?.toString().trim()||'';
    if(!text){if(force)setPageSelection(null);return;}
    setPageSelection({text,page,x:event.clientX||window.innerWidth/2,y:event.clientY||window.innerHeight/2});
    setSelectionDraft(text);
    setSelectionEditing(false);
  },[]);
  useEffect(()=>{
    const captureClonedPageSelection=event=>{
      const selection=window.getSelection();
      const text=selection?.toString().trim()||'';
      if(!text)return;
      const anchor=selection.anchorNode?.nodeType===1?selection.anchorNode:selection.anchorNode?.parentElement;
      const pageElement=anchor?.closest?.('[data-reader-page-key]');
      const page=readerPages.find(item=>item.key===pageElement?.dataset?.readerPageKey);
      if(page?.kind==='content')capturePageSelection(page,event,event.type==='contextmenu');
    };
    document.addEventListener('mouseup',captureClonedPageSelection);
    document.addEventListener('contextmenu',captureClonedPageSelection);
    return()=>{document.removeEventListener('mouseup',captureClonedPageSelection);document.removeEventListener('contextmenu',captureClonedPageSelection);};
  },[readerPages,capturePageSelection]);
  const productionPhase=bookProof.kdpChecklist?'KDP package complete':bookProof.printPdf&&bookProof.docx?'Running KDP validation':bookProof.cover?'Preparing upload files':bookProof.manuscript&&bookProof.backMatter?'Creating the cover':bookProof.chapters.length?'Writing and assembling the book':bookProof.frontMatter?'Writing the body chapters':bookProof.outline?'Creating the front matter':'Planning the outline';
  const previewPhase=activeSection?'section':bookProof.outline?'outline':'planning';
  const bookStartedAt=new Date(active?.created_at||active?.updated_at||Date.now()).getTime();
  const bookElapsed=formatBookElapsed(Math.max(0,bookClock-bookStartedAt));
  const advanceBookForward=()=>{
    if(readerEdge==='front'){setReaderEdge('content');return;}
    if(readerEdge==='back')return;
    const step=mob?1:2;
    if(pageIndex+step<activeSectionPages.length){setPageIndex(index=>index+step);return;}
    if(chapterIndex<bookProof.sections.length-1){setChapterIndex(index=>index+1);setPageIndex(0);}
    else if(coverArtifact)setReaderEdge('back');
  };
  const advanceBookBack=()=>{
    if(readerEdge==='back'){
      setReaderEdge('content');
      const lastIndex=Math.max(0,bookProof.sections.length-1);
      setChapterIndex(lastIndex);
      setPageIndex(Math.max(0,(bookPageCounts[lastIndex]||1)-(mob?1:2)));
      return;
    }
    if(readerEdge==='front')return;
    const step=mob?1:2;
    if(pageIndex-step>=0){setPageIndex(index=>index-step);return;}
    if(chapterIndex>0){
      const previousIndex=chapterIndex-1;
      setChapterIndex(previousIndex);
      setPageIndex(Math.max(0,(bookPageCounts[previousIndex]||1)-step));
    }else if(coverArtifact)setReaderEdge('front');
  };
  const animateBookTurn=direction=>{
    if(pageTurnAnimating)return;
    setPageTurnDirection(direction);setPageTurnAnimating(true);
    window.setTimeout(()=>{
      if(direction==='forward')advanceBookForward();else advanceBookBack();
      setPageTurnAnimating(false);setPageTurnDirection('');
    },760);
  };
  const turnBookForward=()=>animateBookTurn('forward');
  const turnBookBack=()=>animateBookTurn('back');
  useEffect(()=>{if(chapterIndex>=bookProof.sections.length)setChapterIndex(Math.max(0,bookProof.sections.length-1));},[bookProof.sections.length,chapterIndex]);
  useEffect(()=>{if(status!=='working')return;const timer=setInterval(()=>setBookClock(Date.now()),1000);return()=>clearInterval(timer);},[status]);
  useEffect(()=>{setDirectEditing(false);setSectionDraft(activeSection?.content||'');setSectionSaveMessage('');},[activeSection?.fileId]);
  const checkBookAccess=useCallback(async()=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/books/access?agentId=${encodeURIComponent(agentId||'')}`,{headers:h});
      const d=await r.json();
      setAccess(r.ok&&d.authorized?'active':d.checkoutRequired?'checkout':'blocked');
      if(!r.ok&&!d.checkoutRequired)setCheckoutError(d.error||'Book Creator access could not be verified.');
    }catch(e){setAccess('blocked');setCheckoutError(e.message||'Book Creator access could not be verified.');}
  },[agentId]);
  useEffect(()=>{checkBookAccess();},[checkBookAccess]);

  const loadAuthors=useCallback(async()=>{
    setAuthorStatus('loading');
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/books/authors?agentId=${encodeURIComponent(agentId||'')}`,{headers:h});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Author Library could not be loaded.');
      setAuthors(d.authors||[]);
      setSelectedAuthorId(current=>current||(d.authors?.[0]?.id||''));
      setAuthorStatus('ready');
    }catch(e){setAuthorStatus('failed');setError(e.message||'Author Library could not be loaded.');}
  },[agentId]);
  useEffect(()=>{if(access==='active')loadAuthors();},[access,loadAuthors]);

  const loadBooster=useCallback(async()=>{
    setBoosterStatus('loading');
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/books/booster?agentId=${encodeURIComponent(agentId||'')}`,{headers:h});
      const d=await r.json();
      if(!r.ok){
        setBoosterResources([]);
        setBoosterStatus(d.upgradeRequired?'locked':'error');
        return;
      }
      setBoosterResources(d.resources||[]);
      setBoosterStatus('active');
    }catch{
      setBoosterStatus('error');
    }
  },[agentId]);

  const openBookCheckout=async()=>{
    setCheckoutError('');
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/billing/prepare-checkout',{method:'POST',headers:h,body:JSON.stringify({plan:'book_creator'})});
      const d=await r.json();
      if(!r.ok||!d.success)throw new Error(d.error||'Could not prepare Book Creator checkout.');
      if(d.alreadyActive){await checkBookAccess();return;}
      if(!d.checkoutPlanId)throw new Error('Whop checkout is not configured for Book Creator.');
      setCheckout({planId:d.checkoutPlanId,name:d.plan?.name||'Bloomie Book Creator'});
    }catch(e){setCheckoutError(e.message||'Could not prepare checkout.');}
  };

  const openBoosterCheckout=async()=>{
    setCheckoutError('');
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/billing/prepare-checkout',{method:'POST',headers:h,body:JSON.stringify({plan:'book_creator_booster'})});
      const d=await r.json();
      if(!r.ok||!d.success)throw new Error(d.error||'Could not prepare the Quick-Launch Booster checkout.');
      if(d.alreadyActive){await checkBookAccess();await loadBooster();return;}
      setCheckout({planId:d.checkoutPlanId,name:d.plan?.name||'Book Creator Quick-Launch Booster'});
    }catch(e){setCheckoutError(e.message||'Could not prepare the booster checkout.');}
  };

  const loadProjects=useCallback(async()=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/chat/sessions?agentId=${encodeURIComponent(agentId||'')}`,{headers:h});
      const d=await r.json();
      const bookSessions=(d.sessions||[]).filter(session=>String(session.title||'').startsWith('📚 '));
      const enriched=await Promise.all(bookSessions.map(async project=>{
        try{
          const [historyRes,fileRes]=await Promise.all([
            fetch(`/api/chat/sessions/${project.id}`,{headers:h}),
            fetch(`/api/files/artifacts?sessionId=${encodeURIComponent(project.id)}&limit=60&includeContent=true`,{headers:h}),
          ]);
          const history=await historyRes.json();
          const files=await fileRes.json();
          const artifacts=files.artifacts||[];
          const proof=inspectBookArtifacts(artifacts);
          const cover=artifacts.find(file=>/cover/i.test(file.name||'')&&/image|png|jpe?g|webp/i.test(`${file.fileType} ${file.mimeType} ${file.name}`));
          return {...project,bookState:deriveBookProjectState(project,history.messages||[],proof),bookProof:proof,coverUrl:cover?.previewUrl||cover?.downloadUrl||cover?.url||cover?.download_url||cover?.storage_url||''};
        }catch{
          return {...project,bookState:'needs_attention',bookProof:inspectBookArtifacts([]),coverUrl:''};
        }
      }));
      setProjects(enriched);
    }catch{}
  },[agentId]);
  const loadProject=useCallback(async project=>{
    setActive(project);setView('project');
    try{
      const h=await getAuthHeaders();
      const [historyRes,fileRes]=await Promise.all([
        fetch(`/api/chat/sessions/${project.id}`,{headers:h}),
        fetch(`/api/files/artifacts?sessionId=${encodeURIComponent(project.id)}&limit=40&includeContent=true`,{headers:h})
      ]);
      const history=await historyRes.json();
      const files=await fileRes.json();
      setMessages(history.messages||[]);
      setArtifacts(files.artifacts||[]);
      const proof=inspectBookArtifacts(files.artifacts||[]);
      setStatus(proof.complete?'complete':'working');
      setReaderEdge(proof.cover?'front':'content');
      setStage(proof.chapters.length?'preview':'outline');
    }catch(e){setError(e.message||'Could not load this book.');}
  },[]);
  useEffect(()=>{loadProjects();},[loadProjects]);

  const startBook=async()=>{
    let selectedAuthor=authors.find(author=>author.id===selectedAuthorId)||null;
    if(!selectedAuthor&&authorForm.name.trim()){
      selectedAuthor=await createAuthor();
      if(!selectedAuthor)return;
    }
    const suppliedDirection=[
      topic.trim()&&`Topic: ${topic.trim()}`,
      bookDescription.trim()&&`Book description: ${bookDescription.trim()}`,
      chapterPlanMode==='custom'&&chapterPlan.trim()&&`Requested chapter outline or chapter directions:\n${chapterPlan.trim()}`,
    ].filter(Boolean).join('\n');
    const surpriseBrief=`Choose a timely, compelling ${bookType.toLowerCase()} concept for ${reader.toLowerCase()}. ${suppliedDirection||'Choose the strongest subject and reader transformation.'} Create the strongest marketable title, clear reader transformation, chapter structure, examples, and publishing description. Use the selected author profile and approved tenant references as the source of truth.`;
    const effectiveBrief=startMode==='surprise'?surpriseBrief:(suppliedDirection||brief.trim());
    if(!effectiveBrief)return;
    const sessionId=crypto.randomUUID();
    const workingTitle=(title.trim()||(startMode==='surprise'?'Bloomie Surprise Book':effectiveBrief.split(/\s+/).slice(0,7).join(' '))).slice(0,90);
    const project={id:sessionId,title:`📚 ${workingTitle}`,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    setActive(project);setMessages([]);setArtifacts([]);setError('');setStatus('working');setView('project');setStage('outline');
    setProjects(current=>[project,...current]);
    const approvedBrief=`DEDICATED BLOOMIE BOOK WORKSPACE REQUEST

Create a polished, complete manuscript of 10,000–10,800 measured words. This form is the user's approved creative brief, so do not pause for routine clarification. Make responsible editorial choices where details are not specified.

Working title: ${workingTitle}
Input mode: ${startMode==='surprise'?'surprise me':mode}
${startMode==='surprise'?'Creative direction chosen by Bloomie':mode==='keyword'?'Keyword or topic':'Book description'}: ${effectiveBrief}
Book type: ${bookType}
Target reader: ${reader}
Author voice: ${voice}
Author profile: ${selectedAuthor?selectedAuthor.name:'No saved author selected'}
Author biography: ${selectedAuthor?.biography||'Not provided'}
Author voice direction: ${selectedAuthor?.voice_direction||voice}
Approved author reference IDs: ${(selectedAuthor?.reference_ids||[]).join(', ')||'None'}
Chapter planning: ${chapterPlanMode==='custom'&&chapterPlan.trim()?`Follow the user's requested chapter outline or chapter directions below unless a small editorial adjustment is required for coherence.\n${chapterPlan.trim()}`:'Create the strongest chapter structure for the approved topic and reader transformation.'}
Core message: Derive one clear, useful promise from the approved topic or description.
Starting point: Starting from scratch.
Scope: Complete approximately 10,000-word manuscript plus supporting cover.

Required workflow:
1. Publish task_progress with these complete visible stages: Researching the approved brief; Building the outline; Creating front matter; Writing and saving body chapters; Creating back matter; Assembling the KDP interiors; Creating the cover; Validating and packaging KDP uploads.
2. Create outline.md, then save every readable book section as its own Markdown artifact. Do not group the readable sections into one front-matter.md or back-matter.md file.
3. Save the front of the book in this exact reading order: 00-half-title.md, 01-title-page.md, 02-copyright.md, optional 03-dedication.md only when appropriate, 04-table-of-contents.md, 05-preface.md, optional 06-acknowledgments.md, and 07-introduction.md. The TOC chapter names must exactly match the body headings and support a Kindle interactive TOC when Heading 1 styles are applied. Do not invent an ISBN, publisher, endorsements, or legal claims.
4. Write 7–9 substantial body chapters. Save every chapter as a separately named Markdown artifact such as chapter-01-title.md. The saved chapter files alone—not the front or back matter—must total 10,000–10,800 measured words. Maintain a running body word count.
5. Save the end of the book as separate artifacts: optional 90-conclusion.md when the manuscript needs one, required 91-about-the-author.md, optional 92-resources.md, and 93-references.md only when real sources were used. Never invent citations.
6. Assemble complete-manuscript.md from those same saved artifacts in exact reading order: title pages, copyright, optional dedication, TOC, preface, optional acknowledgments, introduction, numbered chapters, optional conclusion, About the Author, optional resources, and real references.
7. Create kdp-ebook.docx with real Heading 1 chapter titles, page breaks between major sections, no tab-based indents, and a navigable TOC-ready structure.
8. Create kdp-print-interior.pdf for a 6 × 9 inch, no-bleed paperback unless the approved brief specifies another trim or interior bleed. Use mirrored margins, an inside gutter based on final page count, embedded fonts and images, 300 DPI images, no crop marks/comments/placeholders, and chapters beginning on appropriate pages.
9. Generate a professional 2:3 portrait front cover that fits this specific genre and audience. Do not use placeholder art. Save back-cover/book-description copy and five discoverability keywords with the project. A full print wrap must be calculated only after the final page count and paper choice are known.
10. Create kdp-package-checklist.md recording the final title and author match, body word count, trim size, bleed choice, page count, gutter/margins, embedded fonts, image resolution, TOC/heading validation, eBook DOCX, print PDF, cover status, and preview still required in Kindle Previewer and KDP Print Previewer.
11. Continue through tool calls and verification until the deliverables exist. Never report completion below 10,000 measured body words or while any required KDP package file is missing. Report the exact verified body word count and real files inline when complete.`;
    let pollTimer;
    try{
      pollTimer=setInterval(async()=>{
        try{
          const h=await getAuthHeaders();
          const [historyRes,fileRes]=await Promise.all([
            fetch(`/api/chat/sessions/${sessionId}`,{headers:h}),
            fetch(`/api/files/artifacts?sessionId=${encodeURIComponent(sessionId)}&limit=40&includeContent=true`,{headers:h})
          ]);
          const history=await historyRes.json();const files=await fileRes.json();
          setMessages(history.messages||[]);setArtifacts(files.artifacts||[]);
        }catch{}
      },2500);
      const h=await getAuthHeaders();
      const r=await fetch('/api/chat/message',{method:'POST',headers:h,body:JSON.stringify({
        message:approvedBrief,sessionId,agentId,sessionType:'book_creation',bookTitle:workingTitle
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Book generation could not start.');
      await loadProject(project);
      await loadProjects();
    }catch(e){setStatus('failed');setError(e.message||'Book generation failed.');}
    finally{if(pollTimer)clearInterval(pollTimer);}
  };

  const requestChapterRevision=async()=>{
    if(!active?.id||!activeSection||!revision.trim()||revising)return;
    setRevising(true);setError('');setStatus('working');
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/chat/message',{method:'POST',headers:h,body:JSON.stringify({
        message:`BOOK SECTION REVISION REQUEST
Book project: ${String(active.title||'').replace(/^📚\s*/,'')}
Book section artifact to revise: ${activeSection.name}
Requested changes: ${revision.trim()}

Edit the existing section artifact in place and preserve its position in the reading order. Preserve the book's voice and continuity. Then rebuild complete-manuscript.md, the DOCX, and print PDF so they contain the revised section. Recalculate the body-chapter word count and keep the finished book at 10,000–10,800 body words. Do not create a duplicate section file.`,
        sessionId:active.id,agentId,sessionType:'book_creation',bookTitle:String(active.title||'').replace(/^📚\s*/,'')
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'The revision could not be completed.');
      setRevision('');
      await loadProject(active);
    }catch(e){setStatus('failed');setError(e.message||'The revision failed.');}
    finally{setRevising(false);}
  };

  const saveSectionDirectly=async()=>{
    if(!activeSection?.fileId||!sectionDraft.trim()||savingSection)return;
    setSavingSection(true);setError('');setSectionSaveMessage('');
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/files/artifacts/${activeSection.fileId}`,{
        method:'PUT',headers:h,body:JSON.stringify({content:sectionDraft})
      });
      const d=await r.json();
      if(!r.ok||!d.success)throw new Error(d.error||'This section could not be saved.');
      setArtifacts(current=>current.map(file=>file.fileId===activeSection.fileId?{...file,content:sectionDraft,fileSize:d.artifact?.file_size||file.fileSize}:file));
      setDirectEditing(false);
      setSectionSaveMessage('Saved. This section will be used the next time the complete manuscript and publishing files are rebuilt.');
    }catch(e){setError(e.message||'This section could not be saved.');}
    finally{setSavingSection(false);}
  };

  const saveSelectedText=async()=>{
    const section=bookProof.sections[pageSelection?.page?.sectionIndex];
    if(!section?.fileId||!pageSelection?.text||!selectionDraft.trim()||selectionWorking)return;
    const source=String(section.content||'');
    if(!source.includes(pageSelection.text)){setError('That selected passage changed. Select it again before saving.');return;}
    setSelectionWorking(true);setError('');
    try{
      const content=source.replace(pageSelection.text,selectionDraft.trim());
      const h=await getAuthHeaders();
      const r=await fetch(`/api/files/artifacts/${section.fileId}`,{method:'PUT',headers:h,body:JSON.stringify({content})});
      const d=await r.json();
      if(!r.ok||!d.success)throw new Error(d.error||'The selected text could not be saved.');
      setArtifacts(current=>current.map(file=>file.fileId===section.fileId?{...file,content}:file));
      setPageSelection(null);setSelectionEditing(false);
      window.getSelection()?.removeAllRanges();
    }catch(e){setError(e.message||'The selected text could not be saved.');}
    finally{setSelectionWorking(false);}
  };

  const requestSelectedTextChange=async action=>{
    const section=bookProof.sections[pageSelection?.page?.sectionIndex];
    if(!active?.id||!section||!pageSelection?.text||selectionWorking)return;
    const directions={
      rewrite:'Rewrite only this selected passage for clarity and impact while preserving its meaning and the author voice.',
      expand:'Expand only this selected passage with useful detail and a concrete example.',
      shorten:'Shorten only this selected passage without losing its important meaning.',
      tone:'Make only this selected passage warmer, more natural, and consistent with the saved author voice.',
      image:'Generate a publishing-appropriate image for this exact passage, save it as a project artifact, and insert its Markdown image reference immediately after the selected passage.',
    };
    setSelectionWorking(true);setError('');
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/chat/message',{method:'POST',headers:h,body:JSON.stringify({
        message:`BOOK PREVIEW SELECTION EDIT
Book project: ${String(active.title||'').replace(/^📚\s*/,'')}
Section artifact: ${section.name}
Exact selected text:
<<<
${pageSelection.text}
>>>
Requested operation: ${directions[action]||directions.rewrite}

Locate this exact selection inside the named artifact and modify only that occurrence. Do not rewrite the surrounding section. Save the artifact in place, preserve reading order, then rebuild complete-manuscript.md, DOCX, and print PDF. If the operation is image insertion, use the current image-generation tool and include accessible alt text. Verify the updated artifact before reporting completion.`,
        sessionId:active.id,agentId,sessionType:'book_creation',bookTitle:String(active.title||'').replace(/^📚\s*/,'')
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'The selected passage could not be updated.');
      setPageSelection(null);window.getSelection()?.removeAllRanges();
      await loadProject(active);
    }catch(e){setError(e.message||'The selected passage could not be updated.');}
    finally{setSelectionWorking(false);}
  };

  const requestCoverRevision=async()=>{
    if(!active?.id||!coverArtifact||!coverRevision.trim()||coverRevising)return;
    setCoverRevising(true);setError('');setCoverRevisionMessage('');
    try{
      const h=await getAuthHeaders();
      const sourceUrl=coverArtifact.previewUrl||coverArtifact.downloadUrl||coverArtifact.url||coverArtifact.download_url||coverArtifact.storage_url||`/api/files/preview/${coverArtifact.fileId}`;
      const r=await fetch('/api/chat/message',{method:'POST',headers:h,body:JSON.stringify({
        message:`BOOK COVER REVISION REQUEST
Book project: ${String(active.title||'').replace(/^📚\s*/,'')}
Current cover artifact: ${coverArtifact.name}
Current cover reference: ${sourceUrl}
Requested changes: ${coverRevision.trim()}

Create a NEW revised cover version; do not overwrite or delete the current cover. Use image_generate with engine "runpod", size "1024x1536", aspect_ratio "2:3", target_width 1800, target_height 2700, allow_crop false. This tenant's RunPod image engine is FLUX Dev. Preserve the exact book title and author spelling from the current project metadata. Compose the new artwork natively as a full 2:3 portrait cover with safe margins; do not crop, stretch, letterbox, or add blurred edges. Save the completed full-resolution image as a new project artifact whose filename includes "cover-revision". Verify the saved artifact and show the revised cover inline.`,
        sessionId:active.id,agentId,sessionType:'book_cover',bookTitle:String(active.title||'').replace(/^📚\s*/,'')
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'The cover revision could not be completed.');
      setCoverRevision('');
      setCoverRevisionMessage('The revised RunPod cover was saved as a new version. The original remains in the project files.');
      await loadProject(active);
    }catch(e){setError(e.message||'The cover revision failed.');}
    finally{setCoverRevising(false);}
  };

  const runBookTool=async(section)=>{
    if(!toolBrief.trim()&&section==='research')return;
    if(!toolProjectId&&['audio','pod','cover'].includes(section))return;
    setToolStatus('working');setToolMessage('');
    const selectedProject=projects.find(project=>project.id===toolProjectId);
    const sessionId=selectedProject?.id||crypto.randomUUID();
    const instructions={
      research:`BOOK MARKET RESEARCH REQUEST
Research mode: ${toolMode}
Topic or book idea: ${toolBrief.trim()}

Produce practical, evidence-based publishing research for this exact idea. Save a polished Markdown research report containing reader profile, market promise, keyword directions, competitive positioning, category opportunities, risks, and a recommended book concept. Do not claim live marketplace facts without sources.`,
      agent:`BOOK AGENT REQUEST
${selectedProject?`Existing book project: ${String(selectedProject.title||'').replace(/^📚\s*/,'')}`:'New book planning session'}
User request: ${toolBrief.trim()}

Act as the dedicated book strategist and editor. Complete the requested planning, writing, or revision work and save any useful deliverables as project artifacts. Continue through verification rather than returning planning-only prose.`,
      audio:`AUDIOBOOK PRODUCTION REQUEST
Source book project: ${String(selectedProject?.title||'').replace(/^📚\s*/,'')}
Narration direction: ${audioVoice}
Additional direction: ${toolBrief.trim()||'Use the finished manuscript as written.'}

Load the completed manuscript artifacts from this project. Prepare an audiobook production package, split narration by chapter, use the tenant-authorized audio tools, save playable chapter audio files plus a delivery manifest, and verify each saved output before reporting completion.`,
      pod:`PRINT-ON-DEMAND PRODUCTION REQUEST
Source book project: ${String(selectedProject?.title||'').replace(/^📚\s*/,'')}
Trim size: ${trimSize}
Additional direction: ${toolBrief.trim()||'Use professional trade paperback styling.'}

Create a print-ready POD package from the saved manuscript. Produce an interior PDF, print specifications, cover-wrap brief, metadata checklist, and upload-readiness report. Preserve tenant and project boundaries and verify every saved artifact.`,
      cover:`BOOK COVER GENERATION REQUEST
Source book project: ${String(selectedProject?.title||'').replace(/^📚\s*/,'')}
Creative direction: ${toolBrief.trim()||'Create a professional genre-appropriate cover based on the manuscript and metadata.'}

Read the project title, description, genre, and reader promise. Use image_generate with engine "runpod", size "1024x1536", aspect_ratio "2:3", target_width 1800, target_height 2700, and allow_crop false. The configured RunPod engine is FLUX Dev. Generate the cover natively at the publishing ratio without cropping, stretching, letterboxing, or blurred edges. Save the full-resolution image as a project artifact and verify that the title and author treatment are usable.`,
    };
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/chat/message',{method:'POST',headers:h,body:JSON.stringify({
        message:instructions[section]||instructions.agent,
        sessionId,agentId,sessionType:`book_${section}`,
        bookTitle:String(selectedProject?.title||'').replace(/^📚\s*/,'')
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'The Book Studio task could not start.');
      setToolStatus('complete');
      setToolMessage(section==='research'?'Research report saved.':`The ${section} task finished and its deliverables were saved with the project.`);
      if(selectedProject)await loadProject(selectedProject);
      await loadProjects();
    }catch(e){
      setToolStatus('failed');
      setToolMessage(e.message||'The Book Studio task failed.');
    }
  };

  const filePayload=file=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve({name:file.name,type:file.type,data:String(reader.result||'').split(',')[1]||''});
    reader.onerror=()=>reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
  const importOwnedBook=async(upload=bookUpload)=>{
    if(!upload.manuscript||!upload.rightsConfirmed||bookUploadStatus==='working')return;
    setBookUploadStatus('working');setBookUploadMessage('');setError('');
    try{
      const sessionId=crypto.randomUUID();
      const files=[await filePayload(upload.manuscript)];
      if(upload.cover)files.push(await filePayload(upload.cover));
      const importedTitle=(upload.title.trim()||upload.manuscript.name.replace(/\.[^.]+$/,'')).slice(0,90);
      const h=await getAuthHeaders();
      const r=await fetch('/api/chat/upload',{method:'POST',headers:h,body:JSON.stringify({
        message:`OWNED BOOK IMPORT REQUEST
Book title: ${importedTitle}
Rights confirmation: The signed-in user affirmed that they own this work or have permission from the rights holder to edit it.

Import the attached manuscript into this Book Studio project. Preserve the author's wording. Extract and save each readable part as its own editable artifact in correct reading order: title page, copyright, table of contents, preface, introduction, every numbered chapter, conclusion, acknowledgments, and about the author when present. Save complete-manuscript.md as well. If a cover image is attached, save it as the active cover artifact without regenerating it. Do not invent missing manuscript content during import. After saving, verify the section list and measured body word count so the user can open Preview & Edit and turn pages immediately.`,
        sessionId,agentId,sessionType:'book_import',bookTitle:importedTitle,rightsConfirmed:true,files
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'The book could not be imported.');
      setBookUploadStatus('complete');
      setBookUploadMessage('Book imported. Opening its editable page preview…');
      const project={id:sessionId,title:`📚 ${importedTitle}`,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      await loadProjects();
      await loadProject(project);
      setReaderEdge('front');
      setStage('preview');
    }catch(e){setBookUploadStatus('failed');setBookUploadMessage(e.message||'The book import failed.');}
  };
  const editLibraryBook=async(resource,pageNumber=1)=>{
    setLibraryReader(null);
    setBookUploadStatus('working');
    setBookUploadMessage(`Preparing page ${pageNumber} and the full book for editing…`);
    try{
      const [pdfResponse,coverResponse]=await Promise.all([fetch(resource.url),fetch(resource.coverUrl)]);
      if(!pdfResponse.ok)throw new Error('The library PDF could not be loaded for editing.');
      const manuscript=new File([await pdfResponse.blob()],`${resource.id}.pdf`,{type:'application/pdf'});
      const cover=coverResponse.ok?new File([await coverResponse.blob()],`${resource.id}-cover.png`,{type:coverResponse.headers.get('content-type')||'image/png'}):null;
      const upload={manuscript,cover,title:resource.title,rightsConfirmed:true};
      setBookUpload(upload);
      setBookSection('creator');
      setView('new');
      setStage('setup');
      setStartMode('upload');
      setSetupStep(1);
      await importOwnedBook(upload);
    }catch(e){
      setBookUploadStatus('failed');
      setBookUploadMessage(e.message||'The library book could not be prepared for editing.');
      setBookSection('creator');
      setView('new');
      setStage('setup');
      setStartMode('upload');
    }
  };
  const createAuthor=async()=>{
    if(!authorForm.name.trim()||authorStatus==='saving')return;
    setAuthorStatus('saving');setError('');
    try{
      const h=await getAuthHeaders();
      const referenceIds=[];let headshotUrl='';
      for(const [file,category,title] of [
        [authorForm.sample,'writing_style',`${authorForm.name} writing sample`],
        [authorForm.headshot,'brand',`${authorForm.name} author photo`],
      ]){
        if(!file)continue;
        const payload=await filePayload(file);
        const rr=await fetch('/api/references/upload',{method:'POST',headers:h,body:JSON.stringify({
          file:payload,title,description:`Approved source material for the ${authorForm.name} reusable Book Studio author profile.`,
          category,scope:'organization',approved:true,
        })});
        const rd=await rr.json();
        if(!rr.ok)throw new Error(rd.error||`Could not upload ${file.name}`);
        referenceIds.push(rd.reference.id);
        if(file===authorForm.headshot)headshotUrl=rd.reference.storage_url||'';
      }
      const r=await fetch('/api/books/authors',{method:'POST',headers:h,body:JSON.stringify({
        agentId,name:authorForm.name,biography:authorForm.biography,
        voiceDirection:authorForm.voiceDirection,referenceIds,headshotUrl,
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Author profile could not be created.');
      setAuthors(current=>[d.author,...current]);
      setSelectedAuthorId(d.author.id);
      setAuthorForm({name:'',biography:'',voiceDirection:'',sample:null,headshot:null});
      setAuthorStatus('ready');
      return d.author;
    }catch(e){setAuthorStatus('failed');setError(e.message||'Author profile could not be created.');return null;}
  };

  const inputStyle={width:'100%',padding:'12px 13px',borderRadius:10,border:'1px solid '+c.ln,background:c.inp,color:c.tx,fontSize:13,fontFamily:'inherit'};
  const selectStyle={...inputStyle,cursor:'pointer'};
  const bookNavGroups=[
    {label:'Book Studio',items:[
      {key:'dashboard',label:'Home',icon:'home'},
      {key:'creator',label:'Create',icon:'create'},
      {key:'books',label:'Projects',icon:'projects'},
      {key:'authors',label:'Authors',icon:'authors'},
      {key:'publish',label:'Publish',icon:'publish'},
    ]},
    {label:'More',items:[{key:'booster',label:'Library',icon:'resources'}]},
  ];
  const selectBookSection=key=>{
    setBookSection(key);
    setBookNavOpen(false);
    if(key==='creator'){setView('new');setStage('setup');}
    if(key==='books'){setView('saved');loadProjects();}
    if(key==='booster'){setView('booster');loadBooster();}
  };
  const visibleBonusResources=boosterResources.length?boosterResources:BOOK_BONUS_LIBRARY;
  const bookSidebar=<aside data-testid="book-suite-sidebar" style={{width:mob?286:248,maxWidth:'86vw',height:'100%',background:c.cd,borderRight:'1px solid '+c.ln,display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden',...(mob?{position:'absolute',zIndex:80,left:0,top:0,bottom:0,transform:bookNavOpen?'translateX(0)':'translateX(-102%)',transition:'transform .2s ease',boxShadow:bookNavOpen?'16px 0 40px rgba(0,0,0,.3)':'none'}:{})}}>
    <div style={{padding:'18px 16px 13px',borderBottom:'1px solid '+c.ln}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:38,height:38,borderRadius:12,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontWeight:900,fontSize:18,boxShadow:'0 7px 18px rgba(231,111,139,.24)'}}>B</div>
        <div><div style={{fontSize:14,fontWeight:850,color:c.tx}}>Book Studio</div><div style={{fontSize:10,color:c.so}}>Powered by your Bloomie</div></div>
      </div>
    </div>
    <div style={{flex:1,minHeight:0,overflowY:'auto',padding:'10px 9px 18px'}}>
      {bookNavGroups.map(group=><div key={group.label} style={{marginBottom:13}}>
        <div style={{padding:'4px 9px 5px',fontSize:9,fontWeight:850,color:c.fa,textTransform:'uppercase',letterSpacing:'.09em'}}>{group.label}</div>
        {group.items.map(item=>{
          const active=bookSection===item.key;
          return <button key={item.key} onClick={()=>selectBookSection(item.key)} style={{width:'100%',padding:'10px 11px',marginBottom:2,border:active?'1px solid rgba(231,111,139,.28)':'1px solid transparent',borderRadius:10,background:active?'linear-gradient(135deg,rgba(244,162,97,.14),rgba(231,111,139,.14))':'transparent',color:active?c.tx:c.so,cursor:'pointer',display:'flex',alignItems:'center',gap:11,textAlign:'left',fontSize:12,fontWeight:active?800:650}}>
            <span style={{width:24,height:24,display:'grid',placeItems:'center',color:active?c.ac:c.so,flexShrink:0}}><BookSuiteIcon name={item.icon}/></span>
            <span>{item.label}</span>
          </button>;
        })}
      </div>)}
    </div>
  </aside>;
  const bookShell=content=><div data-testid="book-suite-shell" style={{height:'100%',minHeight:0,position:'relative',display:'flex',overflow:'hidden',background:c.bg}}>
    {mob&&bookNavOpen&&<div onClick={()=>setBookNavOpen(false)} style={{position:'absolute',inset:0,zIndex:75,background:'rgba(0,0,0,.44)'}}/>}
    {bookSidebar}
    <section style={{flex:1,minWidth:0,minHeight:0,position:'relative',overflow:'hidden'}}>
      {mob&&<button aria-label="Open Book Studio menu" onClick={()=>setBookNavOpen(true)} style={{position:'absolute',zIndex:30,top:10,left:10,width:42,height:42,borderRadius:11,border:'1px solid '+c.ln,background:c.cd,color:c.tx,boxShadow:'0 5px 18px rgba(0,0,0,.18)',cursor:'pointer',display:'grid',placeItems:'center'}}><BookSuiteIcon name="menu" size={23}/></button>}
      {content}
    </section>
  </div>;
  if(access!=='active')return bookShell(<div data-testid="book-access-gate" style={{height:'100%',overflowY:'auto',padding:mob?'62px 14px 90px':'52px 36px 70px'}}>
    <div style={{maxWidth:620,margin:'0 auto',padding:mob?22:36,borderRadius:20,background:c.cd,border:'1px solid '+c.ln,boxShadow:'0 18px 55px rgba(0,0,0,.12)',textAlign:'center'}}>
      <div style={{width:58,height:58,borderRadius:17,display:'grid',placeItems:'center',margin:'0 auto 15px',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:27,fontWeight:900}}>B</div>
      <h1 style={{fontSize:mob?24:30,color:c.tx,margin:'0 0 9px'}}>Bloomie Book Creator</h1>
      {access==='checking'?<p style={{color:c.so,fontSize:13}}>Checking your Book Creator access…</p>:<>
        <p style={{color:c.so,fontSize:13,lineHeight:1.65,maxWidth:500,margin:'0 auto 18px'}}>Turn one idea into a complete, editable 10,000-word manuscript with a cover and export files. Purchase once through the secure checkout inside Bloomie.</p>
        {checkoutError&&<div style={{padding:'10px 12px',borderRadius:10,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',color:'#ef6464',fontSize:12,marginBottom:14}}>{checkoutError}</div>}
        {access==='checkout'&&<button onClick={openBookCheckout} style={{width:'100%',padding:'13px',border:0,borderRadius:11,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer'}}>Get Book Creator — $37 once</button>}
        <button onClick={checkBookAccess} style={{marginTop:10,padding:'9px 13px',border:'1px solid '+c.ln,borderRadius:9,background:c.sf,color:c.so,fontSize:12,fontWeight:700,cursor:'pointer'}}>I already purchased — refresh access</button>
      </>}
    </div>
    {checkout&&<div role="dialog" aria-modal="true" aria-label={`${checkout.name} checkout`} style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(0,0,0,.78)',display:'flex',alignItems:mob?'flex-end':'center',justifyContent:'center',padding:mob?0:20}} onClick={()=>setCheckout(null)}>
      <div style={{width:'100%',maxWidth:560,height:mob?'92dvh':'min(780px,92vh)',background:c.cd,border:'1px solid '+c.ln,borderRadius:mob?'18px 18px 0 0':18,display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderBottom:'1px solid '+c.ln}}><div style={{flex:1}}><div style={{fontSize:15,fontWeight:750,color:c.tx}}>{checkout.name}</div><div style={{fontSize:11,color:c.so}}>Secure checkout powered by Whop</div></div><button aria-label="Close checkout" onClick={()=>setCheckout(null)} style={{width:34,height:34,borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer',fontSize:19}}>×</button></div>
        <div style={{flex:1,minHeight:0,overflowY:'auto',background:'#fff'}}><div data-whop-checkout-plan-id={checkout.planId} data-whop-checkout-return-url={`${window.location.origin}/book-creator?billing=success`} style={{width:'100%',minHeight:'100%'}}/></div>
      </div>
    </div>}
  </div>);
  const moduleCopy={
    dashboard:{title:'Book Studio',sub:'Research an idea, create the manuscript, produce each format, and prepare it for publishing.'},
    authors:{title:'Author Library',sub:'Create reusable author identities from approved writing samples, biography, imagery, and voice direction.'},
    research:{title:'Research Tools',sub:'Turn a broad idea into a clear, market-aware book direction.'},
    agent:{title:'AI Book Agent',sub:`Give ${aFN} a strategy, writing, or revision assignment for a new or saved book.`},
    audio:{title:'Audio Book Creator',sub:'Convert a completed manuscript into organized, playable chapter narration.'},
    pod:{title:'POD Book Creator',sub:'Create a print-ready interior and production package for a physical edition.'},
    cover:{title:'Cover Generator',sub:'Generate a native-size, genre-aware cover from the project source material.'},
    audiobooks:{title:'Manage AudioBooks',sub:'Open the source projects that contain your narration and audio deliverables.'},
    podbooks:{title:'Manage POD Books',sub:'Open the source projects that contain print-ready files and production checks.'},
    publish:{title:'Publishing Hub',sub:'Review completed projects and continue to the appropriate publishing marketplace.'},
  };
  if(!['creator','books','booster'].includes(bookSection)){
    const module=moduleCopy[bookSection]||moduleCopy.dashboard;
    return bookShell(<div data-testid={`book-module-${bookSection}`} style={{height:'100%',overflowY:'auto',padding:mob?'66px 14px 90px':'34px 38px 70px'}}>
      <div style={{maxWidth:1040,margin:'0 auto'}}>
        <div style={{display:'inline-flex',padding:'6px 11px',borderRadius:18,background:'linear-gradient(135deg,rgba(244,162,97,.14),rgba(231,111,139,.14))',border:'1px solid rgba(231,111,139,.24)',color:c.ac,fontSize:10,fontWeight:850}}>✦ BLOOMIE BOOK STUDIO</div>
        <h1 style={{fontSize:mob?26:36,color:c.tx,margin:'15px 0 8px'}}>{module.title}</h1>
        <p style={{fontSize:13,lineHeight:1.65,color:c.so,maxWidth:680,marginBottom:25}}>{module.sub}</p>
        {bookSection==='authors'&&<div style={{display:'grid',gridTemplateColumns:mob?'1fr':'minmax(300px,390px) minmax(0,1fr)',gap:16,alignItems:'start'}}>
          <div style={{padding:mob?18:22,borderRadius:17,border:'1px solid '+c.ln,background:c.cd}}>
            <h2 style={{fontSize:16,color:c.tx,margin:'0 0 5px'}}>Create an author</h2>
            <p style={{fontSize:11,lineHeight:1.55,color:c.so,margin:'0 0 16px'}}>Use material you own or have permission to use. The writing sample becomes a reusable style reference for future projects.</p>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:c.tx,marginBottom:6}}>Author name</label>
            <input value={authorForm.name} onChange={e=>setAuthorForm({...authorForm,name:e.target.value})} placeholder="Name shown on the book" style={{...inputStyle,marginBottom:12}}/>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:c.tx,marginBottom:6}}>Biography</label>
            <textarea value={authorForm.biography} onChange={e=>setAuthorForm({...authorForm,biography:e.target.value})} rows={4} placeholder="Background, expertise, audience, and point of view…" style={{...inputStyle,resize:'vertical',marginBottom:12}}/>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:c.tx,marginBottom:6}}>Voice direction</label>
            <textarea value={authorForm.voiceDirection} onChange={e=>setAuthorForm({...authorForm,voiceDirection:e.target.value})} rows={3} placeholder="Conversational, direct, faith-centered, research-led…" style={{...inputStyle,resize:'vertical',marginBottom:12}}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginBottom:14}}>
              <label style={{padding:'11px',borderRadius:10,border:'1px dashed '+c.ln,background:c.sf,color:c.so,fontSize:10,fontWeight:750,cursor:'pointer',textAlign:'center'}}>Writing sample<input type="file" accept=".pdf,.docx,.txt,.md,.html" onChange={e=>setAuthorForm({...authorForm,sample:e.target.files?.[0]||null})} style={{display:'none'}}/><span style={{display:'block',marginTop:5,color:authorForm.sample?c.ac:c.fa,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{authorForm.sample?.name||'PDF, DOCX, TXT'}</span></label>
              <label style={{padding:'11px',borderRadius:10,border:'1px dashed '+c.ln,background:c.sf,color:c.so,fontSize:10,fontWeight:750,cursor:'pointer',textAlign:'center'}}>Author photo<input type="file" accept="image/*" onChange={e=>setAuthorForm({...authorForm,headshot:e.target.files?.[0]||null})} style={{display:'none'}}/><span style={{display:'block',marginTop:5,color:authorForm.headshot?c.ac:c.fa,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{authorForm.headshot?.name||'JPG, PNG, WEBP'}</span></label>
            </div>
            <button onClick={createAuthor} disabled={!authorForm.name.trim()||authorStatus==='saving'} style={{width:'100%',padding:12,border:0,borderRadius:10,background:authorForm.name.trim()?'linear-gradient(135deg,#F4A261,#E76F8B)':c.sf,color:authorForm.name.trim()?'#fff':c.fa,fontWeight:850,cursor:authorForm.name.trim()?'pointer':'not-allowed'}}>{authorStatus==='saving'?'Building author profile…':'Save reusable author'}</button>
          </div>
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><h2 style={{fontSize:15,color:c.tx,margin:0}}>Saved authors</h2><span style={{fontSize:10,color:c.so}}>{authors.length} profile{authors.length===1?'':'s'}</span></div>
            {authorStatus==='loading'?<div style={{padding:34,textAlign:'center',color:c.so}}>Loading Author Library…</div>:authors.length===0?<div style={{padding:40,borderRadius:15,border:'1px dashed '+c.ln,color:c.so,textAlign:'center'}}><div style={{fontSize:30,marginBottom:8}}>A</div><strong style={{color:c.tx}}>No authors yet</strong><div style={{fontSize:11,marginTop:6}}>Create the first reusable author profile.</div></div>:<div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(2,minmax(0,1fr))',gap:10}}>{authors.map(author=><button key={author.id} onClick={()=>{setSelectedAuthorId(author.id);setBookSection('creator');setView('new');setStage('setup');}} style={{padding:15,borderRadius:14,border:'1px solid '+(selectedAuthorId===author.id?c.ac:c.ln),background:selectedAuthorId===author.id?'linear-gradient(135deg,rgba(244,162,97,.1),rgba(231,111,139,.1))':c.cd,color:c.tx,textAlign:'left',cursor:'pointer',display:'flex',gap:11}}>
              {author.headshot_url?<img src={author.headshot_url} alt="" style={{width:46,height:46,borderRadius:12,objectFit:'cover',flexShrink:0}}/>:<div style={{width:46,height:46,borderRadius:12,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:18,fontWeight:900,flexShrink:0}}>{author.name.charAt(0).toUpperCase()}</div>}
              <span style={{minWidth:0}}><strong style={{display:'block',fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{author.name}</strong><span style={{display:'block',fontSize:10,lineHeight:1.45,color:c.so,marginTop:4}}>{author.reference_ids?.length||0} approved reference{author.reference_ids?.length===1?'':'s'}</span><span style={{display:'block',fontSize:10,fontWeight:800,color:c.ac,marginTop:7}}>Use for a new book →</span></span>
            </button>)}</div>}
          </div>
        </div>}
        {bookSection==='dashboard'&&<div>
          <div data-testid="book-dashboard-hero" style={{position:'relative',overflow:'hidden',padding:mob?'24px 20px':'34px 36px',borderRadius:24,border:'1px solid rgba(231,111,139,.28)',background:'radial-gradient(circle at 82% 18%,rgba(231,111,139,.22),transparent 32%),linear-gradient(135deg,rgba(244,162,97,.12),rgba(231,111,139,.08) 52%,rgba(15,18,28,.2))',marginBottom:18}}>
            <div style={{position:'relative',zIndex:2,maxWidth:620}}>
              <div style={{fontSize:10,fontWeight:900,letterSpacing:'.12em',color:c.ac,marginBottom:10}}>YOUR AI PUBLISHING STUDIO</div>
              <h2 style={{fontSize:mob?28:42,lineHeight:1.06,color:c.tx,margin:'0 0 12px'}}>Watch your next book come alive.</h2>
              <p style={{fontSize:13,lineHeight:1.65,color:c.so,maxWidth:540,margin:'0 0 20px'}}>Choose a direction—or let Bloomie surprise you. Then watch the outline, chapters, cover, and finished book assemble in one live production room.</p>
              <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
                <button onClick={()=>{setStartMode('surprise');setSetupStep(1);selectBookSection('creator');}} style={{padding:'12px 17px',border:0,borderRadius:11,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:12,fontWeight:850,cursor:'pointer'}}>✦ Surprise me</button>
                <button onClick={()=>{setStartMode('topic');setSetupStep(1);selectBookSection('creator');}} style={{padding:'12px 17px',borderRadius:11,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:12,fontWeight:800,cursor:'pointer'}}>Create with my idea</button>
              </div>
            </div>
            {!mob&&<div aria-hidden="true" style={{position:'absolute',right:38,bottom:-24,width:210,height:250,transform:'rotate(4deg)',borderRadius:'10px 18px 18px 10px',background:'linear-gradient(145deg,#F4A261,#E76F8B)',boxShadow:'-22px 28px 50px rgba(0,0,0,.3)',opacity:.9}}><div style={{position:'absolute',inset:'14px 14px 14px 22px',border:'1px solid rgba(255,255,255,.28)',borderRadius:9}}/><div style={{position:'absolute',left:42,right:28,top:55,height:6,borderRadius:5,background:'rgba(255,255,255,.8)'}}/><div style={{position:'absolute',left:42,right:54,top:75,height:4,borderRadius:5,background:'rgba(255,255,255,.45)'}}/></div>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:mob?'repeat(3,1fr)':'repeat(3,minmax(0,1fr))',gap:10,marginBottom:18}}>
            {[['Projects',projects.length],['Books',projects.filter(project=>project.bookState==='complete').length],['Needs attention',projects.filter(project=>project.bookState==='needs_attention').length]].map(([label,value])=><div key={label} style={{padding:mob?'13px 11px':'16px 18px',borderRadius:15,border:'1px solid '+c.ln,background:c.cd}}><div style={{fontSize:mob?22:28,fontWeight:900,color:c.tx}}>{value}</div><div style={{fontSize:10,color:c.so,marginTop:3}}>{label}</div></div>)}
          </div>
          <div data-testid="book-dashboard-bonuses" style={{padding:mob?16:20,borderRadius:18,border:'1px solid '+c.ln,background:c.cd,marginBottom:18}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12}}><div><div style={{fontSize:10,fontWeight:900,color:c.ac,textTransform:'uppercase',letterSpacing:'.09em'}}>Your included bonuses</div><div style={{fontSize:11,color:c.so,marginTop:3}}>Open the training, checklist, templates, and fast-start blueprint.</div></div><button onClick={()=>selectBookSection('booster')} style={{border:0,background:'transparent',color:c.ac,fontSize:10,fontWeight:850,cursor:'pointer',whiteSpace:'nowrap'}}>View Library →</button></div>
            <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,minmax(0,1fr))':'repeat(4,minmax(0,1fr))',gap:10}}>{visibleBonusResources.map(resource=><button key={resource.id} onClick={()=>setLibraryReader(resource)} style={{padding:0,borderRadius:12,border:'1px solid '+c.ln,background:c.sf,color:c.tx,overflow:'hidden',textAlign:'left',cursor:'pointer'}}><img src={resource.coverUrl} alt={`${resource.title} cover`} style={{width:'100%',aspectRatio:'2 / 3',objectFit:'cover',display:'block'}}/><span style={{display:'block',padding:10}}><span style={{display:'block',fontSize:8,fontWeight:900,color:c.ac,textTransform:'uppercase'}}>{resource.type} · Included bonus</span><strong style={{display:'block',fontSize:10,lineHeight:1.35,marginTop:4}}>{resource.title}</strong><span style={{display:'block',fontSize:9,fontWeight:850,color:c.ac,marginTop:7}}>Read now →</span></span></button>)}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'minmax(0,1.5fr) minmax(280px,.75fr)',gap:14}}>
            <div style={{padding:18,borderRadius:18,border:'1px solid '+c.ln,background:c.cd}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:13}}><h3 style={{margin:0,fontSize:15,color:c.tx}}>Continue creating</h3><button onClick={()=>selectBookSection('books')} style={{border:0,background:'transparent',color:c.ac,fontSize:11,fontWeight:800,cursor:'pointer'}}>View all →</button></div>
              {projects.length===0?<button onClick={()=>selectBookSection('creator')} style={{width:'100%',padding:24,borderRadius:14,border:'1px dashed '+c.ln,background:c.sf,color:c.so,cursor:'pointer'}}><strong style={{display:'block',color:c.tx,marginBottom:5}}>Your first book starts here</strong><span style={{fontSize:11}}>Bloomie can choose the idea and build it for you.</span></button>:projects.slice(0,3).map(project=><button key={project.id} onClick={()=>{selectBookSection('books');loadProject(project);}} style={{width:'100%',display:'flex',alignItems:'center',gap:11,padding:'11px 0',border:0,borderTop:'1px solid '+c.ln,background:'transparent',color:c.tx,textAlign:'left',cursor:'pointer'}}><img src={project.coverUrl||'/assets/book-studio-stage-bestseller.png'} alt="" style={{width:38,height:51,borderRadius:7,objectFit:'cover',flexShrink:0,boxShadow:'0 5px 12px rgba(0,0,0,.22)'}}/><span style={{minWidth:0,flex:1}}><strong style={{display:'block',fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{String(project.title||'Untitled').replace(/^📚\s*/,'')}</strong><span style={{display:'block',fontSize:10,color:project.bookState==='complete'?c.gr:project.bookState==='needs_attention'?'#ef6464':c.ac,marginTop:3,fontWeight:750}}>{bookProjectStateLabel(project.bookState)}</span><span style={{display:'block',fontSize:9,color:c.fa,marginTop:2}}>Open production room</span></span><span style={{color:c.ac}}>→</span></button>)}
            </div>
            <div style={{padding:18,borderRadius:18,border:'1px solid '+c.ln,background:c.cd}}>
              <h3 style={{margin:'0 0 13px',fontSize:15,color:c.tx}}>What happens next</h3>
              {[['1','Bloomie shapes the idea'],['2','Chapters appear live'],['3','Cover and files arrive']].map(([number,label])=><div key={number} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><span style={{width:27,height:27,borderRadius:9,display:'grid',placeItems:'center',background:c.ac+'18',color:c.ac,fontSize:10,fontWeight:900}}>{number}</span><span style={{fontSize:11,color:c.so}}>{label}</span></div>)}
            </div>
          </div>
        </div>}
        {bookSection==='research'&&<div style={{maxWidth:760,padding:mob?18:24,borderRadius:18,border:'1px solid '+c.ln,background:c.cd}}>
          <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(4,1fr)',gap:7,marginBottom:16}}>
            {[['keyword','Keywords'],['product','Book concept'],['competitor','Positioning'],['category','Categories']].map(([key,label])=><button key={key} onClick={()=>setToolMode(key)} style={{padding:'9px 8px',borderRadius:9,border:'1px solid '+(toolMode===key?c.ac:c.ln),background:toolMode===key?'linear-gradient(135deg,rgba(244,162,97,.14),rgba(231,111,139,.14))':c.sf,color:toolMode===key?c.ac:c.so,fontSize:11,fontWeight:800,cursor:'pointer'}}>{label}</button>)}
          </div>
          <label style={{display:'block',fontSize:12,fontWeight:800,color:c.tx,marginBottom:7}}>Topic, audience, or book idea</label>
          <textarea value={toolBrief} onChange={e=>setToolBrief(e.target.value)} rows={6} placeholder="Describe the idea you want researched…" style={{...inputStyle,resize:'vertical',marginBottom:13}}/>
          <button onClick={()=>runBookTool('research')} disabled={!toolBrief.trim()||toolStatus==='working'} style={{width:'100%',padding:12,border:0,borderRadius:10,background:toolBrief.trim()?'linear-gradient(135deg,#F4A261,#E76F8B)':c.sf,color:toolBrief.trim()?'#fff':c.fa,fontWeight:850,cursor:'pointer'}}>{toolStatus==='working'?'Researching…':'Run research'}</button>
        </div>}
        {bookSection==='agent'&&<div style={{maxWidth:760,padding:mob?18:24,borderRadius:18,border:'1px solid '+c.ln,background:c.cd}}>
          <label style={{display:'block',fontSize:12,fontWeight:800,color:c.tx,marginBottom:7}}>Book project <span style={{color:c.fa,fontWeight:600}}>(optional)</span></label>
          <select value={toolProjectId} onChange={e=>setToolProjectId(e.target.value)} style={{...selectStyle,marginBottom:14}}><option value="">Start a new planning session</option>{projects.map(project=><option key={project.id} value={project.id}>{String(project.title||'Untitled').replace(/^📚\s*/,'')}</option>)}</select>
          <label style={{display:'block',fontSize:12,fontWeight:800,color:c.tx,marginBottom:7}}>What should your Book Agent do?</label>
          <textarea value={toolBrief} onChange={e=>setToolBrief(e.target.value)} rows={7} placeholder="Plan the book, improve the outline, rewrite a chapter, strengthen the voice…" style={{...inputStyle,resize:'vertical',marginBottom:13}}/>
          <button onClick={()=>runBookTool('agent')} disabled={!toolBrief.trim()||toolStatus==='working'} style={{width:'100%',padding:12,border:0,borderRadius:10,background:toolBrief.trim()?'linear-gradient(135deg,#F4A261,#E76F8B)':c.sf,color:toolBrief.trim()?'#fff':c.fa,fontWeight:850,cursor:'pointer'}}>{toolStatus==='working'?`${aFN} is working…`:`Send to ${aFN}`}</button>
        </div>}
        {['audio','pod','cover'].includes(bookSection)&&<div style={{maxWidth:760,padding:mob?18:24,borderRadius:18,border:'1px solid '+c.ln,background:c.cd}}>
          <label style={{display:'block',fontSize:12,fontWeight:800,color:c.tx,marginBottom:7}}>Source book project</label>
          <select value={toolProjectId} onChange={e=>setToolProjectId(e.target.value)} style={{...selectStyle,marginBottom:14}}><option value="">Select a completed book…</option>{projects.map(project=><option key={project.id} value={project.id}>{String(project.title||'Untitled').replace(/^📚\s*/,'')}</option>)}</select>
          {bookSection==='audio'&&<><label style={{display:'block',fontSize:12,fontWeight:800,color:c.tx,marginBottom:7}}>Narration direction</label><select value={audioVoice} onChange={e=>setAudioVoice(e.target.value)} style={{...selectStyle,marginBottom:14}}><option>Warm, natural, conversational</option><option>Confident and authoritative</option><option>Inspirational and uplifting</option><option>Calm and reflective</option></select></>}
          {bookSection==='pod'&&<><label style={{display:'block',fontSize:12,fontWeight:800,color:c.tx,marginBottom:7}}>Trim size</label><select value={trimSize} onChange={e=>setTrimSize(e.target.value)} style={{...selectStyle,marginBottom:14}}><option>6 × 9 inches</option><option>5.5 × 8.5 inches</option><option>8.5 × 11 inches</option></select></>}
          <label style={{display:'block',fontSize:12,fontWeight:800,color:c.tx,marginBottom:7}}>Additional direction <span style={{color:c.fa,fontWeight:600}}>(optional)</span></label>
          <textarea value={toolBrief} onChange={e=>setToolBrief(e.target.value)} rows={4} placeholder={bookSection==='cover'?'Describe the visual direction, mood, or imagery…':'Add any production notes…'} style={{...inputStyle,resize:'vertical',marginBottom:13}}/>
          <button onClick={()=>runBookTool(bookSection)} disabled={!toolProjectId||toolStatus==='working'} style={{width:'100%',padding:12,border:0,borderRadius:10,background:toolProjectId?'linear-gradient(135deg,#F4A261,#E76F8B)':c.sf,color:toolProjectId?'#fff':c.fa,fontWeight:850,cursor:toolProjectId?'pointer':'not-allowed'}}>{toolStatus==='working'?'Creating and verifying…':bookSection==='audio'?'Create audiobook package':bookSection==='pod'?'Create print package':'Generate cover'}</button>
        </div>}
        {['audiobooks','podbooks'].includes(bookSection)&&<div style={{display:'grid',gap:10,maxWidth:820}}>{projects.length?projects.map(project=><button key={project.id} onClick={()=>loadProject(project)} style={{padding:'15px 17px',borderRadius:13,border:'1px solid '+c.ln,background:c.cd,color:c.tx,textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><span><strong style={{display:'block',fontSize:13}}>{String(project.title||'Untitled').replace(/^📚\s*/,'')}</strong><span style={{fontSize:10,color:c.so}}>Open project files and deliverables</span></span><span style={{color:c.ac,fontWeight:850}}>Open →</span></button>):<div style={{padding:30,border:'1px dashed '+c.ln,borderRadius:14,color:c.so,textAlign:'center'}}>No book projects are available yet.</div>}</div>}
        {bookSection==='publish'&&<div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(2,minmax(0,1fr))',gap:11}}>
          {[['Amazon KDP','Kindle ebooks and paperback publishing','https://kdp.amazon.com/'],['Audible / ACX','Audiobook production and distribution','https://www.acx.com/'],['Barnes & Noble Press','Ebook and print publishing','https://press.barnesandnoble.com/'],['IngramSpark','Wide print distribution','https://www.ingramspark.com/'],['Draft2Digital','Wide ebook distribution','https://www.draft2digital.com/'],['PublishDrive','Multi-store publishing','https://publishdrive.com/']].map(([name,description,url])=><a key={name} href={url} target="_blank" rel="noreferrer" style={{padding:18,borderRadius:14,border:'1px solid '+c.ln,background:c.cd,color:c.tx,textDecoration:'none'}}><div style={{fontSize:14,fontWeight:820,marginBottom:6}}>{name}</div><div style={{fontSize:11,color:c.so}}>{description}</div><div style={{fontSize:11,fontWeight:850,color:c.ac,marginTop:12}}>Open publisher ↗</div></a>)}
        </div>}
        {toolMessage&&<div style={{maxWidth:760,marginTop:14,padding:'11px 13px',borderRadius:10,border:'1px solid '+(toolStatus==='failed'?'rgba(239,68,68,.35)':'rgba(34,197,94,.3)'),background:toolStatus==='failed'?'rgba(239,68,68,.08)':'rgba(34,197,94,.08)',color:toolStatus==='failed'?'#ef6464':c.gr,fontSize:12}}>{toolMessage}</div>}
      </div>
    </div>);
  }
  return bookShell(<div data-testid="book-workspace" style={{height:'100%',overflowY:'auto',padding:mob?'62px 14px 90px':'30px 36px 70px'}}>
    <div style={{maxWidth:980,margin:'0 auto'}}>
      <div style={{textAlign:'left',marginBottom:20}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:7,padding:'6px 12px',borderRadius:18,background:c.ac+'14',border:'1px solid '+c.ac+'35',color:c.ac,fontSize:11,fontWeight:750}}>✦ Bloomie Book Creator</div>
        <h1 style={{fontSize:mob?26:36,lineHeight:1.15,color:c.tx,margin:'14px 0 8px'}}>{view==='project'&&active?String(active.title||'').replace(/^📚\s*/,''):'Create a complete book'}</h1>
        <p style={{fontSize:13,color:c.so,maxWidth:650,margin:0,lineHeight:1.6}}>{view==='project'?'Watch the manuscript, cover, and publishing files come together in real time.':'Make a few simple choices—or let Bloomie decide—and watch the work come alive.'}</p>
      </div>
      {view==='project'&&<div data-testid="book-workflow-steps" style={{maxWidth:940,margin:'0 0 22px',display:'grid',gridTemplateColumns:mob?'repeat(5,minmax(112px,1fr))':'repeat(5,1fr)',gap:7,overflowX:mob?'auto':'visible',paddingBottom:mob?5:0}}>
        {[
          ['setup','1','Setup'],
          ['outline','2','Outline'],
          ['chapters','3','Chapters'],
          ['preview','4','Preview & Edit'],
          ['publish','5','Cover & Export'],
        ].map(([key,number,label])=><button key={key} onClick={()=>{setStage(key);if(active)setView('project');else setView('new');}} style={{minWidth:0,padding:'10px 8px',borderRadius:11,border:'1px solid '+(stage===key?c.ac:c.ln),background:stage===key?c.ac+'14':c.cd,color:stage===key?c.ac:c.so,cursor:'pointer',textAlign:'left'}}>
          <div style={{fontSize:9,fontWeight:850,opacity:.8}}>STEP {number}</div>
          <div style={{fontSize:11,fontWeight:800,marginTop:3,whiteSpace:'nowrap'}}>{label}</div>
        </button>)}
      </div>}

      {view==='new'&&stage==='setup'&&<div data-testid="guided-book-launch" style={{maxWidth:1050,margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'minmax(0,1.15fr) minmax(300px,.85fr)',gap:16,alignItems:'stretch'}}>
          <div style={{padding:mob?20:30,borderRadius:22,background:c.cd,border:'1px solid '+c.ln,boxShadow:'0 18px 55px rgba(0,0,0,.1)'}}>
            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:18}}>{[1,2,3,4].map(number=><span key={number} style={{height:5,flex:1,borderRadius:5,background:number<=setupStep?'linear-gradient(90deg,#F4A261,#E76F8B)':c.sf}}/>)}</div>
            {setupStep===1&&<>
              <div style={{fontSize:10,fontWeight:900,color:c.ac,letterSpacing:'.1em',marginBottom:8}}>START YOUR BOOK</div>
              <h2 style={{fontSize:mob?23:29,lineHeight:1.15,color:c.tx,margin:'0 0 8px'}}>How much do you want to decide?</h2>
              <p style={{fontSize:12,color:c.so,lineHeight:1.6,margin:'0 0 18px'}}>Choose how much help you want, then review the topic, title, description, and optional chapter plan before anything is generated.</p>
              <div style={{display:'grid',gap:10}}>
                {[
                  ['surprise','✦','Surprise me','Bloomie chooses the concept, title, reader promise, and structure.'],
                  ['topic','⌕','I have a topic','Give one keyword or simple idea. Bloomie handles the rest.'],
                  ['description','▤','I know what I want','Share a description when you already have a clear direction.'],
                  ['upload','⇧','Upload your own book','Import a manuscript you own or have permission to edit, then revise it page by page.'],
                ].map(([key,icon,label,description])=><button key={key} data-testid={`book-create-option-${key}`} aria-pressed={startMode===key} onClick={()=>{setStartMode(key);setMode(key==='description'?'description':'keyword');setSetupMessage('');}} style={{padding:'15px 16px',borderRadius:14,border:'1px solid '+(startMode===key?c.ac:c.ln),background:startMode===key?'linear-gradient(135deg,rgba(244,162,97,.13),rgba(231,111,139,.13))':c.sf,color:c.tx,textAlign:'left',cursor:'pointer',display:'flex',gap:13,alignItems:'center'}}>
                  <span style={{width:39,height:39,borderRadius:12,display:'grid',placeItems:'center',background:startMode===key?'linear-gradient(135deg,#F4A261,#E76F8B)':c.cd,color:startMode===key?'#fff':c.ac,fontSize:16,flexShrink:0}}>{icon}</span>
                  <span><strong style={{display:'block',fontSize:13,marginBottom:4}}>{label}</strong><span style={{display:'block',fontSize:10,lineHeight:1.45,color:c.so}}>{description}</span></span>
                </button>)}
              </div>
              {startMode==='upload'?<div data-testid="owned-book-upload" style={{marginTop:14,padding:15,borderRadius:14,background:c.sf,border:'1px solid '+c.ln}}>
                <label style={{display:'block',fontSize:10,fontWeight:800,color:c.so}}>Book title<input value={bookUpload.title} onChange={e=>setBookUpload({...bookUpload,title:e.target.value})} placeholder="Optional — the filename can be used" style={{...inputStyle,marginTop:6,marginBottom:10}}/></label>
                <label style={{display:'block',padding:'14px',borderRadius:11,border:'1px dashed '+(bookUpload.manuscript?c.ac:c.ln),background:c.cd,color:c.so,fontSize:10,fontWeight:800,cursor:'pointer',textAlign:'center'}}>Upload manuscript<input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={e=>setBookUpload({...bookUpload,manuscript:e.target.files?.[0]||null})} style={{display:'none'}}/><span style={{display:'block',marginTop:6,color:bookUpload.manuscript?c.ac:c.fa,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bookUpload.manuscript?.name||'PDF, DOCX, TXT, or Markdown'}</span></label>
                <label style={{display:'block',marginTop:9,padding:'12px',borderRadius:11,border:'1px dashed '+(bookUpload.cover?c.ac:c.ln),background:c.cd,color:c.so,fontSize:10,fontWeight:800,cursor:'pointer',textAlign:'center'}}>Optional existing cover<input type="file" accept="image/*" onChange={e=>setBookUpload({...bookUpload,cover:e.target.files?.[0]||null})} style={{display:'none'}}/><span style={{display:'block',marginTop:5,color:bookUpload.cover?c.ac:c.fa,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bookUpload.cover?.name||'JPG, PNG, or WEBP'}</span></label>
                <label style={{display:'flex',alignItems:'flex-start',gap:9,marginTop:12,padding:12,borderRadius:11,background:c.cd,border:'1px solid '+(bookUpload.rightsConfirmed?c.ac:c.ln),cursor:'pointer'}}><input type="checkbox" checked={bookUpload.rightsConfirmed} onChange={e=>setBookUpload({...bookUpload,rightsConfirmed:e.target.checked})} style={{marginTop:2,accentColor:c.ac}}/><span style={{fontSize:10,lineHeight:1.5,color:c.so}}>I confirm that I own this book or have permission from the copyright holder to upload and edit it.</span></label>
                <button onClick={()=>importOwnedBook()} disabled={!bookUpload.manuscript||!bookUpload.rightsConfirmed||bookUploadStatus==='working'} style={{width:'100%',marginTop:11,padding:12,border:0,borderRadius:10,background:bookUpload.manuscript&&bookUpload.rightsConfirmed?'linear-gradient(135deg,#F4A261,#E76F8B)':c.cd,color:bookUpload.manuscript&&bookUpload.rightsConfirmed?'#fff':c.fa,fontWeight:850,cursor:bookUpload.manuscript&&bookUpload.rightsConfirmed?'pointer':'not-allowed'}}>{bookUploadStatus==='working'?'Importing and preparing pages…':'Import as editable book'}</button>
                {bookUploadMessage&&<div role="status" style={{marginTop:9,fontSize:10,lineHeight:1.5,color:bookUploadStatus==='failed'?'#ef4444':c.gr}}>{bookUploadMessage}</div>}
              </div>:<>
              <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 1fr',gap:9,marginTop:14}}>
                <label style={{fontSize:10,fontWeight:800,color:c.so}}>Topic or keyword<input value={topic} onChange={e=>{setTopic(e.target.value);setSetupMessage('');}} placeholder={startMode==='surprise'?'Optional — Bloomie can choose':'e.g., confidence after a career change'} style={{...inputStyle,marginTop:6}}/></label>
                <label style={{fontSize:10,fontWeight:800,color:c.so}}>Working title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Optional — Bloomie can create it" style={{...inputStyle,marginTop:6}}/></label>
              </div>
              <label style={{display:'block',fontSize:10,fontWeight:800,color:c.so,marginTop:10}}>Book description<textarea value={bookDescription} onChange={e=>{setBookDescription(e.target.value);setSetupMessage('');}} rows={3} placeholder={startMode==='surprise'?'Optional — add anything Bloomie should include':'Describe the transformation, message, stories, or framework…'} style={{...inputStyle,resize:'vertical',marginTop:6}}/></label>
              <div style={{marginTop:12,padding:13,borderRadius:13,background:c.sf,border:'1px solid '+c.ln}}>
                <div style={{fontSize:10,fontWeight:850,color:c.tx,marginBottom:8}}>How should the chapters be planned?</div>
                <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 1fr',gap:8}}>
                  <button type="button" onClick={()=>setChapterPlanMode('auto')} style={{padding:'10px 11px',borderRadius:10,border:'1px solid '+(chapterPlanMode==='auto'?c.ac:c.ln),background:chapterPlanMode==='auto'?c.ac+'15':c.cd,color:chapterPlanMode==='auto'?c.ac:c.so,fontSize:10,fontWeight:800,cursor:'pointer'}}>Let Bloomie create the outline</button>
                  <button type="button" onClick={()=>setChapterPlanMode('custom')} style={{padding:'10px 11px',borderRadius:10,border:'1px solid '+(chapterPlanMode==='custom'?c.ac:c.ln),background:chapterPlanMode==='custom'?c.ac+'15':c.cd,color:chapterPlanMode==='custom'?c.ac:c.so,fontSize:10,fontWeight:800,cursor:'pointer'}}>I have chapter ideas</button>
                </div>
                {chapterPlanMode==='custom'&&<label style={{display:'block',fontSize:10,fontWeight:800,color:c.so,marginTop:10}}>Chapter outline or directions<textarea value={chapterPlan} onChange={e=>setChapterPlan(e.target.value)} rows={5} placeholder={"Paste a full outline, or describe what each chapter should cover.\nExample:\n1. Why starting over feels difficult\n2. Rebuilding confidence through small wins\n3. Creating a practical 90-day plan"} style={{...inputStyle,resize:'vertical',marginTop:6}}/></label>}
              </div>
              </>}
              {setupMessage&&<div role="alert" style={{marginTop:10,padding:'9px 11px',borderRadius:9,background:'rgba(244,162,97,.1)',border:'1px solid rgba(244,162,97,.28)',color:c.ac,fontSize:10,fontWeight:750}}>{setupMessage}</div>}
            </>}
            {setupStep===2&&<>
              <div style={{fontSize:10,fontWeight:900,color:c.ac,letterSpacing:'.1em',marginBottom:8}}>CHOOSE THE FEEL</div>
              <h2 style={{fontSize:mob?23:29,lineHeight:1.15,color:c.tx,margin:'0 0 8px'}}>Pick what feels closest.</h2>
              <p style={{fontSize:12,color:c.so,lineHeight:1.6,margin:'0 0 18px'}}>No publishing knowledge needed. Bloomie turns these choices into the complete creative brief.</p>
              <div style={{fontSize:11,fontWeight:850,color:c.tx,marginBottom:8}}>Book style</div>
              <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:18}}>{['Business / self-help','Memoir / personal story','Faith-based / devotional','Educational','Fiction / creative'].map(option=><button key={option} onClick={()=>setBookType(option)} style={{padding:'9px 11px',borderRadius:18,border:'1px solid '+(bookType===option?c.ac:c.ln),background:bookType===option?c.ac+'15':c.sf,color:bookType===option?c.ac:c.so,fontSize:10,fontWeight:750,cursor:'pointer'}}>{option.replace(' / ',' + ')}</button>)}</div>
              <div style={{fontSize:11,fontWeight:850,color:c.tx,marginBottom:8}}>Who should love it?</div>
              <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:18}}>{['General audience','Business owners','Parents and families','Faith community','Students and learners'].map(option=><button key={option} onClick={()=>setReader(option)} style={{padding:'9px 11px',borderRadius:18,border:'1px solid '+(reader===option?c.ac:c.ln),background:reader===option?c.ac+'15':c.sf,color:reader===option?c.ac:c.so,fontSize:10,fontWeight:750,cursor:'pointer'}}>{option}</button>)}</div>
              <div style={{fontSize:11,fontWeight:850,color:c.tx,marginBottom:8}}>How should it sound?</div>
              <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(2,1fr)',gap:8}}>{['Conversational and encouraging','Authoritative and practical','Inspirational and uplifting','Raw and personal'].map(option=><button key={option} onClick={()=>setVoice(option)} style={{padding:'11px',borderRadius:11,border:'1px solid '+(voice===option?c.ac:c.ln),background:voice===option?c.ac+'15':c.sf,color:voice===option?c.ac:c.so,fontSize:10,fontWeight:750,cursor:'pointer'}}>{option}</button>)}</div>
            </>}
            {setupStep===3&&<>
              <div style={{fontSize:10,fontWeight:900,color:c.ac,letterSpacing:'.1em',marginBottom:8}}>CHOOSE THE AUTHOR</div>
              <h2 style={{fontSize:mob?23:29,lineHeight:1.15,color:c.tx,margin:'0 0 8px'}}>Who is this book from?</h2>
              <p style={{fontSize:12,color:c.so,lineHeight:1.6,margin:'0 0 18px'}}>Use a saved author, your Bloomie, or add the author name and photo now. The photo becomes the source for the author profile and cover direction.</p>
              <label style={{display:'block',fontSize:10,fontWeight:800,color:c.so,marginBottom:6}}>Saved author</label>
              <select value={selectedAuthorId} onChange={e=>setSelectedAuthorId(e.target.value)} style={{...selectStyle,marginBottom:13}}><option value="">Use my Bloomie or add a new author below</option>{authors.map(author=><option key={author.id} value={author.id}>{author.name}</option>)}</select>
              {!selectedAuthorId&&<div style={{padding:14,borderRadius:13,background:c.sf,border:'1px solid '+c.ln}}>
                <label style={{display:'block',fontSize:10,fontWeight:800,color:c.so}}>Author name<input value={authorForm.name} onChange={e=>setAuthorForm({...authorForm,name:e.target.value})} placeholder={`Leave blank to use ${aFN}`} style={{...inputStyle,marginTop:6,marginBottom:10}}/></label>
                <label style={{display:'block',padding:'14px',borderRadius:11,border:'1px dashed '+(authorForm.headshot?c.ac:c.ln),background:c.cd,color:c.so,fontSize:10,fontWeight:800,cursor:'pointer',textAlign:'center'}}>Upload author picture<input type="file" accept="image/*" onChange={e=>setAuthorForm({...authorForm,headshot:e.target.files?.[0]||null})} style={{display:'none'}}/><span style={{display:'block',marginTop:6,color:authorForm.headshot?c.ac:c.fa,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{authorForm.headshot?.name||'JPG, PNG, or WEBP — optional when using your Bloomie'}</span></label>
              </div>}
            </>}
            {setupStep===4&&<>
              <div style={{fontSize:10,fontWeight:900,color:c.ac,letterSpacing:'.1em',marginBottom:8}}>READY TO BUILD</div>
              <h2 style={{fontSize:mob?23:29,lineHeight:1.15,color:c.tx,margin:'0 0 8px'}}>Bloomie has enough to begin.</h2>
              <p style={{fontSize:12,color:c.so,lineHeight:1.6,margin:'0 0 18px'}}>Review the simple choices below. The title, outline, chapters, cover, and files will be built and shown live.</p>
              <div style={{padding:16,borderRadius:14,background:c.sf,border:'1px solid '+c.ln,display:'grid',gap:11,marginBottom:14}}>
                {[['Topic',topic||'Bloomie will choose'],['Title',title||'Bloomie will create it'],['Description',bookDescription||'Bloomie will develop the reader transformation'],['Chapter plan',chapterPlanMode==='custom'&&chapterPlan.trim()?chapterPlan:'Bloomie will create the outline'],['Style',bookType],['Reader',reader],['Voice',voice],['Author',authors.find(author=>author.id===selectedAuthorId)?.name||authorForm.name||`Your ${aFN}`]].map(([label,value])=><div key={label} style={{display:'flex',justifyContent:'space-between',gap:14,fontSize:11}}><span style={{color:c.so}}>{label}</span><strong style={{color:c.tx,textAlign:'right',maxWidth:'68%',whiteSpace:'pre-wrap'}}>{value}</strong></div>)}
              </div>
              {authorForm.headshot&&<div style={{display:'flex',alignItems:'center',gap:9,padding:'9px 11px',borderRadius:10,background:c.sf,border:'1px solid '+c.ln,fontSize:10,color:c.so}}><span style={{width:30,height:30,borderRadius:9,background:c.ac+'20',display:'grid',placeItems:'center',color:c.ac,fontWeight:900}}>✓</span><span>Author picture ready: <strong style={{color:c.tx}}>{authorForm.headshot.name}</strong></span></div>}
            </>}
            <div style={{display:'flex',gap:9,marginTop:22}}>
              {setupStep>1&&<button onClick={()=>setSetupStep(step=>step-1)} style={{padding:'12px 16px',borderRadius:11,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:12,fontWeight:800,cursor:'pointer'}}>Back</button>}
              {setupStep<4&&startMode!=='upload'?<button onClick={()=>{if(setupStep===1&&startMode!=='surprise'&&!topic.trim()&&!bookDescription.trim()){setSetupMessage('Add a topic or book description, or choose Surprise me.');return;}setSetupMessage('');setSetupStep(step=>step+1);}} style={{flex:1,padding:'12px 16px',border:0,borderRadius:11,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:12,fontWeight:850,cursor:'pointer'}}>Continue →</button>:setupStep===4?<button onClick={startBook} disabled={authorStatus==='saving'} style={{flex:1,padding:'13px 16px',border:0,borderRadius:11,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:13,fontWeight:900,cursor:'pointer',boxShadow:'0 9px 24px rgba(231,111,139,.24)'}}>{authorStatus==='saving'?'Saving author…':'Build my book ✦'}</button>:null}
            </div>
          </div>
          <div style={{minHeight:mob?380:560,padding:mob?20:26,borderRadius:22,border:'1px solid rgba(231,111,139,.25)',background:'radial-gradient(circle at 50% 30%,rgba(231,111,139,.18),transparent 42%),'+c.sf,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center',overflow:'hidden',position:'relative'}}>
            <div style={{fontSize:9,fontWeight:900,letterSpacing:'.12em',color:c.ac,marginBottom:18}}>LIVE BOOK STAGE</div>
            <div style={{position:'relative',width:mob?210:250,height:mob?265:320,marginBottom:22,borderRadius:18,overflow:'hidden',boxShadow:'0 25px 55px rgba(0,0,0,.3)'}}>
              <img src="/assets/book-studio-stage-bestseller.png" alt="A bestseller-style hardcover book featuring a confident woman" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
              <div style={{position:'absolute',left:18,right:18,bottom:17,padding:'11px 12px',borderRadius:11,background:'rgba(17,18,24,.82)',backdropFilter:'blur(10px)',border:'1px solid rgba(255,255,255,.14)',color:'#fff'}}>
                <div style={{fontSize:8,fontWeight:850,letterSpacing:'.13em',opacity:.72}}>YOUR BOOK IN PRODUCTION</div>
                <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:16,lineHeight:1.2,fontWeight:700,marginTop:5}}>{title||'Your Next Book'}</div>
                <div style={{fontSize:8,opacity:.7,marginTop:4}}>{authors.find(author=>author.id===selectedAuthorId)?.name||aFN}</div>
              </div>
            </div>
            <strong style={{fontSize:14,color:c.tx}}>This becomes your live production room</strong>
            <span style={{fontSize:11,lineHeight:1.55,color:c.so,maxWidth:300,marginTop:7}}>Pages, chapters, word count, cover art, and finished downloads appear here as Bloomie creates them.</span>
          </div>
        </div>
      </div>}
      {view==='new'&&stage!=='setup'&&<div style={{maxWidth:760,margin:'0 auto',padding:mob?'34px 20px':'54px 36px',borderRadius:18,background:c.cd,border:'1px solid '+c.ln,textAlign:'center'}}>
        <div style={{width:54,height:54,borderRadius:16,display:'grid',placeItems:'center',margin:'0 auto 14px',background:c.ac+'12',color:c.ac,fontSize:24}}>{stage==='outline'?'☷':stage==='chapters'?'§':stage==='preview'?'▤':'↧'}</div>
        <h2 style={{fontSize:20,color:c.tx,marginBottom:8}}>{stage==='outline'?'Your outline will appear here':stage==='chapters'?'Your chapter workspace will appear here':stage==='preview'?'Your formatted book preview and editor will appear here':'Your cover and export files will appear here'}</h2>
        <p style={{fontSize:12,color:c.so,lineHeight:1.65,maxWidth:520,margin:'0 auto 18px'}}>{stage==='preview'?`After chapters are created, read the book page by page and leave revision instructions for ${aFN} directly beneath the selected chapter.`:'Start a new book or open one of your saved book projects to continue this stage.'}</p>
        <div style={{display:'flex',justifyContent:'center',gap:9,flexWrap:'wrap'}}><button onClick={()=>setStage('setup')} style={{padding:'10px 15px',borderRadius:9,border:0,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:12,fontWeight:800,cursor:'pointer'}}>Start a new book</button><button onClick={()=>{setView('saved');loadProjects();}} style={{padding:'10px 15px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:12,fontWeight:750,cursor:'pointer'}}>Open saved projects</button></div>
      </div>}

      {view==='saved'&&<div style={{maxWidth:840,margin:'0 auto'}}>
        <div style={{display:'flex',gap:7,overflowX:'auto',paddingBottom:4,marginBottom:14}}>
          {[['all','All'],['in_progress','Pending'],['needs_attention','Needs review'],['complete','Completed']].map(([key,label])=>{
            const count=key==='all'?projects.length:projects.filter(project=>project.bookState===key).length;
            return <button key={key} type="button" onClick={()=>setProjectFilter(key)} style={{padding:'9px 12px',borderRadius:18,border:'1px solid '+(projectFilter===key?c.ac:c.ln),background:projectFilter===key?c.ac+'18':c.cd,color:projectFilter===key?c.ac:c.so,fontSize:10,fontWeight:850,cursor:'pointer',whiteSpace:'nowrap'}}>{label} <span style={{opacity:.72}}>({count})</span></button>;
          })}
        </div>
        {projects.length===0?<div style={{padding:50,textAlign:'center',borderRadius:18,border:'1px solid '+c.ln,background:c.cd,color:c.so}}>No saved book projects yet.</div>:filteredProjects.length===0?<div style={{padding:42,textAlign:'center',borderRadius:18,border:'1px dashed '+c.ln,background:c.cd,color:c.so}}>No projects are currently in this status.</div>:<div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(2,minmax(0,1fr))',gap:14}}>{filteredProjects.map(project=><button key={project.id} onClick={()=>loadProject(project)} style={{padding:16,textAlign:'left',borderRadius:15,border:'1px solid '+c.ln,background:c.cd,color:c.tx,cursor:'pointer'}}><div style={{display:'flex',gap:13,alignItems:'center'}}><img src={project.coverUrl||'/assets/book-studio-stage-bestseller.png'} alt="" style={{width:62,height:84,borderRadius:8,objectFit:'cover',boxShadow:'0 8px 20px rgba(0,0,0,.24)',flexShrink:0}}/><div style={{minWidth:0,flex:1}}><div style={{fontSize:14,fontWeight:750,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{String(project.title||'').replace(/^📚\s*/,'')}</div><div style={{fontSize:10,fontWeight:800,color:project.bookState==='complete'?c.gr:project.bookState==='needs_attention'?'#ef6464':c.ac,marginTop:7}}>{bookProjectStateLabel(project.bookState)}</div><div style={{fontSize:10,color:c.so,marginTop:5}}>{new Date(project.updated_at||project.created_at).toLocaleDateString()}</div></div><span style={{color:c.ac,fontWeight:850}}>Open →</span></div></button>)}</div>}
      </div>}

      {view==='preview'&&<div data-testid="book-preview-empty-state" style={{width:'100%',maxWidth:1180,margin:'0 auto'}}>
        <div style={{border:'1px solid '+c.ln,borderRadius:18,overflow:'hidden',background:c.sf}}>
          <div style={{padding:'12px 15px',borderBottom:'1px solid '+c.ln,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}><div><div style={{fontSize:10,fontWeight:850,color:c.ac,textTransform:'uppercase',letterSpacing:'.08em'}}>Book reader and editor</div><div style={{fontSize:14,fontWeight:750,color:c.tx,marginTop:3}}>Your book preview will appear here</div></div><div style={{display:'flex',gap:6}}><button disabled style={{padding:'7px 9px',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,color:c.fa}}>← Previous</button><button disabled style={{padding:'7px 9px',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,color:c.fa}}>Next →</button></div></div>
          <div style={{width:'100%',maxWidth:1000,minHeight:mob?390:560,margin:'0 auto',padding:mob?'35px 24px':'58px clamp(60px,8vw,110px)',background:c.cd,color:c.tx,fontFamily:"Georgia,'Times New Roman',serif",boxSizing:'border-box',boxShadow:mob?'none':'0 8px 28px rgba(0,0,0,.09)'}}>
            <div style={{textAlign:'center',paddingTop:mob?70:115}}><div style={{fontSize:28,marginBottom:12,color:c.ac}}>▤</div><h2 style={{fontSize:20,margin:'0 0 9px'}}>No chapter selected yet</h2><p style={{fontFamily:'inherit',fontSize:14,lineHeight:1.7,color:c.so,maxWidth:470,margin:'0 auto'}}>Create a book or open a saved project. Each chapter will appear here in a page-style reader with Previous and Next controls.</p></div>
          </div>
          <div style={{padding:15,borderTop:'1px solid '+c.ln}}><label style={{display:'block',fontSize:11,fontWeight:800,color:c.tx,marginBottom:7}}>Ask your Bloomie to revise the selected chapter</label><textarea disabled rows={3} placeholder="Revision instructions activate when a chapter is available." style={{...inputStyle,resize:'none',opacity:.65}}/><button onClick={()=>{setView('new');setStage('setup');}} style={{marginTop:9,width:'100%',padding:11,border:0,borderRadius:10,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:12,fontWeight:800,cursor:'pointer'}}>Create a book to begin</button></div>
        </div>
      </div>}

      {view==='booster'&&<div data-testid="book-booster-library" style={{maxWidth:980,margin:'0 auto'}}>
        <div style={{padding:mob?20:28,borderRadius:18,background:c.cd,border:'1px solid '+c.ln}}>
          <div style={{display:'flex',alignItems:'center',gap:13,marginBottom:22}}><div style={{width:48,height:48,borderRadius:14,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff'}}><BookSuiteIcon name="resources" size={24}/></div><div><h2 style={{fontSize:20,color:c.tx,margin:0}}>Your Library</h2><p style={{fontSize:12,color:c.so,margin:'4px 0 0'}}>Read, edit with your Bloomie, or download your finished books and included bonuses.</p></div></div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:10}}><div><div style={{fontSize:10,fontWeight:900,color:c.ac,textTransform:'uppercase',letterSpacing:'.09em'}}>Quick-Launch bonuses</div><div style={{fontSize:11,color:c.so,marginTop:3}}>Your upsell resources remain included in this Library.</div></div>{boosterStatus==='active'&&<span style={{padding:'5px 8px',borderRadius:12,background:c.gr+'16',color:c.gr,fontSize:9,fontWeight:900}}>UPSELL INCLUDED</span>}</div>
          {boosterStatus==='loading'&&<div style={{padding:34,textAlign:'center',color:c.so}}>Checking your booster access…</div>}
          {boosterStatus==='locked'&&<div style={{padding:mob?18:24,borderRadius:14,background:c.sf,border:'1px solid '+c.ln,textAlign:'center'}}><h3 style={{color:c.tx,margin:'0 0 8px'}}>Unlock the Booster Library</h3><p style={{fontSize:12,lineHeight:1.6,color:c.so,margin:'0 auto 16px',maxWidth:530}}>Get the Kindle Cash Multiplier training, KDP checklist, book-description templates, and 30 Books in 30 Days blueprint.</p><button onClick={openBoosterCheckout} style={{padding:'12px 18px',border:0,borderRadius:10,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:13,fontWeight:800,cursor:'pointer'}}>Add Quick-Launch Booster — $9.95</button></div>}
          {boosterStatus==='error'&&<div style={{padding:18,borderRadius:12,background:'#ef444415',color:'#ef4444',fontSize:12}}>Booster access could not be verified. Please refresh and try again.</div>}
          {boosterStatus==='active'&&<div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,minmax(0,1fr))':'repeat(4,minmax(0,1fr))',gap:12}}>{boosterResources.map(resource=><div key={resource.id} data-testid={`library-card-${resource.id}`} style={{borderRadius:14,border:'1px solid '+c.ln,background:c.sf,overflow:'hidden'}}><img src={resource.coverUrl} alt={`${resource.title} cover`} style={{width:'100%',aspectRatio:'2 / 3',objectFit:'cover',display:'block'}}/><div style={{padding:11}}><div style={{fontSize:9,fontWeight:900,color:c.ac,textTransform:'uppercase'}}>{resource.type} · Bonus</div><div style={{fontSize:11,fontWeight:800,color:c.tx,lineHeight:1.35,minHeight:45,margin:'5px 0 9px'}}>{resource.title}</div><button onClick={()=>setLibraryReader(resource)} style={{width:'100%',padding:8,border:0,borderRadius:8,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:10,fontWeight:850,cursor:'pointer'}}>Read full book</button><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginTop:5}}><button onClick={()=>editLibraryBook(resource)} style={{padding:7,borderRadius:7,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:9,fontWeight:800,cursor:'pointer'}}>Edit</button><a href={resource.url} download style={{padding:7,borderRadius:7,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:9,fontWeight:800,textDecoration:'none',textAlign:'center'}}>Download</a></div></div></div>)}</div>}
          <div style={{fontSize:10,fontWeight:900,color:c.ac,textTransform:'uppercase',letterSpacing:'.09em',margin:'24px 0 9px'}}>Your books</div>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,minmax(0,1fr))',gap:12}}>{FINISHED_BOOK_LIBRARY.map(resource=><div key={resource.id} data-testid={`library-card-${resource.id}`} style={{borderRadius:14,border:'1px solid '+c.ln,background:c.sf,overflow:'hidden'}}><img src={resource.coverUrl} alt={`${resource.title} cover`} style={{width:'100%',aspectRatio:'2 / 3',objectFit:'cover',display:'block'}}/><div style={{padding:13}}><div style={{fontSize:9,fontWeight:900,color:c.gr,textTransform:'uppercase'}}>Finished book</div><div style={{fontSize:13,fontWeight:800,color:c.tx,lineHeight:1.35,margin:'5px 0 11px'}}>{resource.title}</div><button onClick={()=>setLibraryReader(resource)} style={{width:'100%',padding:9,border:0,borderRadius:8,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontWeight:850,cursor:'pointer'}}>Read full book</button><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:6}}><button onClick={()=>editLibraryBook(resource)} style={{padding:8,borderRadius:8,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:10,fontWeight:800,cursor:'pointer'}}>Edit</button><a href={resource.url} download style={{padding:8,borderRadius:8,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:10,fontWeight:800,textDecoration:'none',textAlign:'center'}}>Download</a></div></div></div>)}</div>
        </div>
      </div>}
      {libraryReader&&<LibraryBookReader resource={libraryReader} onClose={()=>setLibraryReader(null)} onEdit={editLibraryBook} mob={mob} c={c}/>}

      {view==='project'&&active&&<div style={{width:'100%',maxWidth:1180,margin:'0 auto'}}>
        <button onClick={()=>setView('saved')} style={{border:0,background:'transparent',color:c.ac,fontWeight:700,cursor:'pointer',marginBottom:12}}>← Saved books</button>
        <div style={{padding:mob?18:24,borderRadius:18,background:c.cd,border:'1px solid '+c.ln}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:18}}>
            <div style={{width:48,height:62,borderRadius:8,background:'linear-gradient(145deg,#F4A261,#E76F8B)',display:'grid',placeItems:'center',color:'#fff',fontWeight:900,fontSize:21}}>B</div>
            <div style={{flex:1,minWidth:0}}><h2 style={{fontSize:20,color:c.tx,marginBottom:5}}>{String(active.title||'').replace(/^📚\s*/,'')}</h2><div style={{fontSize:12,color:status==='failed'?'#ef4444':status==='complete'?c.gr:c.ac,fontWeight:700}}>{status==='working'?productionPhase:status==='complete'?'Book project complete':status==='failed'?'Generation needs attention':'Saved project'}</div></div>
          </div>
          <div data-testid="book-live-production-console" style={{marginBottom:18,borderRadius:17,border:'1px solid rgba(231,111,139,.28)',background:`linear-gradient(145deg,${c.cd},rgba(231,111,139,.045))`,overflow:'hidden'}}>
            <div style={{padding:mob?'14px':'16px 18px',borderBottom:'1px solid '+c.ln,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
              <div><div style={{fontSize:9,fontWeight:900,color:c.ac,letterSpacing:'.11em'}}>LIVE BOOK ASSEMBLY</div><div style={{fontSize:13,fontWeight:800,color:c.tx,marginTop:4}}>{status==='complete'?'Your book passed final verification':status==='failed'?'Production paused before the next file was saved':productionPhase}</div></div>
              <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 9px',borderRadius:18,background:status==='complete'?'rgba(34,197,94,.1)':'rgba(244,162,97,.1)',color:status==='complete'?c.gr:c.ac,fontSize:9,fontWeight:850}}><span style={{width:7,height:7,borderRadius:'50%',background:'currentColor',animation:status==='working'?'pulse 1.3s ease infinite':'none'}}/>{status==='complete'?'VERIFIED':status==='working'?'BUILDING':'READY'}</div>
            </div>
            <div style={{padding:mob?'13px':'15px 18px'}}>
              <div data-testid="book-generation-timing" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:11,padding:'9px 11px',borderRadius:10,background:c.sf,border:'1px solid '+c.ln,fontSize:10,color:c.so}}>
                <span><strong style={{color:c.tx}}>Elapsed {bookElapsed}</strong> · updates as each section is saved</span>
                <span style={{textAlign:'right'}}>Typical estimate <strong style={{color:c.ac}}>18–35 min</strong></span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(8,minmax(118px,1fr))',gap:7,overflowX:'auto',paddingBottom:6}}>
                {[
                  ['Brief',true,'Concept locked'],
                  ['Outline',bookProof.outline,bookProof.outline?'Structure saved':status==='working'?'Planning now':'Not saved yet'],
                  ['Front matter',bookProof.frontMatter,bookProof.frontMatter?'Sections saved':bookProof.outline&&status==='working'?'Creating now':'Waiting for outline'],
                  ['Body',bookProof.chapters.length>0,bookProof.chapters.length?`${bookProof.chapters.length} chapters`:bookProof.frontMatter&&status==='working'?'Writing now':'Waiting for front matter'],
                  ['Back matter',bookProof.backMatter,bookProof.backMatter?'Sections saved':bookProof.chapters.length&&status==='working'?'Creating now':'Waiting for body'],
                  ['Interior',!!bookProof.manuscript,bookProof.wordCount?`${bookProof.wordCount.toLocaleString()} body words`:bookProof.backMatter&&status==='working'?'Assembling now':'Waiting for sections'],
                  ['Cover',bookProof.cover,bookProof.cover?'Artwork saved':bookProof.manuscript&&status==='working'?'Creating now':'Waiting for interior'],
                  ['KDP files',bookProof.docx&&bookProof.printPdf&&bookProof.kdpChecklist,bookProof.docx&&bookProof.printPdf&&bookProof.kdpChecklist?'Uploads ready':bookProof.cover&&status==='working'?'Validating now':'Waiting for cover'],
                ].map(([label,done,detail],index)=>{
                  const prior=[true,bookProof.outline,bookProof.frontMatter,bookProof.chapters.length>0,bookProof.backMatter,!!bookProof.manuscript,bookProof.cover];
                  const activeStep=!done&&(index===0||prior[index-1])&&status==='working';
                  return <div key={label} data-book-step-state={done?'saved':activeStep?'generating':'waiting'} style={{padding:'10px 9px',borderRadius:10,border:'1px solid '+(done?'rgba(34,197,94,.25)':activeStep?'rgba(231,111,139,.34)':c.ln),background:done?'rgba(34,197,94,.06)':activeStep?'linear-gradient(135deg,rgba(244,162,97,.1),rgba(231,111,139,.1))':c.sf,transform:activeStep?'translateY(-3px)':'none',boxShadow:activeStep?'0 8px 24px rgba(231,111,139,.18)':'none',transition:'transform .35s ease, box-shadow .35s ease, background .35s ease'}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}><span style={{width:18,height:18,borderRadius:6,display:'grid',placeItems:'center',background:done?c.gr:activeStep?'linear-gradient(135deg,#F4A261,#E76F8B)':c.cd,color:done||activeStep?'#fff':c.fa,fontSize:9,fontWeight:900}}>{done?'✓':index+1}</span><span style={{fontSize:10,fontWeight:850,color:done?c.gr:activeStep?c.tx:c.so}}>{label}</span></div>
                    <div style={{fontSize:9,color:c.fa,lineHeight:1.35}}>{detail}</div>
                  </div>;
                })}
              </div>
              <div data-testid="book-production-theater" style={{marginTop:14,display:'grid',gridTemplateColumns:mob?'1fr':'220px minmax(0,1fr)',gap:12,alignItems:'stretch'}}>
                <div style={{position:'relative',minHeight:mob?240:290,borderRadius:14,overflow:'hidden',background:'#11131a',border:'1px solid '+c.ln}}>
                  <img src={coverPreviewUrl} alt={bookProof.cover?'Generated book cover':'Book cover being created'} style={{width:'100%',height:'100%',objectFit:'cover',display:'block',opacity:bookProof.cover?1:.72,transition:'opacity .4s ease'}}/>
                  <div style={{position:'absolute',inset:'auto 10px 10px',padding:'9px 10px',borderRadius:10,background:'rgba(12,13,18,.82)',backdropFilter:'blur(9px)',border:'1px solid rgba(255,255,255,.12)'}}>
                    <div style={{fontSize:8,fontWeight:900,letterSpacing:'.1em',color:bookProof.cover?c.gr:c.ac}}>{bookProof.cover?'COVER READY':bookProof.manuscript&&status==='working'?'COVER IN PROGRESS':'COVER PREVIEW'}</div>
                    <div style={{fontSize:10,color:'#fff',marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{String(active.title||'Your book').replace(/^📚\s*/,'')}</div>
                  </div>
                </div>
                <div style={{minHeight:mob?310:290,borderRadius:14,background:`linear-gradient(145deg,${c.sf},${c.cd})`,color:c.tx,padding:mob?'20px 18px':'25px 30px',boxShadow:'inset 0 0 0 1px '+c.ln,overflow:'hidden',position:'relative'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,paddingBottom:11,borderBottom:'1px solid '+c.ln,marginBottom:15}}>
                    <div><div style={{fontSize:8,fontWeight:900,letterSpacing:'.12em',color:c.ac}}>{previewPhase==='section'?'LIVE BOOK SECTION':previewPhase==='outline'?'OUTLINE PREVIEW':'PLANNING STAGE'}</div><div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:16,fontWeight:700,marginTop:4}}>{activeSection?String(activeSection.name||'').replace(/\.(md|txt)$/i,'').replace(/[-_]/g,' '):bookProof.outline?'Outline saved':'Building the outline'}</div></div>
                    <div style={{fontSize:9,color:c.so,textAlign:'right'}}>{bookProof.sections.length}<br/>{bookProof.sections.length===1?'section':'sections'} saved</div>
                  </div>
                  <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:mob?12:13,lineHeight:1.72,color:c.so,maxHeight:mob?210:180,overflow:'hidden',whiteSpace:'pre-wrap'}}>
                    {activeSection?.content?.slice(0,1250)||outlineArtifact?.content?.slice(0,1250)||(status==='failed'?`Generation paused before ${aFN} saved the next section. Resume or retry the task; each completed book section will appear here in reading order.`:`${aFN} is organizing the topic, reader promise, and section journey. The outline will appear first, followed by the title page, copyright, table of contents, preface, introduction, chapters, and back matter as each file is saved.`)}
                  </div>
                  <div style={{position:'absolute',left:0,right:0,bottom:0,height:55,background:`linear-gradient(transparent,${c.cd})`}}/>
                </div>
              </div>
              {status==='working'&&<div style={{marginTop:12,padding:'10px 11px',borderRadius:10,background:c.sf,border:'1px solid '+c.ln,fontSize:11,lineHeight:1.5,color:c.so}}><LiveProgressNarration c={c} sessionId={active.id}/></div>}
              <div style={{marginTop:8}}><ActiveTaskTracker c={c} sessionId={active.id}/></div>
            </div>
          </div>
          <div style={{padding:14,borderRadius:12,background:c.sf,border:'1px solid '+c.ln,marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,fontSize:12,color:c.so,marginBottom:8}}><span>Measured manuscript</span><strong style={{color:bookProof.wordCount>=10000?c.gr:c.tx}}>{bookProof.wordCount.toLocaleString()} / 10,000 words</strong></div>
            <div style={{height:7,borderRadius:8,overflow:'hidden',background:c.cd}}><div style={{width:`${Math.min(100,(bookProof.wordCount/10000)*100)}%`,height:'100%',background:'linear-gradient(90deg,#F4A261,#E76F8B)',transition:'width .35s ease'}}/></div>
            <div style={{fontSize:10,color:c.fa,marginTop:8}}>{bookProof.chapters.length} chapter file{bookProof.chapters.length===1?'':'s'} saved · Completion is locked until the saved body chapters pass 10,000 words and the KDP interior package is verified.</div>
          </div>
          {error&&<div style={{padding:12,borderRadius:10,background:'#ef444415',color:'#ef4444',fontSize:12,marginBottom:14}}>{error}</div>}
          {stage==='setup'&&<div data-testid="book-project-setup-stage" style={{marginBottom:18,display:'grid',gridTemplateColumns:mob?'1fr':'minmax(0,1.2fr) minmax(260px,.8fr)',gap:12}}>
            <div style={{padding:mob?18:24,borderRadius:14,border:'1px solid '+c.ln,background:c.sf}}><div style={{fontSize:9,fontWeight:900,color:c.ac,textTransform:'uppercase',letterSpacing:'.09em'}}>Project setup</div><h3 style={{fontSize:18,color:c.tx,margin:'8px 0 7px'}}>{String(active.title||'Untitled book').replace(/^📚\s*/,'')}</h3><p style={{fontSize:12,lineHeight:1.65,color:c.so,margin:'0 0 16px'}}>This project is connected to {aFN}. Use the steps above to review the plan, edit sections, preview the complete book, and export the publishing package.</p><button onClick={()=>setStage('outline')} style={{padding:'10px 14px',border:0,borderRadius:9,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontWeight:850,cursor:'pointer'}}>Continue to outline →</button></div>
            <div style={{padding:18,borderRadius:14,border:'1px solid '+c.ln,background:c.sf,display:'grid',gap:9}}>{[['Status',bookProjectStateLabel(active.bookState||deriveBookProjectState(active,artifacts,history))],['Saved sections',bookProof.sections.length],['Body words',bookProof.wordCount.toLocaleString()],['Cover',bookProof.cover?'Ready':'In progress']].map(([label,value])=><div key={label} style={{display:'flex',justifyContent:'space-between',gap:12,paddingBottom:8,borderBottom:'1px solid '+c.ln,fontSize:11}}><span style={{color:c.so}}>{label}</span><strong style={{color:c.tx}}>{value}</strong></div>)}</div>
          </div>}
          {stage==='outline'&&<div style={{marginBottom:18,padding:mob?18:26,borderRadius:14,border:'1px solid '+c.ln,background:c.sf,minHeight:260}}>{outlineArtifact?<ReactMarkdown remarkPlugins={[remarkGfm]}>{outlineArtifact.content||''}</ReactMarkdown>:<div style={{textAlign:'center',paddingTop:55,color:c.so}}><div style={{fontSize:22,marginBottom:9}}>☷</div><strong style={{color:c.tx}}>Building the outline</strong><div style={{fontSize:11,marginTop:6}}>The table of contents and chapter plan will appear here as soon as {aFN} saves it.</div></div>}</div>}
          {stage==='chapters'&&<div style={{marginBottom:18}}><div style={{fontSize:12,fontWeight:750,color:c.so,marginBottom:8}}>Book sections</div>{bookProof.sections.length>0?<div style={{display:'grid',gap:8}}>{bookProof.sections.map((file,index)=><button key={file.fileId} onClick={()=>{setChapterIndex(index);setPageIndex(0);setReaderEdge('content');setStage('preview');}} style={{padding:'12px',borderRadius:10,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:12,fontWeight:650,display:'flex',justifyContent:'space-between',gap:8,cursor:'pointer',textAlign:'left'}}><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span><span style={{color:c.so}}>{countBookWords(file.content).toLocaleString()} words →</span></button>)}</div>:<div style={{padding:38,textAlign:'center',borderRadius:12,border:'1px dashed '+c.ln,color:c.so}}>Title page, copyright, contents, preface, introduction, chapters, and closing sections will appear here in reading order.</div>}</div>}
          {stage==='preview'&&activeSection&&<div data-testid="book-reader-preview" role="dialog" aria-modal="true" style={{position:'fixed',zIndex:1250,left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:mob?'calc(100vw - 18px)':'min(1120px,calc(100vw - 48px))',height:mob?'calc(100dvh - 18px)':'min(860px,calc(100vh - 48px))',border:'1px solid '+c.ln,borderRadius:16,overflowY:'auto',overflowX:'hidden',background:c.sf,boxShadow:'0 30px 100px rgba(0,0,0,.62)'}}>
            <div style={{padding:'11px 13px',borderBottom:'1px solid '+c.ln,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
              <div><div style={{fontSize:10,fontWeight:800,color:c.ac,textTransform:'uppercase',letterSpacing:'.08em'}}>Book preview</div><div style={{fontSize:13,fontWeight:750,color:c.tx,marginTop:3}}>{activeSection.name}</div></div>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <button onClick={()=>{setChapterIndex(i=>Math.max(0,i-1));setPageIndex(0);}} disabled={chapterIndex===0||directEditing} style={{padding:'7px 10px',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,color:c.tx,cursor:chapterIndex===0||directEditing?'not-allowed':'pointer',opacity:(chapterIndex===0||directEditing)?0.45:1}}>← Previous</button>
                <span style={{fontSize:11,color:c.so}}>Section {chapterIndex+1} of {bookProof.sections.length}</span>
                <button onClick={()=>{setChapterIndex(i=>Math.min(bookProof.sections.length-1,i+1));setPageIndex(0);}} disabled={chapterIndex>=bookProof.sections.length-1||directEditing} style={{padding:'7px 10px',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,color:c.tx,cursor:chapterIndex>=bookProof.sections.length-1||directEditing?'not-allowed':'pointer',opacity:(chapterIndex>=bookProof.sections.length-1||directEditing)?0.45:1}}>Next →</button>
                <button onClick={()=>{setPageSelection(null);setDirectEditing(false);setStage('chapters');}} aria-label="Close book preview" style={{width:34,height:34,borderRadius:9,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:18,cursor:'pointer'}}>×</button>
              </div>
            </div>
            {directEditing?<div style={{width:'100%',maxWidth:1000,margin:'0 auto',padding:mob?'18px':'24px',boxSizing:'border-box',background:c.cd}}>
              <textarea data-testid="book-direct-section-editor" value={sectionDraft} onChange={e=>setSectionDraft(e.target.value)} style={{width:'100%',minHeight:mob?390:610,boxSizing:'border-box',padding:mob?'20px 17px':'34px 42px',borderRadius:12,border:'1px solid '+c.ac,background:c.sf,color:c.tx,fontFamily:"Georgia,'Times New Roman',serif",fontSize:mob?15:17,lineHeight:1.8,resize:'vertical',outline:'none'}}/>
              <div style={{display:'flex',gap:9,justifyContent:'flex-end',marginTop:11}}>
                <button onClick={()=>{setDirectEditing(false);setSectionDraft(activeSection.content||'');}} disabled={savingSection} style={{padding:'9px 14px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontWeight:750,cursor:'pointer'}}>Cancel</button>
                <button onClick={saveSectionDirectly} disabled={savingSection||!sectionDraft.trim()} style={{padding:'9px 16px',border:0,borderRadius:9,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontWeight:850,cursor:savingSection?'wait':'pointer'}}>{savingSection?'Saving…':'Save section'}</button>
              </div>
            </div>:<div data-testid="book-page-turner" style={{padding:mob?'12px':'24px',background:c.cd}}>
              <style>{`
                .kdp-book-page h1,.kdp-book-page h2,.kdp-book-page h3{font-family:Georgia,'Times New Roman',serif;color:#1f1c18}
                .kdp-book-page h1{font-size:1.55em;line-height:1.2;margin:0 0 1.5em;text-align:center;font-weight:700}
                .kdp-book-page h2{font-size:1.25em;line-height:1.25;margin:1.4em 0 .7em}
                .kdp-book-page p{margin:0 0 .72em;text-indent:1.25em}
                .kdp-book-page h1+p,.kdp-book-page h2+p,.kdp-book-page h3+p,.kdp-book-page blockquote+p{ text-indent:0 }
                .kdp-book-page ul,.kdp-book-page ol{margin:.7em 0 1em;padding-left:1.4em}
                .kdp-book-page li{margin:.35em 0}
                .kdp-title-page{display:flex;align-items:center;justify-content:center;text-align:center}
                .kdp-title-page h1{font-size:1.9em;line-height:1.25;margin:0;max-width:88%}
                .kdp-copyright-page{display:flex;align-items:flex-end}
                .kdp-copyright-page h1{font-size:1em;text-align:left;margin:0 0 .8em}
                .kdp-copyright-page p{text-indent:0;font-size:.86em}
                .kdp-toc-page h1{text-align:center;margin-bottom:1.35em}
                .kdp-toc-page ul{list-style:none;padding:0;margin:0}
                .kdp-toc-page li{margin:0 0 .68em;padding-bottom:.32em;border-bottom:1px dotted rgba(38,35,31,.22);line-height:1.35}
                .kdp-chapter-page h1{margin-top:8%;margin-bottom:2em}
                .kdp-book-shell{position:relative;filter:drop-shadow(0 22px 22px rgba(0,0,0,.24))}
                .kdp-book-shell:before,.kdp-book-shell:after{content:"";position:absolute;inset:5px -5px -5px 5px;border-radius:12px;background:repeating-linear-gradient(0deg,#d7d0c4 0,#d7d0c4 1px,#fffdf8 1px,#fffdf8 3px);border:1px solid rgba(73,59,40,.18)}
                .kdp-book-shell:before{transform:translate(5px,5px);opacity:.72}
                .kdp-book-shell:after{transform:translate(2px,2px);opacity:.9}
                .kdp-page-cell{position:relative;z-index:2;isolation:isolate}
                .kdp-page-under{position:absolute;inset:0;z-index:0;overflow:hidden;background:#fffdf8;border:1px solid rgba(83,68,47,.18);padding:9% 8% 6%}
                .kdp-page-leaf{position:relative;z-index:2}
                .kdp-page-leaf:after{content:"";pointer-events:none;position:absolute;inset:0;opacity:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.5) 38%,rgba(32,25,18,.25) 52%,transparent 72%);background-size:220% 100%}
                @keyframes kdpTurnForward{0%{transform:rotateY(0deg) skewY(0);border-radius:0 12px 12px 0}34%{transform:rotateY(-54deg) skewY(-1.4deg);filter:brightness(.94);box-shadow:-24px 12px 36px rgba(0,0,0,.34)}64%{transform:rotateY(-122deg) skewY(1.2deg);filter:brightness(.78);box-shadow:-42px 12px 48px rgba(0,0,0,.32)}100%{transform:rotateY(-179deg);filter:brightness(.68);box-shadow:-50px 10px 54px rgba(0,0,0,.18)}}
                @keyframes kdpTurnBack{0%{transform:rotateY(0deg) skewY(0);border-radius:12px 0 0 12px}34%{transform:rotateY(54deg) skewY(1.4deg);filter:brightness(.94);box-shadow:24px 12px 36px rgba(0,0,0,.34)}64%{transform:rotateY(122deg) skewY(-1.2deg);filter:brightness(.78);box-shadow:42px 12px 48px rgba(0,0,0,.32)}100%{transform:rotateY(179deg);filter:brightness(.68);box-shadow:50px 10px 54px rgba(0,0,0,.18)}}
                @keyframes kdpCurlLight{0%{opacity:0;background-position:180% 0}28%{opacity:.8}72%{opacity:.52}100%{opacity:0;background-position:-80% 0}}
                .kdp-page-turn-forward{transform-origin:left center;animation:kdpTurnForward .72s cubic-bezier(.55,.05,.42,.98) forwards;z-index:5}
                .kdp-page-turn-back{transform-origin:right center;animation:kdpTurnBack .72s cubic-bezier(.55,.05,.42,.98) forwards;z-index:5}
                .kdp-page-turn-forward:after,.kdp-page-turn-back:after{animation:kdpCurlLight .72s ease forwards}
                .bloom-real-book{margin:0 auto!important;filter:drop-shadow(0 22px 26px rgba(0,0,0,.3));overflow:hidden!important;clip-path:inset(0 round 3px);contain:paint}
                .bloom-flip-page{position:relative;box-sizing:border-box;width:100%;height:100%;overflow:hidden;padding:9% 8% 6%;background:#fffdf8;color:#26231f;border:1px solid rgba(83,68,47,.2);font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.58;user-select:text!important;-webkit-user-select:text!important}
                .bloom-flip-page:before{content:"";position:absolute;top:0;bottom:0;width:18px;right:0;background:linear-gradient(90deg,transparent,rgba(45,35,25,.1));pointer-events:none}
                .bloom-flip-cover{padding:0;background:#15110f}
                .bloom-wrap-cover{width:100%;height:100%;background-repeat:no-repeat;background-size:200% 100%}
                .bloom-cover-image{display:block;width:100%;height:100%;object-fit:cover}
                .bloom-back-cover{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:14%;box-sizing:border-box;background:linear-gradient(155deg,#251f1d,#090807);color:#f8efe8;text-align:center}
                .bloom-back-cover strong{font-size:19px}.bloom-back-cover p{font-size:12px;line-height:1.65;opacity:.76;margin-top:13px}
                .bloom-page-number{position:absolute;left:0;right:0;bottom:4%;text-align:center;font-size:10px;color:#8b8277}
                .bloom-cover-edit{position:absolute;right:12px;bottom:12px;z-index:8;padding:8px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.45);background:rgba(15,12,10,.78);backdrop-filter:blur(8px);color:#fff;font-size:10px;font-weight:850;cursor:pointer}
                .stf__parent{margin:0 auto;overflow:hidden!important;clip-path:inset(0 round 3px);contain:paint}
                .stf__block{background:transparent!important}
              `}</style>
              <img src={coverPreviewUrl} alt="" onLoad={e=>setCoverIsWrap(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight>1.15)} style={{display:'none'}}/>
              <div data-testid="real-book-page-flip" style={{width:'100%',maxWidth:mob?344:840,height:mob?500:640,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',padding:mob?'10px 0':'20px',boxSizing:'border-box'}}>
                <HTMLFlipBook
                  key={`${active.id}-${readerPages.length}-${coverArtifact?.fileId||coverArtifact?.name||'no-cover'}`}
                  ref={flipBookRef}
                  className="bloom-real-book"
                  style={{}}
                  width={mob?320:400}
                  height={mob?480:600}
                  size="fixed"
                  drawShadow
                  flippingTime={1050}
                  usePortrait={mob}
                  startZIndex={10}
                  autoSize={false}
                  maxShadowOpacity={0.65}
                  showCover
                  mobileScrollSupport
                  swipeDistance={20}
                  clickEventForward
                  useMouseEvents
                  onFlip={handleReaderFlip}
                >
                  {readerPages.map(page=><BookFlipPage key={page.key} page={page} coverUrl={coverPreviewUrl} coverIsWrap={coverIsWrap} bookDescription={bookDescription} onEditCover={()=>setStage('publish')} onSelectText={capturePageSelection}/>)}
                </HTMLFlipBook>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginTop:16,flexWrap:'wrap'}}>
                <button aria-label="Turn to previous page" onClick={()=>flipBookRef.current?.pageFlip()?.flipPrev('bottom')} disabled={readerPageNumber<=0} style={{padding:'9px 14px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:readerPageNumber<=0?'not-allowed':'pointer',opacity:readerPageNumber<=0?0.45:1}}>← Turn back</button>
                <span style={{minWidth:170,textAlign:'center',fontSize:11,color:c.so}}>{readerPages[readerPageNumber]?.kind==='front'?'Front cover':readerPages[readerPageNumber]?.kind==='back'?'Back cover':`Page${!mob&&readerPages[readerPageNumber+1]?.kind==='content'?'s':''} ${readerPages[readerPageNumber]?.displayNumber||1}${!mob&&readerPages[readerPageNumber+1]?.kind==='content'?`–${readerPages[readerPageNumber+1].displayNumber}`:''} of ${totalBookPages}`}</span>
                <button aria-label="Turn to next page" onClick={()=>flipBookRef.current?.pageFlip()?.flipNext('bottom')} disabled={readerPageNumber>=readerPages.length-1} style={{padding:'9px 14px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:readerPageNumber>=readerPages.length-1?'not-allowed':'pointer',opacity:readerPageNumber>=readerPages.length-1?0.45:1}}>Turn page →</button>
              </div>
              {pageSelection&&<div data-testid="book-selection-editor" style={{position:'fixed',zIndex:12000,left:mob?12:Math.min(window.innerWidth-390,Math.max(12,pageSelection.x-170)),right:mob?12:'auto',top:mob?'auto':Math.min(window.innerHeight-250,Math.max(12,pageSelection.y+12)),bottom:mob?12:'auto',boxSizing:'border-box',width:mob?'auto':370,padding:12,borderRadius:14,border:'1px solid '+c.ln,background:c.cd,boxShadow:'0 18px 55px rgba(0,0,0,.38)',color:c.tx}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:9}}><div><div style={{fontSize:10,fontWeight:900,color:c.ac,textTransform:'uppercase',letterSpacing:'.08em'}}>Selected passage</div><div style={{fontSize:10,color:c.so,marginTop:2}}>Change only the highlighted words</div></div><button onClick={()=>setPageSelection(null)} style={{width:28,height:28,borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.so,cursor:'pointer'}}>×</button></div>
                <div style={{maxHeight:58,overflow:'hidden',padding:'8px 9px',borderRadius:8,background:c.sf,color:c.so,fontSize:10,lineHeight:1.45,marginBottom:9}}>{pageSelection.text}</div>
                {selectionEditing?<><textarea value={selectionDraft} onChange={e=>setSelectionDraft(e.target.value)} rows={5} style={{...inputStyle,resize:'vertical',marginBottom:8}}/><div style={{display:'flex',gap:7}}><button onClick={()=>setSelectionEditing(false)} style={{flex:1,padding:9,borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer'}}>Cancel</button><button onClick={saveSelectedText} disabled={selectionWorking||!selectionDraft.trim()} style={{flex:1,padding:9,border:0,borderRadius:8,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontWeight:850,cursor:'pointer'}}>{selectionWorking?'Saving…':'Save change'}</button></div></>:<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
                  <button onClick={()=>setSelectionEditing(true)} style={{padding:9,borderRadius:8,border:'1px solid '+c.ac,background:c.ac+'12',color:c.ac,fontWeight:800,cursor:'pointer'}}>Edit manually</button>
                  <button onClick={()=>requestSelectedTextChange('rewrite')} disabled={selectionWorking} style={{padding:9,borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer'}}>Rewrite</button>
                  <button onClick={()=>requestSelectedTextChange('expand')} disabled={selectionWorking} style={{padding:9,borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer'}}>Expand</button>
                  <button onClick={()=>requestSelectedTextChange('shorten')} disabled={selectionWorking} style={{padding:9,borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer'}}>Shorten</button>
                  <button onClick={()=>requestSelectedTextChange('tone')} disabled={selectionWorking} style={{padding:9,borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer'}}>Change tone</button>
                  <button onClick={()=>requestSelectedTextChange('image')} disabled={selectionWorking} style={{padding:9,borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer'}}>Add image</button>
                </div>}
              </div>}
              {false&&<div style={{display:'none'}}>
              <img src={coverPreviewUrl} alt="" onLoad={e=>setCoverIsWrap(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight>1.15)} style={{display:'none'}}/>
              {readerEdge!=='content'&&coverArtifact?<div className="kdp-book-shell" style={{width:'100%',maxWidth:mob?330:390,margin:'0 auto',aspectRatio:'2 / 3',perspective:1700}}>
                <div className={pageTurnAnimating?`kdp-page-leaf kdp-page-turn-${pageTurnDirection}`:'kdp-page-leaf'} style={{position:'absolute',inset:0,borderRadius:readerEdge==='front'?'5px 13px 13px 5px':'13px 5px 5px 13px',overflow:'hidden',background:readerEdge==='back'&&!coverIsWrap?'#211c1a':'#fff',boxShadow:'inset 0 0 0 1px rgba(255,255,255,.14),0 18px 46px rgba(0,0,0,.3)',backfaceVisibility:'hidden',transformStyle:'preserve-3d'}}>
                  {coverIsWrap?<div style={{width:'100%',height:'100%',backgroundImage:`url("${coverPreviewUrl}")`,backgroundRepeat:'no-repeat',backgroundSize:'200% 100%',backgroundPosition:readerEdge==='front'?'right center':'left center'}}/>:readerEdge==='front'?<img src={coverPreviewUrl} alt="Front cover" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:'14%',boxSizing:'border-box',background:'linear-gradient(155deg,#251f1d,#090807)',color:'#f8efe8',textAlign:'center',fontFamily:"Georgia,'Times New Roman',serif"}}><div><div style={{fontSize:mob?16:19,fontWeight:800,lineHeight:1.35}}>Back cover</div><p style={{fontSize:mob?11:12,lineHeight:1.65,opacity:.76,marginTop:13}}>{bookDescription||'The finished back-cover artwork and description will appear here when a full print wrap is uploaded or generated.'}</p></div></div>}
                </div>
                <button onClick={()=>setStage('publish')} style={{position:'absolute',right:12,bottom:12,zIndex:8,padding:'8px 11px',borderRadius:9,border:'1px solid rgba(255,255,255,.45)',background:'rgba(15,12,10,.78)',backdropFilter:'blur(8px)',color:'#fff',fontSize:10,fontWeight:850,cursor:'pointer'}}>Edit cover</button>
              </div>:<div className="kdp-book-shell" style={{width:'100%',maxWidth:mob?360:840,margin:'0 auto',display:'grid',gridTemplateColumns:mob?'1fr':'1fr 1fr',alignItems:'start',perspective:1700}}>
                {[pageIndex,pageIndex+1].slice(0,mob?1:2).map((bookPage,spreadIndex)=>{
                  const pageText=activeSectionPages[bookPage];
                  const underPage=pageTurnDirection==='back'?Math.max(0,bookPage-(mob?1:2)):bookPage+(mob?1:2);
                  const underText=activeSectionPages[underPage]||'';
                  const sectionName=String(activeSection.name||'').toLowerCase();
                  const pageClass=/title[-_ ]?page/.test(sectionName)?'kdp-title-page':/copyright/.test(sectionName)?'kdp-copyright-page':/table[-_ ]of[-_ ]contents|\btoc\b/.test(sectionName)?'kdp-toc-page':/(?:chapter|ch)[-_ ]?\d+/.test(sectionName)?'kdp-chapter-page':'';
                  const turnClass=pageTurnAnimating&&((pageTurnDirection==='forward'&&(mob||spreadIndex===1))||(pageTurnDirection==='back'&&(mob||spreadIndex===0)))?`kdp-page-turn-${pageTurnDirection}`:'';
                  const pageStyle={display:'flex',flexDirection:'column',minWidth:0,aspectRatio:'2 / 3',boxSizing:'border-box',padding:mob?'9% 8% 6%':'9% 8% 6%',background:'#fffdf8',color:'#26231f',fontFamily:"Georgia,'Times New Roman',serif",fontSize:13,lineHeight:1.58,borderRadius:mob?12:spreadIndex===0?'12px 0 0 12px':'0 12px 12px 0',border:'1px solid rgba(83,68,47,.18)',backfaceVisibility:'hidden',transformStyle:'preserve-3d',boxShadow:mob?'0 14px 36px rgba(0,0,0,.22)':spreadIndex===0?'inset -16px 0 24px -22px rgba(0,0,0,.5)':'inset 16px 0 24px -22px rgba(0,0,0,.5)'};
                  return <div key={`${activeSection.fileId}-${bookPage}`} className="kdp-page-cell" style={{aspectRatio:'2 / 3'}}>
                    <div className="kdp-page-under" style={{...pageStyle,zIndex:0}}>{underText?<div className={`kdp-book-page ${pageClass}`} style={{flex:1,overflow:'hidden'}}><ReactMarkdown remarkPlugins={[remarkGfm]}>{underText}</ReactMarkdown></div>:<div style={{flex:1}}/>}</div>
                    <div className={`kdp-page-leaf ${turnClass}`} style={{...pageStyle,position:'absolute',inset:0}}>
                      {pageText?<div className={`kdp-book-page ${pageClass}`} style={{flex:1,overflow:'hidden'}}><ReactMarkdown remarkPlugins={[remarkGfm]}>{pageText}</ReactMarkdown></div>:<div style={{flex:1}}/>}
                      <div style={{textAlign:spreadIndex===0&&!mob?'left':'right',fontSize:10,color:'#8b8277',paddingTop:12}}>{globalBookPage+spreadIndex+1}</div>
                    </div>
                  </div>;
                })}
              </div>}
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginTop:16,flexWrap:'wrap'}}>
                <button aria-label="Turn to previous page" onClick={turnBookBack} disabled={readerEdge==='front'||(!coverArtifact&&globalBookPage===0)||pageTurnAnimating} style={{padding:'9px 14px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:readerEdge==='front'||pageTurnAnimating?'not-allowed':'pointer',opacity:readerEdge==='front'?0.45:1}}>← Turn back</button>
                <span style={{minWidth:160,textAlign:'center',fontSize:11,color:c.so}}>{readerEdge==='front'?'Front cover':readerEdge==='back'?'Back cover':`Page ${globalBookPage+(coverArtifact?2:1)}${!mob&&globalBookPage+1<totalBookPages?'–'+Math.min(totalReaderPages-1,globalBookPage+(coverArtifact?3:2)):''} of ${totalReaderPages}`}</span>
                <button aria-label="Turn to next page" onClick={turnBookForward} disabled={readerEdge==='back'||(!coverArtifact&&globalBookPage+(mob?1:2)>=totalBookPages)||pageTurnAnimating} style={{padding:'9px 14px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:readerEdge==='back'||pageTurnAnimating?'not-allowed':'pointer',opacity:readerEdge==='back'?0.45:1}}>Turn page →</button>
              </div>
              </div>}
            </div>}
            <div style={{padding:14,borderTop:'1px solid '+c.ln}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:13,paddingBottom:13,borderBottom:'1px solid '+c.ln}}>
                <div><div style={{fontSize:11,fontWeight:850,color:c.tx}}>Edit the words yourself</div><div style={{fontSize:10,color:c.so,marginTop:3}}>Type directly into this section and save without using AI credits.</div></div>
                <button onClick={()=>{setSectionDraft(activeSection.content||'');setDirectEditing(true);setSectionSaveMessage('');}} disabled={directEditing} style={{padding:'9px 13px',borderRadius:9,border:'1px solid '+c.ac,background:c.ac+'12',color:c.ac,fontSize:11,fontWeight:850,cursor:directEditing?'default':'pointer'}}>{directEditing?'Editing now':'Edit directly'}</button>
              </div>
              {sectionSaveMessage&&<div role="status" style={{padding:'9px 11px',borderRadius:9,background:'rgba(34,197,94,.1)',color:c.gr,fontSize:10,lineHeight:1.45,marginBottom:11}}>{sectionSaveMessage}</div>}
              <label style={{display:'block',fontSize:11,fontWeight:800,color:c.tx,marginBottom:7}}>Ask {aFN} to revise this section</label>
              <textarea value={revision} onChange={e=>setRevision(e.target.value)} rows={3} placeholder="Example: Make the opening more personal, add a practical example, and shorten the final section." style={{...inputStyle,resize:'vertical',marginBottom:8}}/>
              <button onClick={requestChapterRevision} disabled={!revision.trim()||revising} style={{width:'100%',padding:11,border:0,borderRadius:10,background:revision.trim()&&!revising?'linear-gradient(135deg,#F4A261,#E76F8B)':c.cd,color:revision.trim()&&!revising?'#fff':c.fa,fontSize:12,fontWeight:800,cursor:revision.trim()&&!revising?'pointer':'not-allowed'}}>{revising?'Revising section…':'Request section edits'}</button>
            </div>
          </div>}
          {stage==='preview'&&!activeSection&&<div style={{padding:42,textAlign:'center',borderRadius:14,border:'1px dashed '+c.ln,background:c.sf,color:c.so,marginBottom:18}}>The page preview and agent revision box will activate when the first readable book section is saved.</div>}
          {stage==='publish'&&<div style={{marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:750,color:c.so,marginBottom:8}}>Book cover</div>
            {coverArtifact?<div data-testid="book-cover-revision-workspace" style={{display:'grid',gridTemplateColumns:mob?'1fr':'minmax(220px,320px) minmax(0,1fr)',gap:mob?14:20,padding:mob?14:18,borderRadius:15,border:'1px solid '+c.ln,background:c.sf,marginBottom:16}}>
              <div style={{width:'100%',maxWidth:mob?260:320,margin:'0 auto',aspectRatio:'2 / 3',borderRadius:12,overflow:'hidden',background:c.cd,boxShadow:'0 12px 34px rgba(0,0,0,.2)'}}><img src={coverPreviewUrl} alt={`Current cover for ${String(active.title||'').replace(/^📚\s*/,'')}`} style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}}/></div>
              <div style={{alignSelf:'center'}}>
                <div style={{fontSize:10,fontWeight:850,color:c.ac,textTransform:'uppercase',letterSpacing:'.08em'}}>Current active cover</div>
                <div style={{fontSize:15,fontWeight:800,color:c.tx,marginTop:5,overflowWrap:'anywhere'}}>{coverArtifact.name}</div>
                <p style={{fontSize:11,lineHeight:1.55,color:c.so,margin:'9px 0 14px'}}>Describe the change you want. Book Studio will generate a new 2:3 cover through RunPod and keep this version in the project history.</p>
                <label style={{display:'block',fontSize:11,fontWeight:800,color:c.tx,marginBottom:7}}>Revise this cover</label>
                <textarea data-testid="book-cover-revision-prompt" value={coverRevision} onChange={e=>setCoverRevision(e.target.value)} rows={4} placeholder="Example: Keep the title and author exactly the same, make the background more cinematic, and use warmer gold lighting." style={{...inputStyle,resize:'vertical',marginBottom:8}}/>
                <button onClick={requestCoverRevision} disabled={!coverRevision.trim()||coverRevising} style={{width:'100%',padding:11,border:0,borderRadius:10,background:coverRevision.trim()&&!coverRevising?'linear-gradient(135deg,#F4A261,#E76F8B)':c.cd,color:coverRevision.trim()&&!coverRevising?'#fff':c.fa,fontSize:12,fontWeight:850,cursor:coverRevision.trim()&&!coverRevising?'pointer':'not-allowed'}}>{coverRevising?'Generating revised cover…':'Generate revision with RunPod'}</button>
                {coverRevisionMessage&&<div role="status" style={{padding:'9px 11px',borderRadius:9,background:'rgba(34,197,94,.1)',color:c.gr,fontSize:10,lineHeight:1.45,marginTop:10}}>{coverRevisionMessage}</div>}
              </div>
            </div>:<div style={{padding:38,textAlign:'center',borderRadius:12,border:'1px dashed '+c.ln,color:c.so,marginBottom:16}}>When the cover is generated, it will appear here with its own RunPod revision controls.</div>}
            <div style={{fontSize:12,fontWeight:750,color:c.so,marginBottom:8}}>Export files and cover history</div>
            {artifacts.length>0?<div style={{display:'grid',gap:8}}>{artifacts.filter(file=>!bookProof.chapters.some(chapter=>chapter.fileId===file.fileId)).map(file=><a key={file.fileId} href={file.downloadUrl||`/api/files/download/${file.fileId}`} style={{padding:'11px 12px',borderRadius:10,border:'1px solid '+c.ln,background:c.sf,color:c.tx,textDecoration:'none',fontSize:12,fontWeight:650,display:'flex',justifyContent:'space-between',gap:8}}><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span><span style={{color:c.ac}}>Download ↓</span></a>)}</div>:<div style={{padding:38,textAlign:'center',borderRadius:12,border:'1px dashed '+c.ln,color:c.so}}>The complete manuscript, DOCX, PDF, and cover versions will appear here.</div>}
          </div>}
          {messages.length>0&&<div style={{padding:14,borderRadius:12,background:c.sf,border:'1px solid '+c.ln,maxHeight:300,overflowY:'auto'}}>{messages.filter(message=>message.role==='assistant').slice(-6).map(message=><div key={message.id} style={{fontSize:12,lineHeight:1.55,color:c.so,marginBottom:10}}><ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanMessageText(message.content)}</ReactMarkdown></div>)}</div>}
          {!standalone&&<button onClick={()=>onOpenChat(active.id)} style={{marginTop:14,width:'100%',padding:11,borderRadius:10,border:'1px solid '+c.ac,background:c.ac+'10',color:c.ac,fontSize:12,fontWeight:750,cursor:'pointer'}}>Open full creation chat</button>}
        </div>
      </div>}
      {checkout&&<div role="dialog" aria-modal="true" aria-label={`${checkout.name} checkout`} style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(0,0,0,.78)',display:'flex',alignItems:mob?'flex-end':'center',justifyContent:'center',padding:mob?0:20}} onClick={()=>setCheckout(null)}>
        <div style={{width:'100%',maxWidth:560,height:mob?'92dvh':'min(780px,92vh)',background:c.cd,border:'1px solid '+c.ln,borderRadius:mob?'18px 18px 0 0':18,display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderBottom:'1px solid '+c.ln}}><div style={{flex:1}}><div style={{fontSize:15,fontWeight:750,color:c.tx}}>{checkout.name}</div><div style={{fontSize:11,color:c.so}}>Secure checkout powered by Whop</div></div><button aria-label="Close checkout" onClick={()=>setCheckout(null)} style={{width:34,height:34,borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,cursor:'pointer',fontSize:19}}>×</button></div>
          <div style={{flex:1,minHeight:0,overflowY:'auto',background:'#fff'}}><div data-whop-checkout-plan-id={checkout.planId} data-whop-checkout-return-url={`${window.location.origin}/book-creator?billing=success`} style={{width:'100%',minHeight:'100%'}}/></div>
        </div>
      </div>}
    </div>
  </div>);
}

function DocsPage({c,mob,aFN="Agent",agentId}){
  const [docs,setDocs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selectedDoc,setSelectedDoc]=useState(null);
  const [docContent,setDocContent]=useState(null);
  const [filter,setFilter]=useState("all");

  useEffect(()=>{
    const go=async()=>{
      try{
        const qs = agentId ? `?agentId=${agentId}` : '';
        const _hh=await getAuthHeaders();const r=await fetch(`/api/dashboard/documents${qs}`,{headers:_hh});
        if(r.ok){const d=await r.json();setDocs(d.documents||[]);}
      }catch{}
      setLoading(false);
    };
    go();
  },[agentId]);

  const openDoc=async(id)=>{
    try{
      const _hh=await getAuthHeaders();const r=await fetch(`/api/dashboard/documents/${id}`,{headers:_hh});
      if(r.ok){const d=await r.json();setDocContent(d);setSelectedDoc(id);}
    }catch{}
  };

  const updateStatus=async(id,status)=>{
    try{
      const _hh=await getAuthHeaders();const r=await fetch(`/api/dashboard/documents/${id}`,{method:"PATCH",headers:{..._hh,"Content-Type":"application/json"},body:JSON.stringify({status})});
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

function BillingPage({c,mob,aFN="Agent"}){
  const [billing,setBilling]=useState(null);
  const [loading,setLoading]=useState(true);
  const [opening,setOpening]=useState("");
  const [error,setError]=useState("");
  const [checkout,setCheckout]=useState(null);

  useEffect(()=>{
    let active=true;
    getAuthHeaders().then(headers=>fetch("/api/billing/plans",{headers})).then(async r=>{
      const data=await r.json();
      if(!r.ok||!data.success)throw new Error(data.error||"Billing is unavailable");
      if(active)setBilling(data);
    }).catch(err=>active&&setError(err.message)).finally(()=>active&&setLoading(false));
    return()=>{active=false;};
  },[]);

  const openCheckout=async planKey=>{
    setOpening(planKey);setError("");
    try{
      const headers=await getAuthHeaders();
      const r=await fetch("/api/billing/prepare-checkout",{method:"POST",headers,body:JSON.stringify({plan:planKey})});
      const data=await r.json();
      if(!r.ok||!data.success)throw new Error(data.error||"Could not prepare checkout");
      if(data.alreadyActive){alert(data.message);return;}
      if(!data.checkoutPlanId)throw new Error("Whop checkout is not configured for this plan");
      setCheckout({planId:data.checkoutPlanId,name:data.plan?.name||"Bloomie plan"});
    }catch(err){setError(err.message);}
    finally{setOpening("");}
  };

  const currentLabels={starter:"Starter",standard:"Standard",pro:"AI Employee - Part Time",enterprise:"AI Employee - Full Time"};

  return(
    <div style={{padding:mob?"16px 12px 40px":"24px 28px 60px",maxWidth:860,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:mob?20:24,fontWeight:700,margin:0}}>Billing & Plan</h1>
        <p style={{fontSize:13,color:c.so,marginTop:5}}>Review your Bloomie plan and approve upgrades securely on Whop.</p>
      </div>

      {loading&&<div style={{padding:24,borderRadius:12,background:c.cd,border:"1px solid "+c.ln,color:c.so}}>Loading your plan…</div>}
      {error&&<div style={{padding:"11px 14px",borderRadius:10,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",color:"#ef6464",marginBottom:14}}>{error}</div>}

      {billing&&<>
        <div style={{padding:18,borderRadius:12,background:c.cd,border:"1px solid "+c.ln,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:mob?"flex-start":"center",gap:12,flexDirection:mob?"column":"row"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:"uppercase",letterSpacing:".5px"}}>Current tenant plan</div>
            <div style={{fontSize:22,fontWeight:750,marginTop:4,color:c.ac}}>{currentLabels[billing.currentPlan]||billing.currentPlan}</div>
            <div style={{fontSize:12,color:c.so,marginTop:4}}>{billing.organizationName}</div>
          </div>
          <div style={{padding:"7px 12px",borderRadius:999,background:"rgba(52,168,83,.1)",color:"#34a853",fontSize:12,fontWeight:700}}>✓ Active</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(2,minmax(0,1fr))",gap:14}}>
          {billing.plans.map(plan=>{
            const active=(plan.key==="full_time"&&billing.currentPlan==="enterprise")||(plan.key==="part_time"&&billing.currentPlan==="pro");
            return <div key={plan.key} style={{padding:20,borderRadius:14,background:c.cd,border:"1px solid "+(active?"#34a853":c.ln),display:"flex",flexDirection:"column",minHeight:230}}>
              <div style={{fontSize:12,fontWeight:700,color:active?"#34a853":c.ac}}>{active?"CURRENT PLAN":"AVAILABLE PLAN"}</div>
              <div style={{fontSize:18,fontWeight:750,marginTop:8}}>{plan.name}</div>
              <div style={{fontSize:28,fontWeight:800,marginTop:8}}>${plan.price}<span style={{fontSize:13,fontWeight:500,color:c.so}}>{plan.cadence==="one_time"?" once":"/month"}</span></div>
              <div style={{fontSize:13,lineHeight:1.55,color:c.so,marginTop:10,flex:1}}>{plan.description}</div>
              <button disabled={active||opening===plan.key} onClick={()=>openCheckout(plan.key)} style={{marginTop:18,padding:"11px 16px",borderRadius:10,border:active?"1px solid "+c.ln:"none",background:active?c.sf:"linear-gradient(135deg,#F4A261,#E76F8B)",color:active?c.so:"#fff",fontSize:13,fontWeight:750,cursor:active?"default":"pointer",opacity:opening===plan.key ? .7 : 1}}>
                {active?"Already active":opening===plan.key?"Preparing…":"Review secure checkout"}
              </button>
            </div>;
          })}
        </div>

        <div style={{marginTop:16,padding:16,borderRadius:12,background:c.sf,border:"1px solid "+c.ln,fontSize:12,lineHeight:1.6,color:c.so}}>
          <strong style={{color:c.tx}}>How upgrades work:</strong> selecting a plan opens Whop’s secure hosted checkout inside Bloomie. Nothing is charged until you review and approve it. Your plan changes only after Whop confirms a successful purchase with a signed webhook.
        </div>
      </>}
      {checkout&&<div role="dialog" aria-modal="true" aria-label={`${checkout.name} checkout`} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.78)",display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:20}} onClick={()=>setCheckout(null)}>
        <div style={{width:"100%",maxWidth:560,height:mob?"92dvh":"min(780px,92vh)",background:c.cd,border:"1px solid "+c.ln,borderRadius:mob?"18px 18px 0 0":18,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.45)"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:"1px solid "+c.ln,flexShrink:0}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:750,color:c.tx}}>{checkout.name}</div>
              <div style={{fontSize:11,color:c.so,marginTop:2}}>Secure checkout powered by Whop</div>
            </div>
            <button aria-label="Close checkout" onClick={()=>setCheckout(null)} style={{width:34,height:34,borderRadius:9,border:"1px solid "+c.ln,background:c.sf,color:c.tx,cursor:"pointer",fontSize:19,lineHeight:1}}>×</button>
          </div>
          <div style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",background:"#fff"}}>
            <div
              key={checkout.planId}
              data-whop-checkout-plan-id={checkout.planId}
              data-whop-checkout-return-url={`${window.location.origin}/app?billing=success`}
              style={{width:"100%",minHeight:"100%"}}
            />
          </div>
        </div>
      </div>}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   DISPATCH PAGE — Mobile access to your Bloomie
   ═══════════════════════════════════════════════════════════════ */
function DispatchPage({c, mob, currentAgent, agentImgUrl}) {
  const SARAH_URL = typeof window !== 'undefined' ? window.location.origin : 'https://app.bloomiestaffing.com';
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
          const filename = platform.includes('mac') ? 'BLOOM-Desktop.dmg' : 'BLOOM-Desktop-Windows.exe';

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

  const agentName = currentAgent?.name || 'AI Agent';
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
            onClick={() => downloadDesktop('mac-arm64')}
            disabled={downloading !== null || desktopAvail?.['mac-arm64']?.available === false}
            style={{flex:1, minWidth:140, padding:'14px 20px', borderRadius:12, border:'none', background: isMac ? 'linear-gradient(135deg,#F4A261,#E76F8B)' : c.sf, color: isMac ? '#fff' : c.tx, cursor: downloading ? 'wait' : 'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'transform .1s', opacity: downloading === 'mac-arm64' || downloading === 'mac-intel' ? 0.6 : 1}}>
            <svg width='18' height='18' viewBox='0 0 24 24' fill={isMac ? '#fff' : c.so}>
              <path d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z'/>
            </svg>
            {downloading === 'mac-arm64' || downloading === 'mac-intel' ? 'Downloading...' : desktopAvail?.['mac-arm64']?.available === false ? 'macOS coming soon' : 'Download for macOS'}
          </button>

          {/* Windows Button */}
          <button
            onClick={() => downloadDesktop('windows')}
            disabled={downloading !== null || desktopAvail?.windows?.available === false}
            style={{flex:1, minWidth:140, padding:'14px 20px', borderRadius:12, border:'none', background: isWin ? 'linear-gradient(135deg,#F4A261,#E76F8B)' : c.sf, color: isWin ? '#fff' : c.tx, cursor: downloading ? 'wait' : 'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'transform .1s', opacity: downloading === 'windows' ? 0.6 : 1}}>
            <svg width='16' height='16' viewBox='0 0 24 24' fill={isWin ? '#fff' : c.so}>
              <path d='M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801'/>
            </svg>
            {downloading === 'windows' ? 'Downloading...' : desktopAvail?.windows?.available === false ? 'Windows coming soon' : 'Download for Windows'}
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

export default function AppWithErrorBoundary({ user: authUser, passwordRecovery = false }) {
  return <ErrorBoundary><ConversationProvider><App authUser={authUser} passwordRecovery={passwordRecovery} /></ConversationProvider></ErrorBoundary>;
}

// ── Password Change Panel — used in Settings > General > Security ──────────
function PwChangePanel({c, recoveryMode = false}) {
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
    <div data-testid="password-change-panel" style={{padding:'14px 16px',borderRadius:10,background:c.sf,border:'1px solid '+c.ln,display:'flex',flexDirection:'column',gap:10}}>
      {recoveryMode&&<div style={{fontSize:12,color:c.ac,fontWeight:700,padding:'8px 10px',background:c.ac+'12',borderRadius:7}}>Choose a new password to finish recovering your account.</div>}
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


function ManagedWorkspaceStyles(){
  return <style>{`
    .managed-thread{width:100%;max-width:780px;margin:0 auto;padding:22px 22px 34px}
    .managed-markdown{font-size:14px;line-height:1.7;color:inherit;min-width:0}
    .managed-markdown>*:first-child{margin-top:0}.managed-markdown>*:last-child{margin-bottom:0}
    .managed-markdown p{margin:0 0 12px}.managed-markdown h1{font-size:22px;line-height:1.25;margin:22px 0 10px}
    .managed-markdown h2{font-size:18px;line-height:1.35;margin:20px 0 8px}.managed-markdown h3{font-size:16px;margin:18px 0 8px}
    .managed-markdown ul,.managed-markdown ol{margin:8px 0 14px;padding-left:22px}.managed-markdown li{margin:5px 0}
    .managed-markdown pre{max-width:100%;overflow:auto;margin:12px 0;border-radius:12px}
    .managed-markdown code{overflow-wrap:anywhere}.managed-markdown table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse;margin:12px 0}
    .managed-markdown th,.managed-markdown td{padding:8px 10px;border:1px solid rgba(127,127,127,.25);text-align:left}
    .managed-markdown blockquote{margin:12px 0;padding:2px 0 2px 14px;border-left:3px solid #F4A261;opacity:.9}
    @keyframes processingSweep{0%{background-position:180% 0}100%{background-position:-40% 0}}
    .managed-user-bubble{max-width:min(78%,620px)}
    .managed-composer{padding:10px max(14px,env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
    @media(max-width:767px){
      .managed-thread{padding:16px 14px 28px;max-width:none}
      .managed-markdown{font-size:15px;line-height:1.65}
      .managed-user-bubble{max-width:88%}
      .managed-desktop-artifact{display:none!important}
      .managed-session-header{padding-left:14px!important;padding-right:14px!important}
    }
  `}</style>;
}

function ManagedMessage({message,c,aFN="Bloomie",agent=null,user=null}){
  const isUser=message.role==='user';
  const attachments=message.images||message.files||[];
  const uberEatsResults=!isUser?parseUberEatsResults(message.content):null;
  return(
    <div style={{display:'flex',justifyContent:isUser?'flex-end':'flex-start',gap:10,alignItems:'flex-start',marginBottom:20,minWidth:0}}>
      {!isUser&&<Face sz={30} agent={agent||{nm:aFN,img:null,grad:'linear-gradient(135deg,#F4A261,#E76F8B)'}} style={{marginTop:2}}/>}
      <div className={isUser?'managed-user-bubble':''} style={{minWidth:0,...(isUser?{padding:'11px 15px',borderRadius:'20px 20px 5px 20px',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff'}:{flex:1,color:c.tx})}}>
        {attachments.length>0&&<div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:message.content?8:0}}>
          {attachments.map((file,j)=>file.data&&String(file.type||'').startsWith('image/')
            ?<img key={j} src={file.data} alt={file.name||'Attachment'} style={{width:120,height:88,objectFit:'cover',borderRadius:10}}/>
            :<div key={j} style={{padding:'7px 10px',borderRadius:10,background:isUser?'rgba(255,255,255,.14)':c.cd,border:'1px solid '+(isUser?'rgba(255,255,255,.25)':c.ln),fontSize:12}}>File · {file.name||'Attachment'}</div>)}
        </div>}
        {message.content&&<div className="managed-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            a:({node,href,children})=><MarkdownMediaLink href={href} color={isUser?'#fff':c.ac}>{children}</MarkdownMediaLink>,
            img:({node,src,alt})=><MarkdownInlineImage src={src} alt={alt}/>,
            code:({node,inline,className,children,...props})=>inline
              ?<code {...props} style={{padding:'2px 5px',borderRadius:5,background:isUser?'rgba(0,0,0,.16)':c.sf,fontSize:'.9em'}}>{children}</code>
              :<code {...props} className={className} style={{display:'block',padding:'13px 14px',background:'#0d1117',color:'#e6edf3',fontSize:12,lineHeight:1.55,fontFamily:"'Fira Code','Cascadia Code',monospace"}}>{children}</code>
          }}>{cleanMessageText(message.content)}</ReactMarkdown>
          {uberEatsResults&&<UberEatsResultsCard results={uberEatsResults} c={c}/>}
        </div>}
      </div>
      {isUser&&<Face sz={30} agent={user||{nm:'You',img:null,grad:'linear-gradient(135deg,#F4A261,#E76F8B)'}} style={{marginTop:2}}/>}
    </div>
  );
}

function ManagedArtifacts({sessionId,c,mob,onOpen}){
  const [files,setFiles]=useState([]);
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    if(!sessionId){setFiles([]);return;}
    let live=true;
    const load=async()=>{
      try{
        const h=await getAuthHeaders();
        const r=await fetch(`/api/files/artifacts?sessionId=${encodeURIComponent(sessionId)}&limit=20`,{headers:h});
        const d=await r.json();
        if(live&&r.ok)setFiles(d.artifacts||[]);
      }catch{}
    };
    load();const timer=setInterval(load,5000);
    return()=>{live=false;clearInterval(timer);};
  },[sessionId]);
  if(!sessionId)return null;
  const openFile=async(file)=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/files/preview/${file.fileId}`,{headers:h});
      const d=await r.json();
      onOpen({...file,content:d.content||'',fileId:file.fileId});
      setOpen(false);
    }catch{onOpen(file);}
  };
  return <>
    <button onClick={()=>setOpen(true)} style={{padding:'7px 11px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:12,fontWeight:650,cursor:'pointer',whiteSpace:'nowrap'}}>
      Files{files.length?` ${files.length}`:''}
    </button>
    {open&&<div onClick={()=>setOpen(false)} style={{position:'fixed',inset:0,zIndex:9000,background:'rgba(0,0,0,.62)',display:'flex',alignItems:mob?'flex-end':'center',justifyContent:'center',padding:mob?0:24}}>
      <div onClick={e=>e.stopPropagation()} style={{width:mob?'100%':520,maxHeight:mob?'82dvh':'70vh',borderRadius:mob?'20px 20px 0 0':18,background:c.cd,border:'1px solid '+c.ln,overflow:'hidden',boxShadow:'0 24px 80px rgba(0,0,0,.45)'}}>
        <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderBottom:'1px solid '+c.ln}}>
          <div style={{flex:1,fontSize:15,fontWeight:750,color:c.tx}}>Session files</div>
          <button onClick={()=>setOpen(false)} aria-label="Close files" style={{width:32,height:32,borderRadius:9,border:'1px solid '+c.ln,background:'transparent',color:c.tx,cursor:'pointer'}}>×</button>
        </div>
        <div style={{padding:10,overflowY:'auto',maxHeight:mob?'calc(82dvh - 62px)':'calc(70vh - 62px)'}}>
          {files.length===0?<div style={{padding:34,textAlign:'center',fontSize:13,color:c.so}}>Artifacts created in this session will appear here.</div>:files.map(file=>
            <button key={file.fileId||file.id} onClick={()=>openFile(file)} style={{width:'100%',display:'flex',alignItems:'center',gap:11,textAlign:'left',padding:'12px',border:0,borderBottom:'1px solid '+c.ln,background:'transparent',color:c.tx,cursor:'pointer'}}>
              <span style={{width:36,height:36,borderRadius:10,background:c.sf,display:'grid',placeItems:'center',fontSize:10,fontWeight:800,color:c.ac}}>{(file.name?.split('.').pop()||'FILE').toUpperCase()}</span>
              <span style={{flex:1,minWidth:0}}><span style={{display:'block',fontSize:13,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span><span style={{fontSize:11,color:c.so}}>Tap to preview</span></span>
              <span style={{color:c.so}}>›</span>
            </button>)}
        </div>
      </div>
    </div>}
  </>;
}

function WorkWorkspacePanel({c,mob,tab,setTab,sessionId,setActiveArtifact,aFN,agentId,agent,browserMode,setBrowserMode,lastAgentText="",onClose}){
  return(
    <div data-testid="work-live-workspace" style={{
      ...(mob
        ? {position:'fixed',inset:0,zIndex:9050}
        : {width:'100%',height:'100%',flex:1}),
      minWidth:0,background:c.cd,display:'flex',flexDirection:'column',overflow:'hidden'
    }}>
      <div style={{height:44,display:'flex',alignItems:'stretch',borderBottom:'1px solid '+c.ln,background:c.sf,flexShrink:0,paddingTop:mob?'env(safe-area-inset-top)':0}}>
        <button onClick={()=>setTab('live')} style={{flex:1,border:'none',borderBottom:tab==='live'?'2px solid '+c.ac:'2px solid transparent',background:'transparent',color:tab==='live'?c.tx:c.so,fontSize:12,fontWeight:750,cursor:'pointer'}}>Live</button>
        <button onClick={()=>setTab('browser')} style={{flex:1,border:'none',borderBottom:tab==='browser'?'2px solid '+c.ac:'2px solid transparent',background:'transparent',color:tab==='browser'?c.tx:c.so,fontSize:12,fontWeight:750,cursor:'pointer'}}>Browser</button>
        <button onClick={()=>setTab('files')} style={{flex:1,border:'none',borderBottom:tab==='files'?'2px solid '+c.ac:'2px solid transparent',background:'transparent',color:tab==='files'?c.tx:c.so,fontSize:12,fontWeight:750,cursor:'pointer'}}>Files</button>
        {onClose&&<button onClick={onClose} aria-label="Collapse Work workspace" title="Collapse panel" style={{width:36,padding:'8px 0',border:'none',borderBottom:'2px solid transparent',background:'transparent',color:c.so,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="2"><path d="M6 3l5 5-5 5"/></svg>
        </button>}
      </div>
      <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {tab==='live'
          ?<LiveAvatarPanel c={c} agentId={agentId} agentName={agent?.nm||aFN} agentImg={agent?.img||null} lastSarahText={lastAgentText}/>
          :tab==='browser'
            ?<Screen c={c} mob={mob} mode={browserMode} setMode={setBrowserMode} aFN={aFN}/>
          :sessionId
            ?<SessionFilesPanel c={c} sessionId={sessionId} setActiveArtifact={setActiveArtifact} aFN={aFN}/>
            :<div style={{flex:1,display:'grid',placeItems:'center',padding:24,textAlign:'center',color:c.so,fontSize:13}}>Start or select a Work session to see its files.</div>
        }
      </div>
    </div>
  );
}

function WorkSessionsSidebar({c,agentId,activeId,onSelect,projects=[],onProjectChange,searchQuery=""}){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(()=>new Set());
  const [menuId,setMenuId]=useState(null);
  const [,setReadVersion]=useState(0);
  useEffect(()=>{
    const refresh=()=>setReadVersion(value=>value+1);
    window.addEventListener('bloomie-read-state-changed',refresh);
    window.addEventListener('storage',refresh);
    return()=>{window.removeEventListener('bloomie-read-state-changed',refresh);window.removeEventListener('storage',refresh);};
  },[]);
  useEffect(()=>{
    let live=true;
    const load=async()=>{
      try{
        const h=await getAuthHeaders();
        const r=await fetch('/api/builds'+(agentId?`?agentId=${encodeURIComponent(agentId)}`:''),{headers:h});
        const d=await r.json();
        if(live&&r.ok){
          seedConversationReads('work',d.builds||[]);
          setItems(d.builds||[]);
        }
      }catch{}
      if(live)setLoading(false);
    };
    load();
    const timer=setInterval(load,5000);
    return()=>{live=false;clearInterval(timer);};
  },[agentId]);
  const visible=items.filter(item=>!searchQuery.trim()||(item.title||'Work session').toLowerCase().includes(searchQuery.toLowerCase()));
  const color=status=>status==='complete'?'#22c55e':status==='error'?'#ef4444':status==='building'||status==='in_progress'?'#F4A261':'#60a5fa';
  const label=status=>status==='complete'?'Complete':status==='error'?'Error':status==='building'||status==='in_progress'?'Working…':status==='clarifying'?'Waiting for you':'Queued';
  const move=async(item,projectId)=>{
    try{
      const h=await getAuthHeaders();
      const currentProject=item.project_id;
      const targetId=projectId||currentProject;
      if(!targetId)return;
      const r=await fetch(`/api/projects/${targetId}/work-sessions`,{
        method:'PATCH',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify({workSessionIds:[item.id],action:projectId?'add':'remove'})
      });
      const d=await r.json();
      if(!r.ok||!d.success)throw new Error(d.error||'Move failed');
      setItems(list=>list.map(row=>row.id===item.id?{...row,project_id:projectId||null}:row));
      if(projectId)setExpanded(current=>new Set([...current,projectId]));
      setMenuId(null);
      onProjectChange?.(item.id,projectId||null);
    }catch(error){window.alert(error.message||'Could not move this Work session');}
  };
  const renderItem=item=>{
    const selected=activeId===item.id;
    const unread=!selected&&isConversationUnread('work',item);
    return <div key={item.id} style={{position:'relative',marginBottom:3}}>
      <button onClick={()=>{markConversationRead('work',item.id,item.updated_at);onSelect(item.id,item.project_id||null);}} style={{width:'100%',padding:'10px 34px 10px 10px',borderRadius:10,border:'none',background:selected?c.ac+'15':'transparent',color:selected?c.ac:c.tx,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'flex-start',gap:9}}>
        <span style={{width:8,height:8,borderRadius:'50%',background:color(item.status),marginTop:5,flexShrink:0}}/>
        <span style={{flex:1,minWidth:0}}>
          <span style={{display:'flex',alignItems:'center',gap:7,fontSize:13,fontWeight:selected||unread?650:550}}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.title||'Work session'}</span>
            {unread&&<span aria-label="Unread Work response" title="Unread" style={{width:8,height:8,borderRadius:'50%',background:'#3b82f6',boxShadow:'0 0 0 2px rgba(59,130,246,.15)',flexShrink:0}}/>}
          </span>
          <span style={{display:'block',fontSize:10,color:c.fa,marginTop:3}}>{label(item.status)}{item.type==='build'?' · Build':''}</span>
        </span>
      </button>
      <button onClick={event=>{event.stopPropagation();setMenuId(menuId===item.id?null:item.id);}} aria-label={`Work session options for ${item.title||'Work session'}`} style={{position:'absolute',right:5,top:9,width:26,height:26,border:'none',borderRadius:7,background:menuId===item.id?c.sf:'transparent',color:c.so,cursor:'pointer',fontSize:18}}>⋮</button>
      {menuId===item.id&&<>
        <div onClick={()=>setMenuId(null)} style={{position:'fixed',inset:0,zIndex:998}}/>
        <div style={{position:'absolute',right:5,top:36,zIndex:999,width:190,padding:5,borderRadius:10,border:'1px solid '+c.ln,background:c.cd,boxShadow:'0 8px 24px rgba(0,0,0,.2)'}}>
          <div style={{padding:'6px 8px',fontSize:10,fontWeight:700,color:c.fa,textTransform:'uppercase'}}>Move to Project</div>
          {projects.map(project=><button key={project.id} onClick={()=>move(item,project.id)} style={{width:'100%',padding:'8px',border:'none',borderRadius:7,background:item.project_id===project.id?c.ac+'15':'transparent',color:c.tx,textAlign:'left',fontSize:12,cursor:'pointer'}}>📁 {project.name}{item.project_id===project.id?' ✓':''}</button>)}
          {item.project_id&&<button onClick={()=>move(item,null)} style={{width:'100%',padding:'8px',border:'none',borderTop:'1px solid '+c.ln,background:'transparent',color:c.so,textAlign:'left',fontSize:12,cursor:'pointer'}}>Remove from Project</button>}
        </div>
      </>}
    </div>;
  };
  return(
    <div data-testid="sidebar-work-sessions" style={{padding:'8px'}}>
      <div style={{padding:'2px 8px 8px',fontSize:10,fontWeight:700,color:c.fa,textTransform:'uppercase',letterSpacing:'.6px'}}>Work Sessions</div>
      {loading?<div style={{padding:20,textAlign:'center',fontSize:11,color:c.fa}}>Loading Work sessions…</div>:visible.length===0?<div style={{padding:20,textAlign:'center',fontSize:11,color:c.fa}}>{searchQuery.trim()?'No Work sessions found':'No Work sessions yet'}</div>:<>
        {projects.map(project=>{
          const projectItems=visible.filter(item=>item.project_id===project.id);
          if(!projectItems.length)return null;
          const open=expanded.has(project.id)||Boolean(searchQuery.trim());
          return <div key={project.id} style={{marginBottom:5}}>
            <button onClick={()=>setExpanded(current=>{const next=new Set(current);open?next.delete(project.id):next.add(project.id);return next;})} style={{width:'100%',padding:'8px 9px',border:'none',borderRadius:8,background:'transparent',color:c.tx,cursor:'pointer',display:'flex',alignItems:'center',gap:8,textAlign:'left'}}>
              <span style={{fontSize:10,color:c.so,transform:open?'rotate(90deg)':'none'}}>▶</span><span>📁</span><span style={{flex:1,minWidth:0,fontSize:12,fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{project.name}</span><span style={{fontSize:10,color:c.fa}}>{projectItems.length}</span>
            </button>
            {open&&<div style={{paddingLeft:12}}>{projectItems.map(renderItem)}</div>}
          </div>;
        })}
        {visible.some(item=>!item.project_id)&&<>
          <div style={{padding:'8px 8px 5px',fontSize:10,fontWeight:700,color:c.fa,textTransform:'uppercase',letterSpacing:'.5px'}}>Unfiled</div>
          {visible.filter(item=>!item.project_id).map(renderItem)}
        </>}
      </>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WORK TAB — Cowork-style Managed Agent sessions
// Left: session list  |  Right: live checklist + progress log + clarify Q&A
// ══════════════════════════════════════════════════════════════════════════════
function WorkTab({c,mob,aFN="Bloomie",agentId="",agent=null,user=null,initialProjectId="",requestedSessionId=null,newSessionNonce=0,newSessionProjectId="",onActiveSessionChange,onNavigate}){
  const [sessions,setSessions]=useState([]);
  const [projects,setWorkProjects]=useState([]);
  const [projectId,setProjectId]=useState(initialProjectId||'');
  const [loadError,setLoadError]=useState('');
  const [activeSid,setActiveSid]=useState(null);
  const [session,setSession]=useState(null);
  const [checklist,setChecklist]=useState([]);
  const [msgs,setMsgs]=useState([]);
  const [clarify,setClarify]=useState(null);
  const [chatInput,setChatInput]=useState('');
  const [chatSending,setChatSending]=useState(false);
  const [pendingImgs,setPendingImgs]=useState([]);
  const [activeArtifact,setActiveArtifact]=useState(null);
  const [workspaceTab,setWorkspaceTab]=useState('live');
  const [workspaceOpen,setWorkspaceOpen]=useState(true);
  const [mobileWorkspaceOpen,setMobileWorkspaceOpen]=useState(false);
  const [browserMode,setBrowserMode]=useState('docked');
  const [showWorkPlusMenu,setShowWorkPlusMenu]=useState(false);
  const [workDriveOpen,setWorkDriveOpen]=useState(false);
  const pollRef=useRef(null);
  const logRef=useRef(null);
  const imgRef=useRef(null);
  const lastAssistantMessageRef=useRef(null);
  const initializedMessagesRef=useRef(false);

  useEffect(()=>{
    setActiveSid(null);
    setSession(null);
    setMsgs([]);
    setChecklist([]);
    loadSessions();
    getAuthHeaders()
      .then(h=>fetch('/api/projects',{headers:h}))
      .then(r=>r.json())
      .then(d=>setWorkProjects(d.projects||[]))
      .catch(()=>{});
  },[agentId]);
  useEffect(()=>{if(initialProjectId)setProjectId(initialProjectId);},[initialProjectId]);
  useEffect(()=>{logRef.current?.scrollIntoView({behavior:'smooth'});},[msgs]);
  useEffect(()=>{if(requestedSessionId&&requestedSessionId!==activeSid)setActiveSid(requestedSessionId);},[requestedSessionId]);
  useEffect(()=>{
    if(!newSessionNonce)return;
    setActiveSid(null);setSession(null);setMsgs([]);setChecklist([]);setClarify(null);
    setProjectId(newSessionProjectId||'');
  },[newSessionNonce]);
  useEffect(()=>{onActiveSessionChange?.(activeSid);},[activeSid]);

  useEffect(()=>{
    if(!activeSid)return;
    initializedMessagesRef.current=false;
    lastAssistantMessageRef.current=null;
    loadDetail(activeSid);
    if(pollRef.current)clearInterval(pollRef.current);
    pollRef.current=setInterval(()=>loadDetail(activeSid),2500);
    return()=>clearInterval(pollRef.current);
  },[activeSid]);

  const loadSessions=async()=>{
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      // Work is the single execution workspace. Include legacy Build records so
      // existing coding sessions remain accessible after removing the Build tab.
      const r=await fetch('/api/builds'+(agentId?`?agentId=${encodeURIComponent(agentId)}`:''),{headers:h});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||`Work sessions failed (${r.status})`);
      setSessions(d.builds||[]);
      if(!activeSid&&d.builds?.length)setActiveSid(d.builds[0].id);
    }catch(e){setLoadError(e.message||'Could not load Work sessions');}
  };

  const loadDetail=async(id)=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/builds/'+id+(agentId?`?agentId=${encodeURIComponent(agentId)}`:''),{headers:h});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||`Work session failed (${r.status})`);
      setLoadError('');
      setSession(d.build);
      setChecklist(d.progress||[]);
      setMsgs(d.messages||[]);
      setClarify(d.clarify||null);
      markConversationRead('work',id,d.build?.updated_at||Date.now());
      const completedResponses=(d.messages||[]).filter(message=>
        message.role==='assistant'&&
        message.metadata?.type!=='work_progress'&&
        message.metadata?.type!=='execution_event'
      );
      const latestResponse=completedResponses[completedResponses.length-1];
      const responseSignature=latestResponse&&(latestResponse.id||latestResponse.created_at||`${latestResponse.content||''}:${completedResponses.length}`);
      if(initializedMessagesRef.current&&responseSignature&&responseSignature!==lastAssistantMessageRef.current){
        playBloomResponseSound();
      }
      lastAssistantMessageRef.current=responseSignature||null;
      initializedMessagesRef.current=true;
      if(d.build?.status==='complete'||d.build?.status==='error'){
        clearInterval(pollRef.current);
        setSessions(p=>p.map(s=>s.id===d.build.id?{...s,...d.build}:s));
      }
    }catch(e){setLoadError(e.message||'Could not load this Work session');}
  };

  const sendChat=async()=>{
    const msg=chatInput.trim();
    const imgs=[...pendingImgs];
    if(!msg&&!imgs.length||chatSending)return;
    unlockBloomNotificationSound();
    setChatSending(true);
    setChatInput('');setPendingImgs([]);
    setMsgs(p=>[...p,{role:'user',content:msg,images:imgs,ts:Date.now()}]);
    try{
      const h=await getAuthHeaders();
      if(!activeSid){
        const r=await fetch('/api/builds',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({brief:msg,title:msg.slice(0,60),type:'work',images:imgs,projectId:projectId||null,agentId:agentId||null})});
        const d=await r.json();
        if(!r.ok)throw new Error(d.error||'Work request failed');
        if(d.build?.id){await loadSessions();setActiveSid(d.build.id);}
      }else{
        const r=await fetch('/api/builds/'+activeSid+'/message',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({message:msg,images:imgs,agentId:agentId||null})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.error||'Message failed');
      }
    }catch(e){
      setMsgs(p=>[...p,{role:'assistant',content:`Could not send that yet: ${e.message}`,metadata:{source:'ui-error'},ts:Date.now()}]);
    }
    setChatSending(false);
  };

  const answerClarify=async(answer)=>{
    if(!clarify||!activeSid)return;
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/builds/'+activeSid+'/clarify',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({answer,clarify_id:clarify.id,agentId:agentId||null})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Could not submit your answer');
      setClarify(null);
      setTimeout(()=>loadDetail(activeSid),500);
    }catch(e){setLoadError(e.message||'Could not submit your answer');}
  };

  const startFreshWork=()=>{
    setActiveSid(null);setSession(null);setMsgs([]);setChecklist([]);setClarify(null);
    setShowWorkPlusMenu(false);
  };
  const takeWorkScreenshot=async()=>{
    try{
      const r=await fetch('/api/browser/screenshot',{cache:'no-store'});
      const d=await r.json();
      if(!r.ok||!d.screenshot)throw new Error(d.error||'No live browser screenshot is available');
      setPendingImgs(p=>[...p,{name:'screenshot.jpg',type:'image/jpeg',data:'data:image/jpeg;base64,'+d.screenshot}]);
    }catch(e){setLoadError(e.message||'Could not take a screenshot');}
    setShowWorkPlusMenu(false);
  };

  const sc=(s)=>s==='complete'?'#22c55e':s==='building'||s==='in_progress'?'#F4A261':s==='error'?'#ef4444':'#60a5fa';
  const sl=(s)=>s==='complete'?'Complete':s==='building'?'Working…':s==='error'?'Error':s==='clarifying'?'Waiting for you':s==='queued'?'Queued':'Starting…';

  return(
    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
      <ManagedWorkspaceStyles/>
      {/* ── Session list sidebar ── */}
      {false&&!mob&&(
        <div style={{width:260,borderRight:'1px solid '+c.ln,background:c.cd,display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{padding:'14px 12px 10px',borderBottom:'1px solid '+c.ln,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:13,fontWeight:700,color:c.tx}}>Work Sessions</span>
            <button onClick={()=>setActiveSid(null)} title="New session" style={{width:26,height:26,borderRadius:7,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>+</button>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'8px 8px'}}>
            {sessions.length===0&&<div style={{padding:24,textAlign:'center',color:c.so,fontSize:12}}>No sessions yet.<br/>Type below to start one.</div>}
            {sessions.map(s=>(
              <button key={s.id} onClick={()=>setActiveSid(s.id)} style={{width:'100%',textAlign:'left',padding:'10px 10px',borderRadius:10,border:'none',background:activeSid===s.id?c.ac+'18':'transparent',cursor:'pointer',marginBottom:4,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background=activeSid===s.id?c.ac+'18':c.hv} onMouseLeave={e=>e.currentTarget.style.background=activeSid===s.id?c.ac+'18':'transparent'}>
                <span style={{width:8,height:8,borderRadius:'50%',background:sc(s.status),flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title||'Untitled'}</div>
                  <div style={{fontSize:10,color:c.so,marginTop:2,display:'flex',alignItems:'center',gap:5}}>
                    <span>{sl(s.status)}</span>
                    {s.type==='build'&&<span style={{padding:'1px 5px',borderRadius:5,background:c.ac+'18',color:c.ac,fontWeight:700}}>BUILD</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main panel ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:c.bg}}>
        {mob&&(
          <div style={{padding:'8px 12px',borderBottom:'1px solid '+c.ln,background:c.cd,display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <select value={activeSid||''} onChange={e=>setActiveSid(e.target.value||null)} style={{flex:1,minWidth:0,padding:'7px 9px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:13}}>
              <option value="">New Work session</option>
              {sessions.map(s=><option key={s.id} value={s.id}>{s.title||'Untitled'} — {sl(s.status)}</option>)}
            </select>
            <button onClick={()=>{setActiveSid(null);setSession(null);setMsgs([]);setChecklist([]);setClarify(null);}} style={{padding:'7px 11px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:12,fontWeight:700}}>+ New</button>
            <button onClick={()=>{setWorkspaceTab('live');setMobileWorkspaceOpen(true);}} aria-label="Open Work live workspace" title="Live, Browser, and Files" style={{width:34,height:34,borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:16,fontWeight:800,cursor:'pointer'}}>▣</button>
          </div>
        )}
        {loadError&&(
          <div style={{margin:'10px 14px 0',padding:'9px 12px',borderRadius:10,border:'1px solid rgba(239,68,68,.35)',background:'rgba(239,68,68,.1)',color:'#ef4444',fontSize:12,display:'flex',alignItems:'center',gap:8}}>
            <span style={{flex:1}}>{loadError}</span>
            <button onClick={activeSid?()=>loadDetail(activeSid):loadSessions} style={{border:'none',background:'transparent',color:'#ef4444',fontWeight:700,cursor:'pointer'}}>Retry</button>
          </div>
        )}
        {/* Empty state */}
        {!activeSid&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:32}}>
            <Face sz={64} agent={agent}/>
            <div style={{fontSize:17,fontWeight:700,color:c.tx}}>Work Sessions</div>
            <div style={{fontSize:13,color:c.so,textAlign:'center',maxWidth:380,lineHeight:1.6}}>Type your task below and {aFN} will get started — live checklist, real-time progress, and built-in Q&amp;A when she needs your input.</div>
            <select value={projectId} onChange={e=>setProjectId(e.target.value)} style={{width:'min(100%,380px)',padding:'10px 12px',borderRadius:10,border:'1px solid '+c.ln,background:c.cd,color:c.tx,fontSize:13}}>
              <option value="">No project</option>
              {projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
        )}

        {/* Session detail */}
        {activeSid&&session&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div className="managed-session-header" style={{padding:'12px 20px',borderBottom:'1px solid '+c.ln,background:c.cd,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <Face sz={34} agent={agent}/>
              <span style={{width:10,height:10,borderRadius:'50%',background:sc(session.status),animation:session.status==='building'?'pulse 1.5s ease infinite':'none'}}/>
              <span style={{fontSize:14,fontWeight:700,color:c.tx,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{aFN} · {session.title||'Work Session'}{session.type==='build'?' · Build':''}</span>
              {session.project_id&&<span style={{fontSize:10,padding:'4px 7px',borderRadius:7,background:c.ac+'15',color:c.ac,fontWeight:700,whiteSpace:'nowrap',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis'}}>📁 {projects.find(project=>project.id===session.project_id)?.name||'Project'}</span>}
              {mob&&<>
                <button onClick={()=>{setWorkspaceTab('live');setMobileWorkspaceOpen(true);}} style={{padding:'7px 9px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:11,fontWeight:700,cursor:'pointer'}}>Live</button>
                <button onClick={()=>{setWorkspaceTab('browser');setBrowserMode('docked');setMobileWorkspaceOpen(true);}} style={{padding:'7px 9px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:11,fontWeight:700,cursor:'pointer'}}>Browser</button>
                <button onClick={()=>{setWorkspaceTab('files');setMobileWorkspaceOpen(true);}} style={{padding:'7px 9px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:11,fontWeight:700,cursor:'pointer'}}>Files</button>
              </>}
              {!mob&&<>
                <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:sc(session.status)+'22',color:sc(session.status),fontWeight:700}}>{sl(session.status)}</span>
                {!workspaceOpen&&<button onClick={()=>setWorkspaceOpen(true)} aria-label="Show Work workspace" style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  <span style={{width:7,height:7,borderRadius:'50%',background:c.ac}}/> Live · Browser · Files
                </button>}
              </>}
            </div>

            <div style={{flex:1,overflowY:'auto'}}>
              <div className="managed-thread">
              {/* Clarify prompt */}
              {clarify&&(
                <div style={{background:'linear-gradient(135deg,#1a0a2e,#2d1b4e)',borderRadius:14,border:'1px solid rgba(244,162,97,0.3)',padding:18}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#F4A261',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.5px'}}>🤔 {aFN} needs your input</div>
                  <div style={{fontSize:14,color:'#fff',marginBottom:14,lineHeight:1.5}}>{clarify.question}</div>
                  {clarify.options?.length>0?(
                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                      {clarify.options.map((opt,i)=>(
                        <button key={i} onClick={()=>answerClarify(opt)} style={{padding:'8px 16px',borderRadius:8,border:'1px solid rgba(244,162,97,0.4)',background:'rgba(244,162,97,0.1)',color:'#F4A261',fontSize:13,cursor:'pointer',fontWeight:500}}>{opt}</button>
                      ))}
                    </div>
                  ):(
                    <div style={{display:'flex',gap:8}}>
                      <input id="clarify-ans" placeholder="Type your answer…" style={{flex:1,padding:'8px 12px',borderRadius:8,border:'1px solid rgba(244,162,97,0.4)',background:'rgba(255,255,255,0.05)',color:'#fff',fontSize:13,outline:'none'}}/>
                      <button onClick={()=>{const v=document.getElementById('clarify-ans')?.value;if(v)answerClarify(v);}} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#F4A261',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>Send</button>
                    </div>
                  )}
                </div>
              )}

              {/* Checklist */}
              {checklist.length>0&&(
                <div style={{background:c.cd,borderRadius:14,border:'1px solid '+c.ln,padding:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>Checklist</div>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {checklist.map((item,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:15,flexShrink:0}}>{item.status==='complete'?'✅':item.status==='in_progress'?'⏳':'○'}</span>
                        <span style={{fontSize:13,color:item.status==='complete'?c.so:c.tx,textDecoration:item.status==='complete'?'line-through':'none',lineHeight:1.4}}>{item.step_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ExecutionCommandCards c={c} sessionId={activeSid} source="work"/>

              {msgs.length===0
                ?<div style={{color:c.so,fontSize:13,textAlign:'center',padding:'32px 0'}}>{session.status==='queued'?'Queued — starting soon…':'Waiting for progress…'}</div>
                :msgs.map((m,i)=><ManagedMessage key={m.id||i} message={m} c={c} aFN={aFN} agent={agent} user={user}/>)}
              <div ref={logRef}/>
              </div>
            </div>
          </div>
        )}

        {/* ── Chat bar ── */}
        <input ref={imgRef} type="file" multiple accept="image/*,.pdf,.txt,.docx" style={{display:'none'}} onChange={e=>{
          const files=Array.from(e.target.files||[]);
          files.forEach(file=>{
            const reader=new FileReader();
            reader.onload=ev=>setPendingImgs(p=>[...p,{name:file.name,type:file.type,data:ev.target.result}]);
            reader.readAsDataURL(file);
          });
          e.target.value='';
        }}/>
        {pendingImgs.length>0&&(
          <div style={{display:'flex',gap:6,padding:'6px 16px',background:c.cd,borderTop:'1px solid '+c.ln,flexWrap:'wrap'}}>
            {pendingImgs.map((img,i)=>(
              <div key={i} style={{position:'relative',display:'inline-flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:8,background:c.bg,border:'1px solid '+c.ln,fontSize:12,color:c.tx2}}>
                {img.type&&img.type.startsWith('image/')
                  ?<img src={img.data} style={{width:32,height:32,objectFit:'cover',borderRadius:4}}/>
                  :<span style={{fontSize:16}}>&#x1F4C4;</span>}
                <span style={{maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{img.name}</span>
                <button onClick={()=>setPendingImgs(p=>p.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:c.tx2,padding:0,fontSize:14,lineHeight:1}}>&#x2715;</button>
              </div>
            ))}
          </div>
        )}
        <div className="managed-composer" style={{borderTop:'1px solid '+c.ln,background:c.cd,flexShrink:0}}>
          <div style={{display:'flex',gap:6,alignItems:'flex-end',padding:'8px 10px',borderRadius:16,border:'1.5px solid '+c.ln,background:c.bg}}>
            <div style={{position:'relative',flexShrink:0}}>
              <button onClick={()=>setShowWorkPlusMenu(open=>!open)} style={{width:30,height:30,borderRadius:8,border:'none',background:showWorkPlusMenu?c.sf:'none',color:showWorkPlusMenu?c.ac:c.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}} title="Add">+</button>
              {showWorkPlusMenu&&<>
                <div onClick={()=>setShowWorkPlusMenu(false)} style={{position:'fixed',inset:0,zIndex:998}}/>
                <div data-testid="work-plus-menu" style={{position:'absolute',bottom:40,left:0,zIndex:999,width:260,borderRadius:14,border:'1px solid '+c.ln,background:c.cd,boxShadow:'0 8px 32px rgba(0,0,0,.25)',overflow:'hidden',padding:'6px 0'}}>
                  <div style={{padding:'6px 14px 4px',fontSize:11,fontWeight:700,color:c.fa,letterSpacing:'.06em',textTransform:'uppercase'}}>Files</div>
                  {[
                    {icon:'📎',label:'Add files or photos',action:()=>{imgRef.current?.click();setShowWorkPlusMenu(false);}},
                    {icon:'△',label:'Choose from Google Drive',action:()=>{setWorkDriveOpen(true);setShowWorkPlusMenu(false);}},
                    {icon:'▣',label:'Take a screenshot',action:takeWorkScreenshot},
                  ].map(item=><button key={item.label} onClick={item.action} style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'9px 14px',border:'none',background:'transparent',cursor:'pointer',color:c.tx,fontSize:13,textAlign:'left'}}><span style={{color:c.so,width:18}}>{item.icon}</span>{item.label}</button>)}
                  <div style={{height:1,background:c.ln,margin:'4px 0'}}/>
                  <div style={{padding:'6px 14px 4px',fontSize:11,fontWeight:700,color:c.fa,letterSpacing:'.06em',textTransform:'uppercase'}}>Start</div>
                  {[
                    {label:'Build a website',sub:'Starts coding work',action:()=>{startFreshWork();setChatInput('Build a website: ');}},
                    {label:'New work task',sub:'Starts a new Work session',action:startFreshWork},
                  ].map(item=><button key={item.label} onClick={item.action} style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'9px 14px',border:'none',background:'transparent',cursor:'pointer',color:c.tx,fontSize:13,textAlign:'left'}}><span style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#F4A261,#E76F8B)',display:'grid',placeItems:'center',color:'#fff'}}>+</span><span><span style={{display:'block',fontWeight:600}}>{item.label}</span><span style={{display:'block',fontSize:11,color:c.so,marginTop:1}}>{item.sub}</span></span></button>)}
                  <div style={{height:1,background:c.ln,margin:'4px 0'}}/>
                  <div style={{padding:'6px 14px 4px',fontSize:11,fontWeight:700,color:c.fa,letterSpacing:'.06em',textTransform:'uppercase'}}>Connectors</div>
                  <button onClick={()=>{setShowWorkPlusMenu(false);onNavigate?.('customize');}} style={{width:'100%',padding:'9px 14px',border:'none',background:'transparent',cursor:'pointer',textAlign:'left',fontSize:13,fontWeight:700,color:c.ac}}>Manage connectors →</button>
                </div>
              </>}
            </div>
            <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}}} placeholder={activeSid?`Message ${aFN}\u2026`:`Describe your task and ${aFN} will get started\u2026`} rows={1} style={{flex:1,padding:'4px 0',border:'none',background:'transparent',color:c.tx,fontSize:13,fontFamily:'inherit',resize:'none',outline:'none',lineHeight:1.4,maxHeight:120,overflowY:'auto'}}/>
            <button onClick={sendChat} disabled={(!chatInput.trim()&&!pendingImgs.length)||chatSending} style={{width:32,height:32,borderRadius:10,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:(chatInput.trim()||pendingImgs.length)&&!chatSending?1:0.5,flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
            </button>
          </div>
        </div>
      </div>
      {!mob&&workspaceOpen&&(
        <ResizablePanel c={c} defaultWidth={430} minWidth={300} maxWidth={800}>
          <WorkWorkspacePanel
            c={c}
            mob={false}
            tab={workspaceTab}
            setTab={setWorkspaceTab}
            sessionId={activeSid}
            setActiveArtifact={setActiveArtifact}
            aFN={aFN}
            agentId={agentId}
            agent={agent}
            browserMode={browserMode}
            setBrowserMode={mode=>setBrowserMode(mode==='hidden'?'docked':mode)}
            lastAgentText={msgs.filter(message=>message.role==='assistant').slice(-1)[0]?.content||''}
            onClose={()=>setWorkspaceOpen(false)}
          />
        </ResizablePanel>
      )}
      {mob&&mobileWorkspaceOpen&&(
        <WorkWorkspacePanel
          c={c}
          mob
          tab={workspaceTab}
          setTab={setWorkspaceTab}
          sessionId={activeSid}
          setActiveArtifact={setActiveArtifact}
          aFN={aFN}
          agentId={agentId}
          agent={agent}
          browserMode={browserMode}
          setBrowserMode={mode=>mode==='hidden'?setMobileWorkspaceOpen(false):setBrowserMode(mode)}
          lastAgentText={msgs.filter(message=>message.role==='assistant').slice(-1)[0]?.content||''}
          onClose={()=>setMobileWorkspaceOpen(false)}
        />
      )}
      {activeArtifact&&<div style={{position:'fixed',inset:0,zIndex:9100,background:c.bg,display:'flex'}}><ArtifactPane art={activeArtifact} c={c} onClose={()=>setActiveArtifact(null)} onRequestChanges={()=>setActiveArtifact(null)}/></div>}
      {workDriveOpen&&<GoogleDrivePicker c={c} multiple onClose={()=>setWorkDriveOpen(false)} onSelect={file=>setPendingImgs(p=>[...p,{name:file.name,type:file.type,data:`data:${file.type};base64,${file.data}`,source:'google_drive'}])}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BUILD TAB — Claude Code-style Managed Agent build environment
// Left: build list  |  Right: build phases + checklist + output + deploy
// ══════════════════════════════════════════════════════════════════════════════
// BUILD TAB — Claude Code-style conversation + artifact preview
// Left: build list  |  Center: conversation thread + chat bar  |  Right: artifact
// ══════════════════════════════════════════════════════════════════════════════
function ProjectWorkspacePage({c,mob,project,onBack,onProjectUpdate,onOpenChat,onOpenWork}){
  const [workspace,setWorkspace]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [settings,setSettings]=useState({
    repositoryOwner:project.repository_owner||'',
    repositoryName:project.repository_name||'',
    repositoryDefaultBranch:project.repository_default_branch||'',
    vercelProjectId:project.vercel_project_id||'',
    workspaceInstructions:project.workspace_instructions||'',
  });

  const load=async()=>{
    setLoading(true);
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/projects/${project.id}/workspace`,{headers:h});
      const d=await r.json();
      if(r.ok)setWorkspace(d);
    }catch(e){console.error('Project workspace load failed',e);}
    setLoading(false);
  };
  useEffect(()=>{load();},[project.id]);

  const save=async()=>{
    setSaving(true);
    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/projects/${project.id}`,{method:'PATCH',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(settings)});
      const d=await r.json();
      if(r.ok&&d.project){onProjectUpdate(d.project);await load();}
    }catch(e){console.error('Project settings save failed',e);}
    setSaving(false);
  };
  const summary=workspace?.summary||{};
  const card={padding:mob?14:18,borderRadius:14,border:'1px solid '+c.ln,background:c.cd};
  const field={width:'100%',padding:'9px 11px',borderRadius:9,border:'1px solid '+c.ln,background:c.inp,color:c.tx,fontSize:mob?16:13,fontFamily:'inherit'};

  return <div style={{height:'100%',overflowY:'auto',padding:mob?'12px 12px 80px':'20px 24px 60px',background:c.bg}}>
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
      <button onClick={onBack} style={{width:36,height:36,borderRadius:9,border:'1px solid '+c.ln,background:c.cd,color:c.tx,cursor:'pointer'}}>←</button>
      <div style={{flex:1,minWidth:0}}>
        <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{project.name}</h1>
        <div style={{fontSize:12,color:c.so,marginTop:2}}>{project.description||'Project workspace'}</div>
      </div>
      <button onClick={()=>onOpenWork(null)} style={{padding:'9px 14px',borderRadius:9,border:'none',background:c.gradient,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Work</button>
    </div>

    <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(5,1fr)',gap:8,marginBottom:14}}>
      {[['Chats',summary.conversations||0],['Work',summary.workSessions||0],['Running',summary.running||0],['Artifacts',summary.artifacts||0],['Deployments',summary.deployments||0]].map(([label,value])=>
        <div key={label} style={{...card,padding:12}}><div style={{fontSize:20,fontWeight:800,color:c.tx}}>{value}</div><div style={{fontSize:10,color:c.so,textTransform:'uppercase',letterSpacing:.5}}>{label}</div></div>
      )}
    </div>

    <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'minmax(280px, .8fr) minmax(0, 1.6fr)',gap:14,alignItems:'start'}}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={card}>
          <div style={{fontSize:13,fontWeight:700,color:c.tx,marginBottom:12}}>Project workspace settings</div>
          {[['GitHub owner','repositoryOwner'],['Repository','repositoryName'],['Base branch','repositoryDefaultBranch'],['Vercel project','vercelProjectId']].map(([label,key])=>
            <label key={key} style={{display:'block',fontSize:11,color:c.so,marginBottom:10}}>{label}<input value={settings[key]} onChange={e=>setSettings(s=>({...s,[key]:e.target.value}))} placeholder={key==='repositoryDefaultBranch'?'main':''} style={{...field,marginTop:5}}/></label>
          )}
          <label style={{display:'block',fontSize:11,color:c.so}}>Persistent instructions<textarea value={settings.workspaceInstructions} onChange={e=>setSettings(s=>({...s,workspaceInstructions:e.target.value}))} rows={4} style={{...field,marginTop:5,resize:'vertical'}}/></label>
          <button onClick={save} disabled={saving} style={{width:'100%',padding:'9px',marginTop:10,borderRadius:9,border:'none',background:c.ac,color:'#fff',fontSize:12,fontWeight:700,cursor:saving?'wait':'pointer'}}>{saving?'Saving…':'Save workspace'}</button>
        </div>

        <div style={card}>
          <div style={{fontSize:13,fontWeight:700,color:c.tx,marginBottom:10}}>Conversations</div>
          {(workspace?.conversations||[]).length===0?<div style={{fontSize:12,color:c.so}}>No Project chats yet.</div>:(workspace.conversations||[]).slice(0,8).map(chat=>
            <button key={chat.id} onClick={()=>onOpenChat(chat.id)} style={{width:'100%',padding:'9px 0',border:'none',borderTop:'1px solid '+c.ln,background:'transparent',color:c.tx,textAlign:'left',fontSize:12,cursor:'pointer'}}>{chat.title||'Untitled chat'}<span style={{float:'right',color:c.fa}}>Open →</span></button>
          )}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div style={{fontSize:13,fontWeight:700,color:c.tx}}>Work sessions</div><button onClick={load} style={{border:'none',background:'transparent',color:c.ac,cursor:'pointer',fontSize:12}}>Refresh</button></div>
          {loading?<div style={{padding:24,textAlign:'center',color:c.so,fontSize:12}}>Loading workspace…</div>:(workspace?.workSessions||[]).length===0?<div style={{padding:24,textAlign:'center',color:c.so,fontSize:12}}>No Work sessions yet. Start one from this Project.</div>:(workspace.workSessions||[]).map(work=>{
            const todo=work.checkpoint?.todos||[];
            const passed=todo.filter(item=>item.status==='completed').length;
            const repo=work.repository?`${work.repository.owner}/${work.repository.name}`:null;
            const deployUrl=work.deployment?.url ? (String(work.deployment.url).startsWith('http')?work.deployment.url:`https://${work.deployment.url}`) : work.output_url;
            return <div key={work.id} style={{padding:'13px 0',borderTop:'1px solid '+c.ln}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:work.status==='complete'?c.gr:['building','queued'].includes(work.status)?c.ac:'#ef4444'}}/>
                <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:700,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{work.title}</div>
                <span style={{fontSize:10,color:c.so}}>{work.status}</span>
                <button onClick={()=>onOpenWork(work.id)} style={{padding:'5px 8px',borderRadius:7,border:'1px solid '+c.ln,background:c.sf,color:c.ac,fontSize:10,fontWeight:700,cursor:'pointer'}}>Open →</button>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:7,fontSize:10,color:c.so}}>
                {repo&&<span>◫ {repo}</span>}
                {(work.branch||work.repository?.baseBranch)&&<span>⑂ {work.branch||work.repository.baseBranch}</span>}
                {todo.length>0&&<span>✓ {passed}/{todo.length} checks</span>}
                {work.commit&&<span>● {String(work.commit).slice(0,7)}</span>}
                {work.artifacts?.length>0&&<span>▣ {work.artifacts.length} artifacts</span>}
                {deployUrl&&<a href={deployUrl} target="_blank" rel="noopener" style={{color:c.ac,textDecoration:'none'}}>↗ deployment</a>}
              </div>
              {work.checkpoint?.current_step&&<div style={{fontSize:11,color:c.so,marginTop:7,lineHeight:1.4}}>Current: {work.checkpoint.current_step}</div>}
              {work.checkpoint?.last_error&&<div style={{fontSize:11,color:'#ef4444',marginTop:6}}>{work.checkpoint.last_error}</div>}
            </div>;
          })}
        </div>

        <div style={card}>
          <div style={{fontSize:13,fontWeight:700,color:c.tx,marginBottom:10}}>Artifacts</div>
          {(workspace?.artifacts||[]).length===0?<div style={{fontSize:12,color:c.so}}>Files created by Project Work sessions appear here.</div>:<div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(2,minmax(0,1fr))',gap:8}}>{workspace.artifacts.map(artifact=>
            <a key={artifact.id} href={`/api/files/download/${artifact.id}`} style={{padding:10,borderRadius:10,border:'1px solid '+c.ln,background:c.sf,textDecoration:'none',color:c.tx,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>▣ {artifact.name}</a>
          )}</div>}
        </div>
      </div>
    </div>
  </div>;
}

function BuildTab({c,mob,aFN="Bloomie"}){
  const [builds,setBuilds]=useState([]);
  const [loadError,setLoadError]=useState('');
  const [activeId,setActiveId]=useState(null);
  const [build,setBuild]=useState(null);
  const [msgs,setMsgs]=useState([]);
  const [checklist,setChecklist]=useState([]);
  const [clarify,setClarify]=useState(null);
  const [chatInput,setChatInput]=useState('');
  const [chatSending,setChatSending]=useState(false);
  const [pendingImgs,setPendingImgs]=useState([]);
  const [activeArtifact,setActiveArtifact]=useState(null);
  const pollRef=useRef(null);
  const logRef=useRef(null);
  const imgRef=useRef(null);

  useEffect(()=>{loadBuilds();},[]);
  useEffect(()=>{logRef.current?.scrollIntoView({behavior:'smooth'});},[msgs]);

  useEffect(()=>{
    if(!activeId)return;
    loadDetail(activeId);
    if(pollRef.current)clearInterval(pollRef.current);
    pollRef.current=setInterval(()=>loadDetail(activeId),2500);
    return()=>clearInterval(pollRef.current);
  },[activeId]);

  const loadBuilds=async()=>{
    try{
      setLoadError('');
      const h=await getAuthHeaders();
      const r=await fetch('/api/builds?type=build',{headers:h});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||`Build list failed (${r.status})`);
      setBuilds(d.builds||[]);
      if(!activeId&&d.builds?.length){setActiveId(d.builds[0].id);}
    }catch(e){console.error(e);setLoadError(e.message||'Could not load builds');}
  };

  const loadDetail=async(id)=>{
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/builds/'+id,{headers:h});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||`Build failed to load (${r.status})`);
      setLoadError('');
      setBuild(d.build||null);
      setMsgs(d.messages||[]);
      setChecklist(d.progress||[]);
      setClarify(d.clarify||null);
      if(d.build?.status==='complete'||d.build?.status==='error'){
        clearInterval(pollRef.current);
        setBuilds(p=>p.map(b=>b.id===d.build.id?{...b,...d.build}:b));
      }
    }catch(e){console.error(e);setLoadError(e.message||'Could not load this build');}
  };

  const sendChat=async()=>{
    const msg=chatInput.trim();
    const imgs=[...pendingImgs];
    if(!msg&&!imgs.length||chatSending)return;
    setChatInput('');setPendingImgs([]);setChatSending(true);
    setMsgs(p=>[...p,{role:'user',content:msg,images:imgs,ts:Date.now()}]);
    try{
      const h=await getAuthHeaders();
      let url=activeId?'/api/builds/'+activeId+'/message':'/api/builds';
      const body=activeId?{message:msg,images:imgs}:{brief:msg,title:msg.slice(0,60),type:'build',images:imgs};
      const r=await fetch(url,{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Build request failed');
      if(!activeId&&d.build?.id){setChecklist([]);await loadBuilds();setActiveId(d.build.id);}
      else if(activeId){loadDetail(activeId);}
    }catch(e){
      console.error(e);
      setMsgs(p=>[...p,{role:'assistant',content:`Could not send that yet: ${e.message}`,metadata:{source:'ui-error'},ts:Date.now()}]);
    }
    finally{setChatSending(false);}
  };

  const answerClarify=async(ans)=>{
    if(!activeId)return;
    setClarify(null);setChatSending(true);
    setMsgs(p=>[...p,{role:'user',content:ans,ts:Date.now()}]);
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/builds/'+activeId+'/clarify',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({answer:ans,clarify_id:clarify?.id})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Could not submit your answer');
      setTimeout(()=>loadDetail(activeId),1000);
    }catch(e){console.error(e);setLoadError(e.message||'Could not submit your answer');}
    finally{setChatSending(false);}
  };

  // Extract latest HTML artifact from agent messages
  const latestHtml=(()=>{
    const rev=[...msgs].reverse();
    const m=rev.find(m=>m.role!=='user'&&/```html[\s\S]*?```/i.test(m.content||''));
    if(!m)return null;
    const match=(m.content||'').match(/```html\n?([\s\S]*?)```/i);
    return match?match[1]:null;
  })();

  // Render a single message (agent or user)
  const renderMsg=(m,i)=>{
    const isUser=m.role==='user';
    const attachments=m.images||m.files||[];
    if(isUser){
      return(
        <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'flex-end',marginBottom:12}}>
          {attachments.length>0&&(
            <div style={{display:'flex',gap:6,marginBottom:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {attachments.map((img,j)=>(
                img.type&&img.type.startsWith('image/')&&img.data
                  ?<img key={j} src={img.data} style={{maxWidth:180,maxHeight:120,borderRadius:8,objectFit:'cover'}}/>
                  :<div key={j} style={{padding:'4px 10px',borderRadius:8,background:c.cd,border:'1px solid '+c.ln,fontSize:12,color:c.tx2}}>{img.type?.startsWith('image/')?'🖼️':'📄'} {img.name}</div>
              ))}
            </div>
          )}
          {m.content&&<div style={{maxWidth:'75%',padding:'10px 14px',borderRadius:'18px 18px 4px 18px',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:13,lineHeight:1.5,wordBreak:'break-word'}}>{m.content}</div>}
        </div>
      );
    }
    // Agent message — parse code blocks
    const parts=[];
    let lastIdx=0;
    const codeRe=/```(\w*)\n?([\s\S]*?)```/g;
    let match;
    const raw=m.content||'';
    while((match=codeRe.exec(raw))!==null){
      if(match.index>lastIdx){
        parts.push({type:'text',content:raw.slice(lastIdx,match.index)});
      }
      parts.push({type:'code',lang:match[1]||'text',content:match[2]});
      lastIdx=match.index+match[0].length;
    }
    if(lastIdx<raw.length)parts.push({type:'text',content:raw.slice(lastIdx)});
    return(
      <div key={i} style={{display:'flex',gap:8,marginBottom:12,alignItems:'flex-start'}}>
        <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#F4A261,#E76F8B)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',flexShrink:0,marginTop:2}}>B</div>
        <div style={{flex:1,minWidth:0}}>
          {parts.map((p,pi)=>p.type==='text'
            ?<p key={pi} style={{margin:'0 0 6px',fontSize:13,lineHeight:1.6,color:c.tx,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{p.content}</p>
            :(
              <div key={pi} style={{marginBottom:8,borderRadius:8,overflow:'hidden',border:'1px solid #30363d'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 12px',background:'#161b22',fontSize:11,color:'#F4A261'}}>
                  <span>{p.lang||'code'}</span>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>navigator.clipboard?.writeText(p.content)} style={{background:'none',border:'none',color:'#F4A261',cursor:'pointer',fontSize:11,padding:0}}>Copy</button>
                    {(p.lang==='html'||p.lang==='HTML')&&<button onClick={()=>{}} style={{background:'none',border:'none',color:'#E76F8B',cursor:'pointer',fontSize:11,padding:0}}>Preview</button>}
                  </div>
                </div>
                <pre style={{margin:0,padding:'12px',background:'#0d1117',color:'#e6edf3',fontSize:12,lineHeight:1.5,overflowX:'auto',fontFamily:"'Fira Code','Cascadia Code','Courier New',monospace"}}><code>{p.content}</code></pre>
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  const statusColor={'queued':'#F4A261','building':'#F4A261','pending':'#F4A261','running':'#F4A261','complete':'#10B981','completed':'#10B981','error':'#EF4444','failed':'#EF4444','paused':'#6B7280'}[build?.status]||c.tx2;
  const phases=['planning','coding','testing','deploying'];
  const phaseLabels={planning:'Planning',coding:'Building',testing:'Testing',deploying:'Deploying'};
  const rawPhaseIdx=phases.indexOf(build?.phase);
  const phaseIdx=build?.status==='complete'||build?.status==='completed'
    ? phases.length
    : rawPhaseIdx>=0
      ? rawPhaseIdx
      : (build?.status==='building'||build?.status==='running'||build?.status==='pending'||build?.status==='queued') ? 0 : -1;
  const currentChecklistItem=checklist.find(t=>t.status==='in_progress')||checklist.find(t=>t.status!=='complete');
  const completedSteps=checklist.filter(t=>t.status==='complete').length;
  const progressPct=checklist.length
    ? Math.round((completedSteps/checklist.length)*100)
    : phaseIdx>=0
      ? Math.min(100,Math.round((phaseIdx/phases.length)*100))
      : 0;
  const currentStepText=currentChecklistItem?.step_name||phaseLabels[build?.phase]||(
    build?.status==='complete'||build?.status==='completed'?'Complete':
    build?.status==='error'||build?.status==='failed'?'Needs attention':
    'Starting'
  );

  return(
    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
      <ManagedWorkspaceStyles/>

      {/* ── Sidebar: build list ── */}
      {!mob&&<div style={{width:260,borderRight:'1px solid '+c.ln,display:'flex',flexDirection:'column',background:c.cd,flexShrink:0}}>
        <div style={{padding:'14px 16px 10px',borderBottom:'1px solid '+c.ln,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,fontWeight:600,color:c.tx}}>Builds</span>
          <button onClick={()=>{setActiveId(null);setBuild(null);setMsgs([]);setChecklist([]);}} style={{fontSize:11,padding:'3px 10px',borderRadius:8,border:'1px solid '+c.ln,background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',cursor:'pointer'}}>+ New</button>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {builds.length===0&&<div style={{padding:'20px 16px',fontSize:12,color:c.tx2,textAlign:'center'}}>No builds yet.<br/>Start a new build below.</div>}
          {builds.map(b=>(
            <div key={b.id} onClick={()=>setActiveId(b.id)} style={{padding:'10px 16px',cursor:'pointer',borderBottom:'1px solid '+c.ln,background:activeId===b.id?c.bg:'transparent',borderLeft:activeId===b.id?'3px solid #F4A261':'3px solid transparent'}}>
              <div style={{fontSize:13,fontWeight:500,color:c.tx,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.title||b.brief||'Build #'+b.id?.slice(-6)}</div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:11,color:{'queued':'#F4A261','building':'#F4A261','complete':'#10B981','error':'#EF4444','pending':'#F4A261','running':'#F4A261','completed':'#10B981','failed':'#EF4444'}[b.status]||c.tx2}}>{b.status||'pending'}</span>
                <span style={{fontSize:11,color:c.tx2}}>{b.created_at?new Date(b.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'–'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* ── Main panel: conversation + chat bar ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:c.bg,minWidth:0}}>
        {mob&&(
          <div style={{padding:'8px 12px',borderBottom:'1px solid '+c.ln,background:c.cd,display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <select value={activeId||''} onChange={e=>setActiveId(e.target.value||null)} style={{flex:1,minWidth:0,padding:'7px 9px',borderRadius:8,border:'1px solid '+c.ln,background:c.sf,color:c.tx,fontSize:13}}>
              <option value="">New Build</option>
              {builds.map(b=><option key={b.id} value={b.id}>{b.title||b.brief||'Untitled'} — {b.status||'pending'}</option>)}
            </select>
            <button onClick={()=>{setActiveId(null);setBuild(null);setMsgs([]);setChecklist([]);setClarify(null);}} style={{padding:'7px 11px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontSize:12,fontWeight:700}}>+ New</button>
          </div>
        )}
        {loadError&&(
          <div style={{margin:'10px 14px 0',padding:'9px 12px',borderRadius:10,border:'1px solid rgba(239,68,68,.35)',background:'rgba(239,68,68,.1)',color:'#ef4444',fontSize:12,display:'flex',alignItems:'center',gap:8}}>
            <span style={{flex:1}}>{loadError}</span>
            <button onClick={activeId?()=>loadDetail(activeId):loadBuilds} style={{border:'none',background:'transparent',color:'#ef4444',fontWeight:700,cursor:'pointer'}}>Retry</button>
          </div>
        )}

        {!activeId&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:40}}>
            <div style={{fontSize:40}}>&#x1F528;</div>
            <div style={{fontSize:16,fontWeight:600,color:c.tx}}>Start a new build</div>
            <div style={{fontSize:13,color:c.tx2,textAlign:'center',maxWidth:320}}>Describe what you want to build and {aFN} will plan, code, and deploy it for you.</div>
          </div>
        )}

        {activeId&&build&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Header */}
            <div className="managed-session-header" style={{padding:'12px 16px',borderBottom:'1px solid '+c.ln,flexShrink:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:14,fontWeight:600,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,minWidth:0}}>{build.title||build.brief||'Build in progress'}</span>
                <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:10}}>
                  <ManagedArtifacts sessionId={activeId} c={c} mob={mob} onOpen={setActiveArtifact}/>
                  {!mob&&<span style={{fontSize:12,fontWeight:600,color:statusColor,textTransform:'capitalize'}}>{build.status||'pending'}</span>}
                </div>
              </div>
              <div style={{display:'flex',gap:4}}>
                {phases.map((ph,pi)=>{
                  const done=phaseIdx>pi;
                  const active=phaseIdx===pi;
                  return(
                    <div key={ph} style={{flex:1,height:4,borderRadius:2,background:done?'#10B981':active?'#F4A261':c.ln,transition:'background 0.3s'}}/>
                  );
                })}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,minWidth:0}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:statusColor,flexShrink:0,animation:(build.status==='building'||build.status==='running')?'pulse 1.5s ease infinite':'none'}}/>
                <span style={{fontSize:11,color:c.so,whiteSpace:'nowrap'}}>Current step</span>
                <span style={{fontSize:12,color:c.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0,flex:1}}>{currentStepText}</span>
                <span style={{fontSize:11,color:c.so,flexShrink:0}}>{progressPct}%</span>
              </div>
              {build.output_url&&<div style={{marginTop:6}}><a href={build.output_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#F4A261',textDecoration:'none'}}>&#x1F517; Open preview ↗</a></div>}
            </div>
            {/* Conversation thread */}
            <div style={{flex:1,overflowY:'auto'}}>
              <div className="managed-thread">
              {checklist.length>0&&(
                <div style={{marginBottom:14,padding:'12px 14px',borderRadius:12,background:c.cd,border:'1px solid '+c.ln}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:c.so,textTransform:'uppercase',letterSpacing:'0.5px'}}>Progress</div>
                    <div style={{fontSize:11,color:c.so}}>{completedSteps} of {checklist.length} steps done</div>
                  </div>
                  <div style={{height:6,borderRadius:999,background:c.ln,overflow:'hidden',marginBottom:10}}>
                    <div style={{height:'100%',width:progressPct+'%',borderRadius:999,background:'linear-gradient(135deg,#F4A261,#E76F8B)',transition:'width .3s'}}/>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {checklist.slice(0,5).map((item,idx)=>{
                      const done=item.status==='complete';
                      const now=item.status==='in_progress';
                      return(
                        <div key={idx} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:done?c.so:c.tx,lineHeight:1.4}}>
                          <span style={{width:8,height:8,borderRadius:'50%',background:done?'#10B981':now?'#F4A261':c.ln,flexShrink:0,animation:now?'pulse 1.5s ease infinite':'none'}}/>
                          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:done?'line-through':'none'}}>{item.step_name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {msgs.length===0&&<div style={{textAlign:'center',color:c.tx2,fontSize:13,marginTop:40}}>Waiting for {aFN} to start...</div>}
              {msgs.map((m,i)=><ManagedMessage key={m.id||i} message={m} c={c} aFN={aFN}/>)}
              {clarify&&(
                <div style={{margin:'8px 0',padding:'12px 16px',borderRadius:12,background:'linear-gradient(135deg,rgba(244,162,97,0.14),rgba(231,111,139,0.14))',border:'1px solid rgba(244,162,97,0.3)'}}>
                  <div style={{fontSize:13,fontWeight:500,color:'#F4A261',marginBottom:8}}>&#x2753; {aFN} needs clarification</div>
                  <div style={{fontSize:13,color:c.tx,marginBottom:10}}>{clarify.question||clarify}</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {(clarify.options?.length?clarify.options:['Yes, proceed','No, adjust','Give me options']).map(opt=>(
                      <button key={opt} onClick={()=>answerClarify(opt)} style={{padding:'6px 12px',borderRadius:8,border:'1px solid rgba(244,162,97,0.4)',background:'rgba(244,162,97,0.1)',color:'#F4A261',cursor:'pointer',fontSize:12}}>{opt}</button>
                    ))}
                  </div>
                </div>
              )}
              {chatSending&&(
                <div style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:12}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#F4A261,#E76F8B)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',flexShrink:0}}>B</div>
                  <div style={{display:'flex',gap:4,padding:'10px 14px',borderRadius:'18px 18px 18px 4px',background:c.cd,alignItems:'center'}}>
                    {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:'50%',background:c.tx2,display:'inline-block',animation:'bounce 1.2s ease-in-out '+[0,0.2,0.4][i]+'s infinite'}}/>)}
                  </div>
                </div>
              )}
              <div ref={logRef}/>
              </div>
            </div>
          </div>
        )}

        {/* File input (hidden) */}
        <input ref={imgRef} type="file" multiple accept="image/*,.pdf,.txt,.docx" style={{display:'none'}} onChange={e=>{
          const files=Array.from(e.target.files||[]);
          files.forEach(file=>{
            const reader=new FileReader();
            reader.onload=ev=>setPendingImgs(p=>[...p,{name:file.name,type:file.type,data:ev.target.result}]);
            reader.readAsDataURL(file);
          });
          e.target.value='';
        }}/>

        {/* Pending image previews */}
        {pendingImgs.length>0&&(
          <div style={{display:'flex',gap:6,padding:'6px 16px',background:c.cd,borderTop:'1px solid '+c.ln,flexWrap:'wrap',flexShrink:0}}>
            {pendingImgs.map((img,i)=>(
              <div key={i} style={{position:'relative',display:'inline-flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:8,background:c.bg,border:'1px solid '+c.ln,fontSize:12,color:c.tx2}}>
                {img.type&&img.type.startsWith('image/')
                  ?<img src={img.data} style={{width:32,height:32,objectFit:'cover',borderRadius:4}}/>
                  :<span style={{fontSize:16}}>&#x1F4C4;</span>}
                <span style={{maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{img.name}</span>
                <button onClick={()=>setPendingImgs(p=>p.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:c.tx2,padding:0,fontSize:14,lineHeight:1}}>&#x2715;</button>
              </div>
            ))}
          </div>
        )}

        {/* Chat bar — always at bottom of main column */}
        <div className="managed-composer" style={{borderTop:'1px solid '+c.ln,background:c.cd,flexShrink:0}}>
          <div style={{display:'flex',gap:6,alignItems:'flex-end',padding:'8px 10px',borderRadius:16,border:'1.5px solid '+c.ln,background:c.bg}}>
            <button onClick={()=>imgRef.current?.click()} style={{width:30,height:30,borderRadius:8,border:'none',background:'none',color:c.tx2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}} title="Attach file">&#x1F4CE;</button>
            <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}}} placeholder={activeId?`Message ${aFN}\u2026`:`Describe what you want to build\u2026`} rows={1} style={{flex:1,padding:'4px 0',border:'none',background:'transparent',color:c.tx,fontSize:13,fontFamily:'inherit',resize:'none',outline:'none',lineHeight:1.4,maxHeight:120,overflowY:'auto'}}/>
            <button onClick={sendChat} disabled={(!chatInput.trim()&&!pendingImgs.length)||chatSending} style={{width:32,height:32,borderRadius:10,border:'none',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:(chatInput.trim()||pendingImgs.length)&&!chatSending?1:0.5,flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Artifact preview panel (right column, conditional) ── */}
      {!mob&&(latestHtml||build?.output_url)&&activeId&&(
        <div className="managed-desktop-artifact" style={{width:440,borderLeft:'1px solid '+c.ln,display:'flex',flexDirection:'column',background:c.cd,flexShrink:0}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid '+c.ln,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
            <span style={{fontSize:12,fontWeight:600,color:c.tx}}>Artifact Preview</span>
            {(build?.output_url||latestHtml)&&(
              <a href={build?.output_url||'#'} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#F4A261',textDecoration:'none'}}>Open &#x2197;</a>
            )}
          </div>
          {latestHtml
            ?<iframe srcDoc={latestHtml} sandbox="allow-scripts allow-same-origin" style={{flex:1,border:'none',background:'#fff',width:'100%'}} title="Artifact Preview"/>
            :<iframe src={build.output_url} sandbox="allow-scripts allow-same-origin allow-forms" style={{flex:1,border:'none',width:'100%'}} title="Build Preview"/>
          }
        </div>
      )}
      {activeArtifact&&<div style={{position:'fixed',inset:0,zIndex:9100,background:c.bg,display:'flex'}}><ArtifactPane art={activeArtifact} c={c} onClose={()=>setActiveArtifact(null)} onRequestChanges={()=>setActiveArtifact(null)}/></div>}

    </div>
  );
}

function App({ authUser, passwordRecovery = false }) {
  const isDesktopShell = Boolean(window.bloomDesktop?.isDesktop);
  const [desktopBridgeReady,setDesktopBridgeReady]=useState(false);
  const [activeWorkSessionId,setActiveWorkSessionId]=useState(null);
  const [newWorkSessionNonce,setNewWorkSessionNonce]=useState(0);
  const [newWorkProjectId,setNewWorkProjectId]=useState('');
  useEffect(()=>{
    if(!isDesktopShell)return;
    let active=true;
    const check=async()=>{
      try{
        const status=await window.bloomDesktop.getStatus();
        if(active)setDesktopBridgeReady(Boolean(status?.running));
      }catch{
        if(active)setDesktopBridgeReady(false);
      }
    };
    check();
    const timer=setInterval(check,5000);
    return()=>{active=false;clearInterval(timer);};
  },[isDesktopShell]);
  const W=useW();
  const mob=W<768;
  // Three responsive tiers: phone, compact laptop/tablet, and full desktop.
  // Compact layouts preserve chat width by collapsing secondary navigation/panels.
  const compact=W<1200;
  const [dark,setDark]=useState(true);
  const c=useMemo(()=>mk(dark),[dark]);

  const sse=useSSE();
  const agentOnline=useAgentOnline();
  const {crmUrl,contactsUrl}=useCRMLink();
  const {messages,setMessages,send,sendFiles,sendFilesEncoded,loading,workingStatus,sessions,setSessions,currentSessionId,newSession,loadSession,deleteSession,fetchSessions,stopSarah,sid,agents,currentAgentId,currentAgent,switchAgent}=useSarahChat();
  const [readStateVersion,setReadStateVersion]=useState(0);
  useEffect(()=>{
    const refresh=()=>setReadStateVersion(value=>value+1);
    window.addEventListener('bloomie-read-state-changed',refresh);
    window.addEventListener('storage',refresh);
    return()=>{window.removeEventListener('bloomie-read-state-changed',refresh);window.removeEventListener('storage',refresh);};
  },[]);
  useEffect(()=>{seedConversationReads('chat',sessions,3);setReadStateVersion(value=>value+1);},[sessions]);
  const currentAgentIdRef=useRef(currentAgentId);
  const voiceTranscriptSeenRef=useRef(new Set());
  const voiceRecognitionRef=useRef(null);
  useEffect(()=>{ currentAgentIdRef.current=currentAgentId; },[currentAgentId]);
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
      const teammates=agents.filter(x=>x.id!==a.id).map(x=>`${x.name}${x.role?` (${x.role})`:''}`).join(', ');
      const ownRole=a.role?` Your role is ${a.role}.`:'';
      const ctx=`[You are ${a.name} in a group chat with the client and ${teammates}.${ownRole} Thread so far:\n${thread}\n\nRespond naturally as ${a.name}, from your own role and responsibilities. Do not repeat another agent's answer; add your distinct perspective, next step, or say nothing if another agent already covered it. If another team member asked you a question or made a point, engage with them directly — you can talk to each other without waiting for the client. Keep it conversational and collaborative. If the message has nothing to do with you, stay silent.]`;
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

  const [pg,setPg]=useState(()=>{
    if(passwordRecovery || new URLSearchParams(window.location.search).get("reset")==="1") return "settings";
    if(window.location.pathname.startsWith("/book")) return "book";
    return window.location.pathname.startsWith("/projects")?"projects":"chat";
  });
  useEffect(()=>{
    if(pg!=='chat'||!currentSessionId)return;
    const active=sessions.find(session=>session.id===currentSessionId);
    markConversationRead('chat',currentSessionId,active?.updated_at||Date.now());
  },[pg,currentSessionId,messages.length,sessions]);
  const [mobileMoreOpen,setMobileMoreOpen]=useState(false);
  const [tx,setTx]=useState("");
  const [isNew,setNew]=useState(true);
  const [vcRec,setVcRec]=useState(false);
  const [showPlusMenu,setShowPlusMenu]=useState(false);
  const [showThinking,setShowThinking]=useState(false);
  const plusMenuRef=useRef(null);
  const [oauthToast,setOauthToast]=useState(null);
  const [activeConnectors,setActiveConnectors]=useState({});
  const [connectorCatalog,setConnectorCatalog]=useState({});
  const [ghlConnected,setGhlConnected]=useState(null); // null=checking, true=ok, false=not connected
  const [showGhlBanner,setShowGhlBanner]=useState(false);
  const [ghlPit,setGhlPit]=useState('');
  const [ghlLocId,setGhlLocId]=useState('');
  const [ghlSaving,setGhlSaving]=useState(false);
  const [showHeygenConnect,setShowHeygenConnect]=useState(false);
  const [heygenApiKey,setHeygenApiKey]=useState('');
  const [heygenSaving,setHeygenSaving]=useState(false);
  const [heygenError,setHeygenError]=useState('');
  const [convaiStarting,setConvaiStarting]=useState(false);
  const [convaiError,setConvaiError]=useState('');
  const appendVoiceTranscript=useCallback((payload)=>{
    const text=String(payload?.message||'').trim();
    const role=payload?.role==="agent"||payload?.role==="assistant"||payload?.source==="ai"?"agent":"user";
    if(!text) return;

    const eventKey=`${payload?.event_id||payload?.eventId||''}:${role}:${text}`;
    if(voiceTranscriptSeenRef.current.has(eventKey)) return;
    voiceTranscriptSeenRef.current.add(eventKey);
    if(voiceTranscriptSeenRef.current.size>100) {
      voiceTranscriptSeenRef.current=new Set(Array.from(voiceTranscriptSeenRef.current).slice(-60));
    }

    let sessionId=sid.current;
    if(!sessionId) {
      newSession();
      sessionId=sid.current;
    }
    setNew(false);

    const tm=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    const id=`voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages(prev=>[...prev,{id,b:role==="agent",t:text,tm,voice:true}]);

    getAuthHeaders()
      .then(h=>fetch('/api/chat/voice-transcript',{
        method:'POST',
        headers:h,
        body:JSON.stringify({
          sessionId,
          agentId:currentAgentIdRef.current,
          role,
          message:text
        })
      }))
      .catch(e=>console.warn('Voice transcript save failed',e));
  },[newSession,setMessages,setNew,sid]);
  const conversation=useConversation({
    onConnect:()=>{setConvaiStarting(false);setConvaiError('');},
    onDisconnect:()=>{setConvaiStarting(false);},
    onMessage:appendVoiceTranscript,
    onError:(err)=>{
      const msg=typeof err==="string"?err:(err?.message||err?.error||"Sarah voice could not connect");
      setConvaiStarting(false);
      setConvaiError(msg);
      setOauthToast({type:'error',msg});
      setTimeout(()=>setOauthToast(null),4500);
    }
  });

  // Extracted so it can be called both on mount and after OAuth success
  const loadActiveConnectors = async () => {
    // Backend resolves org from JWT — no need to send orgId from frontend
    const headers = await getAuthHeaders().catch(() => ({}));
    fetch('/api/integrations/list', { headers })
      .then(r=>r.ok?r.json():null)
      .then(data=>{
        if(data?.connectors){
          const map={};
          const catalog={};
          data.connectors.forEach(c=>{
            catalog[c.slug]=c;
            if(c.connected) map[c.slug]=true;
          });
          setConnectorCatalog(catalog);
          setActiveConnectors(map);
        }
      })
      .catch(()=>{
        fetch('/api/connectors/active')
          .then(r=>r.ok?r.json():null)
          .then(data=>{
            if(data?.connectors){
              const map={};
              data.connectors.forEach(c=>{ map[c.slug]=true; });
              setActiveConnectors(map);
            }
          })
          .catch(()=>{});
      });
  };

  useEffect(()=>{ loadActiveConnectors(); },[]);

  // Check GHL connection on mount — show onboarding banner if not yet connected
  useEffect(()=>{
    (async()=>{
      try{
        const h=await getAuthHeaders();
        const r=await fetch('/api/integrations/ghl/status',{headers:h});
        const d=await r.json();
        setGhlConnected(!!d.connected);
        if(!d.connected) setShowGhlBanner(true);
      }catch{ setGhlConnected(false); setShowGhlBanner(true); }
    })();
  },[]);

  const connectGhl=async()=>{
    if(!ghlPit.trim()||!ghlPit.startsWith('pit-'))return;
    setGhlSaving(true);
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/integrations/ghl/connect',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({pit:ghlPit.trim(),location_id:ghlLocId.trim()||undefined})});
      const d=await r.json();
      if(d.success){
        setGhlConnected(true);
        setShowGhlBanner(false);
        setActiveConnectors(p=>({...p,ghl:true}));
        setOauthToast({type:'success',msg:'GoHighLevel connected! 🎉'});
        setTimeout(()=>setOauthToast(null),4000);
      }
    }catch(e){ /* keep banner open on error */ }
    setGhlSaving(false);
  };

  const connectorPlatform = slug => ({
    gmail:'google',
    'google-calendar':'google',
    'google-drive':'google',
    zoom:'zoom',
    shopify:'shopify',
    'uber-eats':'uber-eats',
    github:'github',
    vercel:'vercel',
  }[slug]);

  const connectorIcon = (domain) => (
    <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />
  );

  const connectorUiMeta = {
    ghl:{cat:"CRM & Communication",domain:"gohighlevel.com",desc:"Contacts, pipelines, SMS, email, automation"},
    salesforce:{cat:"CRM & Communication",domain:"salesforce.com",desc:"CRM, deals, leads, accounts, reports"},
    hubspot:{cat:"CRM & Communication",domain:"hubspot.com",desc:"Marketing, sales, service hub"},
    gmail:{cat:"Email & Calendar",domain:"gmail.com",desc:"Read, send, and manage email"},
    'google-calendar':{cat:"Email & Calendar",domain:"calendar.google.com",desc:"Events, scheduling, availability"},
    zoom:{cat:"Email & Calendar",domain:"zoom.us",desc:"Meetings, recordings, transcripts"},
    instagram:{cat:"Social Media",domain:"instagram.com",desc:"Posts, stories, DMs, analytics"},
    tiktok:{cat:"Social Media",domain:"tiktok.com",desc:"Videos, analytics, scheduling"},
    linkedin:{cat:"Social Media",domain:"linkedin.com",desc:"Posts, connections, outreach"},
    facebook:{cat:"Social Media",domain:"facebook.com",desc:"Pages, posts, ads"},
    'google-drive':{cat:"Storage & Productivity",domain:"drive.google.com",desc:"Files, docs, sheets, slides"},
    notion:{cat:"Storage & Productivity",domain:"notion.so",desc:"Docs, databases, wikis"},
    slack:{cat:"Storage & Productivity",domain:"slack.com",desc:"Channels, messages, files"},
    airtable:{cat:"Storage & Productivity",domain:"airtable.com",desc:"Databases, views, automations"},
    canva:{cat:"Storage & Productivity",domain:"canva.com",desc:"Designs, brand kits, exports"},
    shopify:{cat:"E-Commerce & Billing",domain:"shopify.com",desc:"Orders, products, inventory"},
    stripe:{cat:"E-Commerce & Billing",domain:"stripe.com",desc:"Payments, subscriptions, invoices"},
    'uber-eats':{cat:"Food & Delivery",domain:"ubereats.com",desc:"Tenant food account, menus, carts"},
    github:{cat:"Development",domain:"github.com",desc:"Repositories, branches, files, and commits"},
    vercel:{cat:"Development",domain:"vercel.com",desc:"Projects, deployments, teams, and domains"},
    heygen:{cat:"Creative & Video",domain:"heygen.com",desc:"Tenant avatars, voices, and AI video generation"},
    n8n:{cat:"Automation",domain:"n8n.io",desc:"Workflows, triggers, automations"},
    zapier:{cat:"Automation",domain:"zapier.com",desc:"App integrations, zaps"},
    bloomshield:{cat:"BLOOM",domain:null,desc:"IP protection, blockchain registry"},
  };

  const connectorCategoryLabels = {
    crm:"CRM & Communication",
    email:"Email & Calendar",
    calendar:"Email & Calendar",
    social:"Social Media",
    storage:"Storage & Productivity",
    productivity:"Storage & Productivity",
    ecommerce:"E-Commerce & Billing",
    custom:"Automation",
  };

  const baseConnectorSections = [
    {cat:"CRM & Communication",items:["ghl","salesforce","hubspot"]},
    {cat:"Email & Calendar",items:["gmail","google-calendar","zoom"]},
    {cat:"Social Media",items:["instagram","tiktok","linkedin","facebook"]},
    {cat:"Storage & Productivity",items:["google-drive","notion","slack","airtable","canva"]},
    {cat:"E-Commerce & Billing",items:["shopify","stripe"]},
    {cat:"Food & Delivery",items:["uber-eats"]},
    {cat:"Automation",items:["n8n","zapier"]},
    {cat:"Development",items:["github","vercel"]},
    {cat:"Creative & Video",items:["heygen"]},
    {cat:"BLOOM",items:["bloomshield"]},
  ];

  const buildConnectorItem = (slug, catalog = {}) => {
    const meta = connectorUiMeta[slug] || {};
    const name = catalog.name || meta.name || slug.split("-").map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(" ");
    const domain = meta.domain || `${slug}.com`;
    return {
      name,
      slug,
      icon: slug==="bloomshield"
        ? <img src="/favicon.ico" width="24" height="24" style={{borderRadius:4,objectFit:"contain"}} onError={e=>{e.target.style.display="none"}} />
        : connectorIcon(domain),
      desc: meta.desc || catalog.docsUrl || "Connect tenant account",
      connected: !!catalog.connected,
    };
  };

  const connectorSections = (() => {
    const sections = baseConnectorSections.map(section => ({
      cat: section.cat,
      items: section.items.map(slug => buildConnectorItem(slug, connectorCatalog[slug] || {})),
    }));
    const seen = new Set(sections.flatMap(section => section.items.map(item => item.slug)));
    Object.values(connectorCatalog).forEach(catalog => {
      if (!catalog?.slug || seen.has(catalog.slug)) return;
      const cat = connectorUiMeta[catalog.slug]?.cat || connectorCategoryLabels[catalog.category] || "Automation";
      let section = sections.find(s => s.cat === cat);
      if (!section) {
        section = { cat, items: [] };
        sections.push(section);
      }
      section.items.push(buildConnectorItem(catalog.slug, catalog));
      seen.add(catalog.slug);
    });
    return sections.filter(section => section.items.length);
  })();

  const connectConnector=async item=>{
    if(item.slug==="ghl"){
      setShowGhlBanner(true);
      setOauthToast({type:'success',msg:'Add your GoHighLevel token in the banner above.'});
      setTimeout(()=>setOauthToast(null),3500);
      return;
    }
    if(item.slug==="heygen"){
      setHeygenError('');
      setHeygenApiKey('');
      setShowHeygenConnect(true);
      return;
    }

    const platform=connectorPlatform(item.slug);
    if(!platform){
      setOauthToast({type:'error',msg:`${item.name} connector is not live yet.`});
      setTimeout(()=>setOauthToast(null),4000);
      return;
    }

    const body={};
    if(platform==="shopify"){
      const shopDomain=window.prompt("Enter your Shopify shop domain", "petalcorebeauty.com");
      if(!shopDomain?.trim()) return;
      body.shopDomain=shopDomain.trim();
    }

    try{
      const h=await getAuthHeaders();
      const r=await fetch(`/api/integrations/${platform}/start`,{
        method:'POST',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      const d=await r.json();
      if(!r.ok||!d.authUrl) throw new Error(d.error||'Could not start connector.');
      if(d.connectionMode==="browser_handoff"){
        const uberWindow=window.open(d.authUrl,'_blank','noopener,noreferrer');
        if(!uberWindow) throw new Error('Allow pop-ups so Bloomie can open Uber Eats for sign-in.');
        const ready=window.confirm('Uber Eats opened in a new tab. Sign in to your account there, then return here and click OK. Bloomie will never store your Uber password or payment details.');
        if(!ready) return;
        const readyRes=await fetch('/api/integrations/uber-eats/browser-ready',{
          method:'POST',
          headers:{...h,'Content-Type':'application/json'},
          body:'{}'
        });
        const readyData=await readyRes.json();
        if(!readyRes.ok||!readyData.connected) throw new Error(readyData.error||'Could not confirm the Uber Eats browser session.');
        setActiveConnectors(p=>({...p,'uber-eats':true}));
        setOauthToast({type:'success',msg:'Uber Eats browser is ready for this organization.'});
        setTimeout(()=>setOauthToast(null),4500);
        loadActiveConnectors();
        return;
      }
      window.location.href=d.authUrl;
    }catch(err){
      setOauthToast({type:'error',msg:err.message||'Connector failed to start.'});
      setTimeout(()=>setOauthToast(null),5000);
    }
  };

  const connectHeygen=async()=>{
    if(!heygenApiKey.trim())return;
    setHeygenSaving(true);
    setHeygenError('');
    try{
      const h=await getAuthHeaders();
      const r=await fetch('/api/integrations/heygen/connect',{
        method:'POST',
        headers:{...h,'Content-Type':'application/json'},
        body:JSON.stringify({apiKey:heygenApiKey.trim()})
      });
      const d=await r.json();
      if(!r.ok||!d.success) throw new Error(d.error||'Could not connect HeyGen.');
      setActiveConnectors(p=>({...p,heygen:true}));
      setShowHeygenConnect(false);
      setHeygenApiKey('');
      setOauthToast({type:'success',msg:'HeyGen connected for this organization!'});
      setTimeout(()=>setOauthToast(null),4000);
      loadActiveConnectors();
    }catch(err){
      setHeygenError(err.message||'Could not connect HeyGen.');
    }finally{
      setHeygenSaving(false);
    }
  };

  const disconnectConnector=async item=>{
    try{
      const platform=connectorPlatform(item.slug)||item.slug;
      const h=await getAuthHeaders();
      await fetch(`/api/integrations/${platform}/disconnect`,{method:'POST',headers:h});
      setActiveConnectors(p=>{
        const next={...p};
        if(platform==="google"){
          delete next.gmail; delete next['google-calendar']; delete next['google-drive'];
        } else {
          delete next[item.slug];
        }
        return next;
      });
      setOauthToast({type:'success',msg:`Disconnected ${item.name}`});
      setTimeout(()=>setOauthToast(null),3500);
    }catch(err){
      setOauthToast({type:'error',msg:'Disconnect failed'});
      setTimeout(()=>setOauthToast(null),3500);
    }
  };

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
  const loadProjectConversations=async(proj=selectedProject)=>{
    if(!proj?.id) return;
    try{
      const res=await fetch(`/api/chat/sessions?projectId=${proj.id}`);
      const data=await res.json();
      setProjectConversations(data.sessions||[]);
    }catch(err){
      console.error('Failed to load project conversations:',err);
      setProjectConversations([]);
    }
  };
  
  // Fetch projects wherever Chat or Work needs project organization.
  useEffect(()=>{
    if((pg==="projects"||pg==="chat"||pg==="work") && projects.length===0 && !loadingProjects){
      setLoadingProjects(true);
      getAuthHeaders().then(h=>fetch('/api/projects',{headers:h}))
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
  
  const [scrM,setScrM]=useState(compact?"hidden":"docked");
  const [rightTab,setRightTab]=useState("live"); // "live" | "browser" | "artifact"
  const [activeArtifact,setActiveArtifact]=useState(null); // {name, content, fileId}
  const [chatLightbox,setChatLightbox]=useState(null);
  // Keep Markdown component identities stable across health, SSE, and session
  // title updates. Recreating them remounts native media elements and resets
  // active playback back to 0:00.
  const chatMarkdownComponents=useMemo(
    ()=>createChatMarkdownComponents(c,setChatLightbox),
    [c,setChatLightbox]
  );

  // Auto-open Files panel when Sarah creates an artifact
  useEffect(()=>{
    if(!messages.length) return;
    const last = messages[messages.length-1];
    if(last?.b && last?.hasArtifact && scrM==="docked"){
      setTimeout(()=>setRightTab("artifact"),600);
    }
  },[messages]);
  const [sbO,setSbO]=useState(mob?"closed":compact?"mini":"full");
  useEffect(()=>{
    if(compact){
      setScrM("hidden");
      setSbO(current=>current==="full"?"mini":current);
    }
  },[compact]);
  const [openChatMenu,setOpenChatMenu]=useState(null); // Track which chat's menu is open
  const [projectPickerChat,setProjectPickerChat]=useState(null);
  const [expandedProjects,setExpandedProjects]=useState(()=>new Set());
  const [stab,setStab]=useState("General");
  useEffect(()=>{
    if(!passwordRecovery) return;
    setPg("settings");
    setStab("General");
    window.history.replaceState({}, "", window.location.pathname);
    requestAnimationFrame(()=>document.querySelector('[data-testid="password-change-panel"]')?.scrollIntoView({block:"center"}));
  },[passwordRecovery]);
  const [tgEnabled,setTgEnabled]=useState(false);
  const [tgLoading,setTgLoading]=useState(false);
  const [questionLedContent,setQuestionLedContent]=useState({blog:false,email:false,video:false});
  const [questionLedLoading,setQuestionLedLoading]=useState(false);
  const [hlpO,setHlpO]=useState(false);
  const [blmMsgs,setBlmMsgs]=useState([]);
  const [blmInput,setBlmInput]=useState("");
  const [blmLoading,setBlmLoading]=useState(false);
  const [blmSid]=useState(()=>"dash-"+Date.now()+"-"+Math.random().toString(36).slice(2,6));
  const blmEndRef=useRef(null);
  const blmInputRef=useRef(null);
  const sendBloomie=async()=>{
    const msg=blmInput.trim(); if(!msg||blmLoading)return;
    setBlmInput(""); setBlmMsgs(p=>[...p,{role:"user",text:msg}]); setBlmLoading(true);
    try{
      const r=await fetch("https://njfhzabmaxhfzekbzpzz.supabase.co/functions/v1/bloomie-chat",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:"support",message:msg,session_id:blmSid})
      });
      const d=await r.json();
      setBlmMsgs(p=>[...p,{role:"assistant",text:d.reply||d.error||"No response"}]);
    }catch(e){setBlmMsgs(p=>[...p,{role:"assistant",text:"Connection error"}]);}
    setBlmLoading(false); setTimeout(()=>blmInputRef.current?.focus(),100);
  };
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
    getAuthHeaders().then(h=>fetch("/api/dashboard/trust-gate-status",{headers:h})).then(r=>r.ok?r.json():null).then(d=>{if(d)setTgEnabled(d.enabled)}).catch(()=>{});
    getAuthHeaders().then(h=>fetch("/api/dashboard/content-strategy-settings",{headers:h})).then(r=>r.ok?r.json():null).then(d=>{if(d?.settings)setQuestionLedContent({blog:!!d.settings.blog,email:!!d.settings.email,video:!!d.settings.video})}).catch(()=>{});
    getAuthHeaders().then(h=>fetch("/api/dashboard/model-config",{headers:h})).then(r=>r.ok?r.json():null).then(d=>{if(d)setModelConfig(d)}).catch(()=>{});
    getAuthHeaders().then(h=>fetch("/api/dashboard/image-engine-config",{headers:h})).then(r=>r.ok?r.json():null).then(d=>{if(d)setImgEngineConfig(d)}).catch(()=>{});
  },[]);

  const toggleTrustGate=async()=>{
    setTgLoading(true);
    try{
      const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/trust-gate-status",{method:"POST",headers:{..._hh,"Content-Type":"application/json"},body:JSON.stringify({enabled:!tgEnabled})});
      if(r.ok){const d=await r.json();setTgEnabled(d.enabled);}
    }catch{}
    setTgLoading(false);
  };

  const toggleQuestionLedContent=async(key)=>{
    setQuestionLedLoading(true);
    try{
      const _hh=await getAuthHeaders();
      const next={...questionLedContent,[key]:!questionLedContent[key]};
      const r=await fetch("/api/dashboard/content-strategy-settings",{method:"POST",headers:{..._hh,"Content-Type":"application/json"},body:JSON.stringify({settings:next})});
      if(r.ok){const d=await r.json();setQuestionLedContent({blog:!!d.settings.blog,email:!!d.settings.email,video:!!d.settings.video});}
    }catch{}
    setQuestionLedLoading(false);
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
        fetch('/api/agent/tasks' + qs).then(r=>r.json())  // pass agentId so the right agent's tasks load
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
        fetch(`/api/agent/tasks${qs}`).then(r=>r.json()),
        fetch(`/api/agent/tasks/runs${qs}`).then(r=>r.json()).catch(()=>({runs:[]}))
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
      const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/model-config",{method:"PUT",headers:{..._hh,"Content-Type":"application/json"},body:JSON.stringify({model:newModel})});
      if(r.ok){const d=await r.json();setModelConfig(prev=>({...prev,model:d.model,reason:'dashboard override'}));}
    }catch{}
    setModelSaving(false);
  };
  const updateImgEngine=async(contentType,engine)=>{
    if(!isOwner)return;
    setImgEngineSaving(true);
    try{
      const _hh=await getAuthHeaders();const r=await fetch("/api/dashboard/image-engine-config",{method:"PUT",headers:{..._hh,"Content-Type":"application/json"},body:JSON.stringify({[contentType]:engine})});
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
    getAuthHeaders().then(h=>fetch('/api/dashboard/user-avatar',{headers:h})).then(r=>r.json()).then(d=>{if(d.avatar)setUserImg(d.avatar);}).catch(()=>{});
  },[]);
  // Load agent avatar when agent changes
  useEffect(()=>{
    if(!currentAgentId) return;
    fetch('/api/agent/profile?agentId='+currentAgentId).then(r=>r.json()).then(d=>{if(d.profile?.avatarUrl)setAgentImgUrl(d.profile.avatarUrl); else setAgentImgUrl(null);}).catch(()=>{});
  },[currentAgentId]);
  const [projO,setProjO]=useState(false);
  const [activeProj,setActiveProj]=useState("My Business");
  const [bizLogo,setBizLogo]=useState(null);
  const [bizName,setBizName]=useState(null);

  // Fallback: Load business profile for logo (only if /me didn't provide org info)
  useEffect(()=>{
    if(meOrgName) return; // already got org from /me
    getAuthHeaders().then(h=>fetch('/api/dashboard/business-profile',{headers:h})).then(r=>r.json()).then(d=>{
      if(d.profile?.logoUrl)setBizLogo(d.profile.logoUrl);
      if(d.profile?.name){setBizName(d.profile.name);setActiveProj(d.profile.name);}
    }).catch(()=>{});
  },[meOrgName]);
  const [files,setFiles]=useState([]);
  const [filesLoading,setFilesLoading]=useState(false);
  const [filesPage,setFilesPage]=useState(1);
  const [filesTotal,setFilesTotal]=useState(0);
  const [filesSearch,setFilesSearch]=useState('');
  const [filesSort,setFilesSort]=useState('newest'); // 'newest','oldest','name'
  const [filesTypeFilter,setFilesTypeFilter]=useState('all'); // 'all','html','image','markdown','code','document'
  const [filesRefresh,setFilesRefresh]=useState(0);
  const [previewFile,setPreviewFile]=useState(null); // {name, content, fileId}
  const getActiveArtifactContext = () => {
    const art = activeArtifact || previewFile;
    if (!art) return null;
    return {
      name: art.name || null,
      fileId: art.fileId || art.artifactId || null,
      slug: art.slug || null,
      sessionId: art.sessionId || sid.current || null,
      fileType: art.fileType || null
    };
  };

  // Clear files immediately when switching agents (prevents stale data flash)
  useEffect(()=>{ setFiles([]); setFilesPage(1); setFilesRefresh(r=>r+1); },[currentAgentId]);
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
      ? `/api/files/artifacts?limit=20&page=${filesPage}`
      : currentAgentId ? `/api/files/artifacts?limit=20&page=${filesPage}&agentId=${currentAgentId}` : `/api/files/artifacts?limit=20&page=${filesPage}`;
    // Send auth headers so server resolves correct org from JWT — critical for multi-tenant
    getAuthHeaders().then(headers => {
      fetch(url, { headers })
        .then(r=>r.ok?r.json():null)
        .then(d=>{ setFiles(d?.artifacts||[]); setFilesTotal(d?.total||0); })
        .catch(()=>{})
        .finally(()=>setFilesLoading(false));
    });
  },[pg,filesRefresh,currentAgentId,conferenceMode,filesPage]);
  const btm=useRef(null);
  const fRef=useRef(null);
  const [pendingFiles,setPendingFiles]=useState([]);
  const [drivePickerOpen,setDrivePickerOpen]=useState(false);
  const chatScrollRef=useRef(null);
  const [showScrollDown,setShowScrollDown]=useState(false);
  const handleChatScroll=()=>{const el=chatScrollRef.current;if(!el)return;setShowScrollDown(el.scrollHeight-el.scrollTop-el.clientHeight>120);};
  const scrollToLatest=()=>{btm.current?.scrollIntoView({behavior:"smooth"});setShowScrollDown(false);};
  const sbOpen=sbO==="full"||sbO==="mini";

  const agent={nm:currentAgent?.name||"AI Agent",role:currentAgent?.role||"AI Employee",img:agentImgUrl||currentAgent?.avatar_url||null,grad:"linear-gradient(135deg,#F4A261,#E76F8B)"};
  const aFN=(currentAgent?.name||"Agent").split(" ")[0]; // agent first name for dynamic UI text
  const fmtFreq=(f)=>({every_10_min:"Every 10 min",every_30_min:"Every 30 min",hourly:"Hourly",daily:"Daily",weekdays:"Weekdays",weekly:"Weekly",monthly:"Monthly"}[f]||f);
  const currentAgentName=(currentAgent?.name||"").toLowerCase();
  const isSarahVoiceAgent=currentAgentId===DEFAULT_SARAH_AGENT_ID||currentAgentName==="sarah"||currentAgentName.startsWith("sarah ")||currentAgentName.includes("sarah rodriguez");
  const convaiConnected=conversation.status==="connected";
  const convaiConnecting=convaiStarting||conversation.status==="connecting";
  const voiceActive=vcRec||convaiConnecting||convaiConnected;
  const voiceStatusText=convaiConnecting?"Connecting":conversation.isSpeaking?"Speaking":conversation.isListening?"Listening":convaiConnected?"Voice live":"";

  useEffect(()=>{ if(btm.current) setTimeout(()=>btm.current?.scrollIntoView({behavior:"smooth"}),100); },[messages]);

  useEffect(()=>{
    if(convaiConnected||convaiConnecting) {
      conversation.endSession();
      setConvaiStarting(false);
    }
  },[isSarahVoiceAgent,convaiConnected,convaiConnecting]);

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
    if(!tx.trim()&&pendingFiles.length===0) return;
    if(loading&&pendingFiles.length>0) {
      setOauthToast({type:'error',msg:'Let the current step finish before queuing a file. Text instructions can be queued now.'});
      setTimeout(()=>setOauthToast(null),3500);
      return;
    }
    const text=tx.trim(); setTx(""); setNew(false);
    const activeProjectId = selectedProject?.id || null;
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
        const ok = await sendFilesEncoded(encoded, text, activeProjectId);
        if(ok && selectedProject?.id) await loadProjectConversations(selectedProject);
      } else {
        const files = pendingFiles.map(p => p.file);
        const ok = await sendFiles(files, text, activeProjectId);
        if(ok && selectedProject?.id) await loadProjectConversations(selectedProject);
      }
    } else {
      const ok = await send(text, activeProjectId, getActiveArtifactContext());
      if(ok && selectedProject?.id) await loadProjectConversations(selectedProject);
    }
  };

  const startSarahVoice=async()=>{
    if(convaiConnected||convaiConnecting){
      conversation.endSession();
      setConvaiStarting(false);
      return;
    }

    if(!isSarahVoiceAgent){
      setOauthToast({type:'error',msg:'Voice is only configured for Sarah'});
      setTimeout(()=>setOauthToast(null),3500);
      return;
    }

    try {
      setConvaiStarting(true);
      setConvaiError('');
      const micStream=await navigator.mediaDevices?.getUserMedia?.({audio:true});
      micStream?.getTracks?.().forEach(track=>track.stop());

      const h=await getAuthHeaders();
      const r=await fetch('/api/voice/elevenlabs/token',{
        method:'POST',
        headers:h,
        body:JSON.stringify({agentId:currentAgentId})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.token) throw new Error(d.error||'Could not start Sarah voice');

      conversation.startSession({
        conversationToken:d.token,
        connectionType:d.connectionType||'webrtc',
        overrides:{
          ...(d.voicePrompt||d.firstMessage ? { agent: {
            ...(d.voicePrompt ? { prompt: { prompt: d.voicePrompt } } : {}),
            ...(d.firstMessage ? { firstMessage: d.firstMessage } : {})
          } } : {}),
          ...(d.voiceId ? { tts: { voiceId: d.voiceId, stability: 0.45, similarityBoost: 0.85, speed: 0.95 } } : {})
        },
        onError:(err)=>{
          const msg=typeof err==="string"?err:(err?.message||err?.error||'Sarah voice disconnected');
          setConvaiStarting(false);
          setConvaiError(msg);
          setOauthToast({type:'error',msg});
          setTimeout(()=>setOauthToast(null),4500);
        }
      });
    } catch(e) {
      const msg=e?.name==="NotAllowedError"?"Microphone permission is required to speak with Sarah":(e?.message||'Could not start Sarah voice');
      setConvaiStarting(false);
      setConvaiError(msg);
      setOauthToast({type:'error',msg});
      setTimeout(()=>setOauthToast(null),4500);
    }
  };

  const stopBrowserDictation=()=>{
    try { voiceRecognitionRef.current?.stop?.(); } catch {}
    voiceRecognitionRef.current=null;
    setVcRec(false);
  };

  const startBrowserDictation=({onEnd=null,autoSend=false}={})=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) {
      setOauthToast({type:'error',msg:'Speech-to-text is not available in this browser'});
      setTimeout(()=>setOauthToast(null),3500);
      return false;
    }
    stopBrowserDictation();
    const r=new SR();
    r.continuous=false;
    r.interimResults=true;
    r.lang="en-US";
    let finalTranscript="";
    r.onresult=(ev)=>{
      let t="";
      for(let i=0;i<ev.results.length;i++) t+=ev.results[i][0].transcript;
      finalTranscript=t.trim();
      setTx(t);
    };
    r.onend=async()=>{
      voiceRecognitionRef.current=null;
      setVcRec(false);
      if(autoSend && finalTranscript && !loading) {
        const activeProjectId = selectedProject?.id || null;
        setTx("");
        setNew(false);
        const ok = await send(finalTranscript, activeProjectId);
        if(ok && selectedProject?.id) await loadProjectConversations(selectedProject);
      }
      onEnd?.();
    };
    r.onerror=()=>{
      voiceRecognitionRef.current=null;
      setVcRec(false);
      onEnd?.();
    };
    try {
      voiceRecognitionRef.current=r;
      r.start();
      setVcRec(true);
      return true;
    } catch(e) {
      voiceRecognitionRef.current=null;
      setVcRec(false);
      setOauthToast({type:'error',msg:e?.message||'Could not start speech-to-text'});
      setTimeout(()=>setOauthToast(null),3500);
      return false;
    }
  };

  const toggleVoice=()=>{
    const liveAvatar=window.__bloomieLiveAvatar;
    if(isSarahVoiceAgent) {
      if(vcRec) {
        stopBrowserDictation();
      } else {
        startBrowserDictation({autoSend:true});
      }
      return;
    }
    if(vcRec){stopBrowserDictation();return;}
    startBrowserDictation();
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
  const BloomieIcon = ({active,sz=16}) => (
    <svg width={sz} height={sz} viewBox="0 0 100 100" fill="none">
      {[0,72,144,216,288].map((r,i)=>(
        <ellipse key={i} cx="50" cy="38" rx="14" ry="20" fill={active?c.tx:c.so} opacity={i%2===0?0.9:0.7} transform={`rotate(${r} 50 50)`}/>
      ))}
      <circle cx="50" cy="50" r="10" fill={active?c.tx:c.so} opacity="0.5"/>
    </svg>
  );
  const navTabs=[
    {k:"bloomie",l:"Bloomie",icon:BloomieIcon},
    {k:"monitor",l:"Status",icon:StatusIcon},
    {k:"docs",l:"Docs",icon:FilesIcon},
    {k:"activity",l:"Activity",icon:ActivityIcon},
    {k:"mobile",l:"Mobile",icon:CallsIcon},
  ];
  const composerPages = new Set(["chat", "work"]);
  const supportLauncherBottom = composerPages.has(pg)
    ? (mob ? 176 : 140)
    : (mob ? 96 : 80);
  const standaloneBookCreator = window.location.pathname.startsWith('/book-creator');

  if(standaloneBookCreator)return(
    <div style={{height:'100dvh',minHeight:0,width:'100%',overflow:'hidden',display:'flex',flexDirection:'column',background:c.bg,fontFamily:"'Inter',system-ui,-apple-system,sans-serif",color:c.tx}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes processingSweep{0%{background-position:180% 0}100%{background-position:-40% 0}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${c.ln};border-radius:10px}`}</style>
      <header style={{height:64,flexShrink:0,padding:mob?'10px 14px':'10px 24px',display:'flex',alignItems:'center',gap:11,borderBottom:'1px solid '+c.ln,background:c.cd}}>
        <div style={{width:38,height:38,borderRadius:11,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#F4A261,#E76F8B)',color:'#fff',fontWeight:900,fontSize:18}}>B</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:15,fontWeight:800,color:c.tx}}>Bloomie Book Creator</div><div style={{fontSize:10,color:c.so}}>From idea to finished manuscript</div></div>
        <a href="/" style={{padding:'8px 11px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.so,fontSize:11,fontWeight:700,textDecoration:'none'}}>Bloomie Staffing</a>
        <button onClick={()=>supabase.auth.signOut()} style={{padding:'8px 11px',borderRadius:9,border:'1px solid '+c.ln,background:c.sf,color:c.so,fontSize:11,fontWeight:700,cursor:'pointer'}}>Sign out</button>
      </header>
      <main style={{flex:1,minHeight:0}}>
        <BookWorkspace c={c} mob={mob} aFN={aFN} agentId={currentAgentId} standalone onOpenChat={()=>{}}/>
      </main>
    </div>
  );

  return(
    <div style={{height:"100dvh",minHeight:0,width:"100%",maxWidth:"100vw",overflow:"hidden",display:"flex",flexDirection:"column",background:c.bg,fontFamily:"'Inter',system-ui,-apple-system,sans-serif",color:c.tx}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes processingSweep{0%{background-position:180% 0}100%{background-position:-40% 0}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
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
      {/* ── GHL Connect Banner — shown on first login if GHL not connected ── */}
      {showGhlBanner&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9998,background:"linear-gradient(135deg,#1a0a2e,#2d1b4e)",borderBottom:"1px solid rgba(244,162,97,0.3)",padding:"14px 20px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:14,fontWeight:700,color:"#F4A261",marginBottom:3}}>🔗 Connect GoHighLevel to unlock website building</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.6)"}}>Your Private Integration Token (PIT) lets Bloomie build websites and manage your CRM.</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input value={ghlPit} onChange={e=>setGhlPit(e.target.value)} placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{padding:"7px 12px",borderRadius:8,border:"1px solid rgba(244,162,97,0.4)",background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:12,fontFamily:"monospace",width:330,outline:"none"}}/>
            <input value={ghlLocId} onChange={e=>setGhlLocId(e.target.value)} placeholder="Location ID (optional)" style={{padding:"7px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:12,fontFamily:"monospace",width:200,outline:"none"}}/>
            <button onClick={connectGhl} disabled={!ghlPit.startsWith('pit-')||ghlSaving} style={{padding:"7px 16px",borderRadius:8,border:"none",cursor:ghlPit.startsWith('pit-')&&!ghlSaving?"pointer":"not-allowed",background:ghlPit.startsWith('pit-')?"linear-gradient(135deg,#F4A261,#E76F8B)":"rgba(255,255,255,0.1)",color:"#fff",fontSize:12,fontWeight:700,opacity:ghlSaving?0.6:1,whiteSpace:"nowrap"}}>
              {ghlSaving?"Connecting…":"Connect GHL"}
            </button>
            <button onClick={()=>setShowGhlBanner(false)} style={{padding:"7px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:"rgba(255,255,255,0.5)",fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>Later</button>
          </div>
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
      <div style={{width:"100%",maxWidth:"100vw",overflow:"visible",padding:mob?"8px 10px":"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:c.cd,borderBottom:"1px solid "+c.ln,position:"relative",zIndex:60,flexShrink:0,gap:mob?4:8,paddingTop:mob?"max(24px, env(safe-area-inset-top))":"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:mob?4:10,flexShrink:0}}>
          {(pg==="chat"||pg==="work")&&<button onClick={()=>setSbO(sbO==="full"?"mini":sbO==="mini"?"closed":"full")} aria-label="Open conversations menu" title="Conversations menu" style={{width:mob?44:36,height:mob?44:36,borderRadius:mob?11:9,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:c.so,flexShrink:0}}>
            <svg width={mob?26:21} height={mob?26:21} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={mob?2.6:2.2} strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
            </svg>
          </button>}
          <div style={{cursor:"pointer",display:"flex",alignItems:"center",gap:mob?4:8}} onClick={()=>setPg("chat")}>
            <Bloom sz={mob?28:32} glow/>
            {!compact&&<span style={{fontSize:16,fontWeight:700,color:c.tx}}>Bloomie</span>}
            {!compact&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"#E76F8B20",color:"#E76F8B",letterSpacing:0.5}}>BETA</span>}
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,flexWrap:"nowrap",flex:mob?1:"initial",minWidth:0,overflow:"hidden"}}>
          {!compact&&<>
          <div style={{display:"flex",gap:mob?2:4,background:c.sf,padding:3,borderRadius:10}}>
            {navTabs.map(t=>(
              <button key={t.k} onClick={()=>{setPg(t.k);if(t.k==="activity")loadActivity();if(t.k==="profile")loadProfile();}} style={{padding:mob?"7px":"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:pg===t.k?c.cd:"transparent",color:pg===t.k?c.tx:c.so,boxShadow:pg===t.k?"0 1px 4px rgba(0,0,0,.06)":"none",display:"flex",alignItems:"center",gap:6,transition:"all .15s",flexShrink:0}}>
                <t.icon active={pg===t.k} sz={14}/>
                {!mob&&<span>{t.l}</span>}
              </button>
            ))}
          </div>
          <div title={connected?"Connected":"Offline"} style={{display:"flex",alignItems:"center",gap:mob?0:6,padding:mob?"8px":"4px 10px",borderRadius:12,background:connected?c.gf:"#fef2f2",border:"1px solid "+(connected?c.gr+"30":"#fecaca"),flexShrink:0}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:connected?c.gr:"#ef4444",animation:connected?"pulse 1.5s ease infinite":"none"}}/>
            {!mob&&<span style={{fontSize:10,fontWeight:600,color:connected?c.gr:"#dc2626"}}>{connected?"Connected":"Offline"}</span>}
          </div>
          {isDesktopShell&&!compact&&<div title={desktopBridgeReady?"Native browser and computer controls are ready":"Desktop shell is connected; native controls are reconnecting"} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:12,background:desktopBridgeReady?"#ecfdf5":"#fff7ed",border:"1px solid "+(desktopBridgeReady?"#86efac":"#fed7aa"),flexShrink:0}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:desktopBridgeReady?"#22c55e":"#f59e0b"}}/>
            <span style={{fontSize:10,fontWeight:700,color:desktopBridgeReady?"#15803d":"#c2410c"}}>{desktopBridgeReady?"Desktop ready":"Desktop reconnecting"}</span>
          </div>}
          <a href={`https://app.gohighlevel.com`} target="_blank" rel="noopener" title="Open BLOOM CRM" style={{display:"flex",alignItems:"center",gap:5,padding:mob?"8px":"4px 10px",borderRadius:8,border:"1.5px solid transparent",backgroundImage:"linear-gradient("+c.cd+","+c.cd+"), linear-gradient(135deg,#F4A261,#E76F8B)",backgroundOrigin:"border-box",backgroundClip:"padding-box, border-box",fontSize:10,fontWeight:700,textDecoration:"none",cursor:"pointer",background:c.cd,flexShrink:0}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="url(#crmGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <defs><linearGradient id="crmGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F4A261"/><stop offset="100%" stopColor="#E76F8B"/></linearGradient></defs>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            {!mob&&<span style={{background:"linear-gradient(135deg,#F4A261,#E76F8B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>BLOOM CRM</span>}
          </a>
          </>}
          {compact&&<div title={connected?"Connected":"Offline"} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 9px",borderRadius:12,background:connected?c.gf:"#fef2f2",border:"1px solid "+(connected?c.gr+"30":"#fecaca")}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:connected?c.gr:"#ef4444",animation:connected?"pulse 1.5s ease infinite":"none"}}/>
            <span style={{fontSize:11,fontWeight:600,color:connected?c.gr:"#dc2626"}}>{connected?"Online":"Offline"}</span>
          </div>}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:mob?4:8,position:"relative",flexShrink:0}}>
          {compact&&<button title="More navigation" aria-label="More navigation" aria-expanded={mobileMoreOpen} onClick={()=>setMobileMoreOpen(v=>!v)} style={{height:32,padding:"0 10px",borderRadius:8,border:"1px solid "+c.ln,background:mobileMoreOpen?c.sf:c.cd,cursor:"pointer",fontSize:12,fontWeight:700,color:c.tx,display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
            <span aria-hidden="true">☰</span> More
          </button>}
          {scrM==="hidden"&&<button onClick={()=>{setRightTab("live");setScrM("docked");}} style={{height:32,padding:"0 10px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:700,color:c.so,display:"flex",alignItems:"center",gap:6}} title={`Show ${aFN} Live`}>
            <span style={{width:7,height:7,borderRadius:"50%",background:c.ac,animation:"pulse 1.5s ease infinite"}}/>
            Live
          </button>}
          <div style={{width:mob?32:36,height:mob?32:36,borderRadius:"50%",background:userImg?"transparent":"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",overflow:"hidden",flexShrink:0}}>{userImg?<img src={userImg} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:meInitial}</div>
        </div>
        {compact&&mobileMoreOpen&&<>
          <div onClick={()=>setMobileMoreOpen(false)} style={{position:"fixed",inset:0,zIndex:61}}/>
          <div role="menu" aria-label="Bloomie navigation" style={{position:"absolute",top:"calc(100% + 6px)",right:10,left:10,zIndex:62,padding:8,borderRadius:14,border:"1px solid "+c.ln,background:c.cd,boxShadow:"0 12px 32px rgba(0,0,0,.28)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {navTabs.map(t=><button key={t.k} onClick={()=>{setPg(t.k);setMobileMoreOpen(false);if(t.k==="activity")loadActivity();if(t.k==="profile")loadProfile();}} style={{padding:"11px 12px",borderRadius:10,border:"none",background:pg===t.k?c.ac+"18":c.sf,color:c.tx,fontSize:13,fontWeight:600,textAlign:"left",display:"flex",alignItems:"center",gap:9}}><t.icon active={pg===t.k} sz={16}/>{t.l}</button>)}
            <div title={connected?"Connected":"Offline"} style={{padding:"11px 12px",borderRadius:10,background:c.sf,color:connected?c.gr:"#dc2626",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:9}}><span style={{width:7,height:7,borderRadius:"50%",background:connected?c.gr:"#ef4444"}}/>{connected?"Connected":"Offline"}</div>
            <a href="https://app.gohighlevel.com" target="_blank" rel="noopener" onClick={()=>setMobileMoreOpen(false)} style={{padding:"11px 12px",borderRadius:10,background:c.sf,color:c.tx,fontSize:13,fontWeight:600,textDecoration:"none",display:"flex",alignItems:"center",gap:9}}>↗ BLOOM CRM</a>
          </div>
        </>}
      </div>

      {/* ── ROW 2 — one conversational surface and one execution surface ── */}
      <div style={{position:"relative",zIndex:59,background:c.cd,borderBottom:"1px solid "+c.ln,display:"flex",justifyContent:"center",alignItems:"center",padding:"4px 0",gap:0,flexShrink:0}}>
        <div style={{display:"flex",gap:2,background:c.sf,padding:3,borderRadius:10}}>
          {[
            {k:"chat",l:"Chat"},
            {k:"work",l:"Work"},
            {k:"book",l:"Book"},
          ].map(t=>(
            <button key={t.k} onClick={()=>setPg(t.k)} style={{padding:mob?"6px 16px":"6px 24px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:pg===t.k?c.cd:"transparent",color:pg===t.k?c.tx:c.so,boxShadow:pg===t.k?"0 1px 4px rgba(0,0,0,.06)":"none",transition:"all .15s",position:"relative"}}>
              {t.l}
              {pg===t.k&&<span style={{position:"absolute",bottom:-1,left:"50%",transform:"translateX(-50%)",width:16,height:2,borderRadius:2,background:"linear-gradient(90deg,#F4A261,#E76F8B)"}}/>}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",position:"relative",flex:1,minHeight:0,overflow:"hidden"}}>
        {(pg==="chat"||pg==="work")&&sbO==="full"&&compact&&<div onClick={()=>setSbO("closed")} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.3)",zIndex:45}}/>}

        {/* ── SIDEBAR — session history like Claude (visible on all pages) ── */}
        {sbOpen&&pg!=="book"&&(
          <div style={compact?{position:"absolute",inset:"0 auto 0 0",zIndex:50}:{}}>
            <div style={{width:sbO==="mini"?60:260,height:"100%",background:c.cd,borderRight:"1px solid "+c.ln,display:"flex",flexDirection:"column",flexShrink:0,transition:"width .2s ease",overflow:"hidden"}}>

              {/* MINI sidebar */}
              {sbO==="mini"&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"12px 0",gap:4,flex:1}}>
                  <button onClick={()=>{setPg("chat");newSession();setNew(true);}} title="New chat" style={{width:40,height:40,borderRadius:10,border:"1.5px dashed "+c.ln,background:"transparent",cursor:"pointer",fontSize:18,color:c.so,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
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
                  <div data-testid="sidebar-sticky-header" style={{padding:"12px 14px 8px",borderBottom:"1px solid "+c.ln,flexShrink:0}}>
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
                      onClick={()=>{
                        if(pg==="work"){
                          setSelectedProject(null);
                          setNewWorkProjectId('');
                          setActiveWorkSessionId(null);
                          setNewWorkSessionNonce(value=>value+1);
                        }
                        else{setSelectedProject(null);setPg("chat");newSession();setNew(true);}
                      }}
                      style={{width:"100%",padding:"9px 0",borderRadius:10,border:"1.5px dashed "+c.ln,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,color:c.so,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                    >
                      <span style={{fontSize:16}}>+</span> {pg==="work"?"New Work session":"New chat"}
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
                          placeholder={pg==="work"?"Search Work sessions":"Search"}
                          style={{width:"100%",padding:"8px 10px 8px 36px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,color:c.tx,fontSize:13,fontFamily:"inherit",outline:"none"}}
                          onFocus={e=>e.currentTarget.style.borderColor=c.ac}
                          onBlur={e=>e.currentTarget.style.borderColor=c.ln}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Menu links, Projects, and Recent Chats share the scroll
                      surface. Agent identity, New Chat, and Search stay fixed. */}
                  <div data-testid="sidebar-scroll-region" style={{flex:1,minHeight:0,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",touchAction:"pan-y",overscrollBehaviorY:"contain"}}>
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
                      <button onClick={()=>{setPg("references");if(window.innerWidth<768)setSbO("closed");}} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",background:pg==="references"?c.sf:"transparent",color:pg==="references"?c.tx:c.so,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"background .15s"}} onMouseEnter={e=>{ if(pg!=="references") e.currentTarget.style.background=c.hv; }} onMouseLeave={e=>{ if(pg!=="references") e.currentTarget.style.background="transparent"; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 19.5V5a2 2 0 0 1 2-2h14v14H6.5A2.5 2.5 0 0 0 4 19.5z"/></svg>
                        <span>References</span>
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

                  {/* Session list - only show on Chat page */}
                  {pg==="chat"&&(
                  <div style={{padding:"8px 8px"}}>
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
                    <>
                    {projects.length>0&&<div style={{padding:"2px 2px 8px",borderBottom:"1px solid "+c.ln,marginBottom:8}}>
                      <div style={{padding:"4px 8px 6px",fontSize:10,fontWeight:700,color:c.fa,textTransform:"uppercase",letterSpacing:".6px"}}>Projects</div>
                      {projects.map(project=>{
                        const expanded=expandedProjects.has(project.id);
                        const projectChats=sessions.filter(session=>session.project_id===project.id);
                        return <div key={project.id} style={{marginBottom:2}}>
                          <button onClick={()=>setExpandedProjects(current=>{const next=new Set(current);expanded?next.delete(project.id):next.add(project.id);return next;})} style={{width:"100%",padding:"8px 9px",borderRadius:8,border:"none",background:selectedProject?.id===project.id?c.ac+"12":"transparent",color:c.tx,cursor:"pointer",display:"flex",alignItems:"center",gap:8,textAlign:"left"}}>
                            <span style={{fontSize:11,color:c.so,transform:expanded?"rotate(90deg)":"none",transition:"transform .15s"}}>▶</span>
                            <span style={{fontSize:15}}>📁</span>
                            <span style={{fontSize:13,fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project.name}</span>
                            <span style={{fontSize:10,color:c.fa}}>{projectChats.length}</span>
                          </button>
                          {expanded&&<div style={{paddingLeft:22}}>
                            {projectChats.map(chat=>{
                              const active=currentSessionId===chat.id;
                              const unread=!active&&isConversationUnread('chat',chat);
                              return <button key={chat.id} onClick={()=>{setSelectedProject(project);loadSession(chat.id);setNew(false);if(mob)setSbO("closed");}} style={{width:"100%",padding:"7px 9px",borderRadius:7,border:"none",background:active?c.ac+"12":"transparent",color:active?c.ac:c.so,textAlign:"left",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
                                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{chat.title||"New conversation"}</span>
                                {unread&&<span aria-label="Unread message" title="Unread" style={{width:8,height:8,borderRadius:"50%",background:"#3b82f6",boxShadow:"0 0 0 2px rgba(59,130,246,.15)",flexShrink:0}}/>}
                              </button>;
                            })}
                            <button onClick={()=>{setSelectedProject(project);newSession();setNew(true);if(mob)setSbO("closed");}} style={{width:"100%",padding:"7px 9px",borderRadius:7,border:"none",background:"transparent",color:c.ac,textAlign:"left",fontSize:11,fontWeight:600,cursor:"pointer"}}>+ New chat in project</button>
                          </div>}
                        </div>;
                      })}
                    </div>}
                    <div style={{padding:"2px 8px 6px",fontSize:10,fontWeight:700,color:c.fa,textTransform:"uppercase",letterSpacing:".6px"}}>Recent Chats</div>
                    {sessions.filter(s=>!s.project_id).filter(s=>{
                      if(!searchQuery.trim()) return true;
                      const title = cleanChatTitle(s.title);
                      return title.toLowerCase().includes(searchQuery.toLowerCase());
                    }).length===0?(
                      <div style={{padding:"20px 8px",textAlign:"center",fontSize:11,color:c.fa}}>{searchQuery.trim()?"No chats found":"No unfiled chats"}</div>
                    ):sessions.filter(s=>!s.project_id).filter(s=>{
                      if(!searchQuery.trim()) return true;
                      const title = cleanChatTitle(s.title);
                      return title.toLowerCase().includes(searchQuery.toLowerCase());
                    }).map(s=>{
                      const isActive = currentSessionId===s.id;
                      const unread = !isActive&&isConversationUnread('chat',s);
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
                            <div style={{fontSize:15,fontWeight:isActive||unread?600:500,color:isActive?c.ac:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:30,display:"flex",alignItems:"center",gap:8}}>
                              {/form\s+submission/i.test(title)&&<span title="Form submission" style={{display:"inline-flex",color:c.ac,flexShrink:0}}><AppMenuIcon name="form" size={16}/></span>}
                              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>
                              {unread&&<span aria-label="Unread message" title="Unread" style={{width:8,height:8,borderRadius:"50%",background:"#3b82f6",boxShadow:"0 0 0 2px rgba(59,130,246,.15)",flexShrink:0}}/>}
                            </div>
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
                                <button onClick={()=>{
                                  if(projects.length===0){
                                    setOauthToast({type:'error',msg:'No projects yet — create one first'}); setTimeout(()=>setOauthToast(null),4000);
                                    return;
                                  }
                                  setProjectPickerChat(projectPickerChat===s.id?null:s.id);
                                }} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:c.tx,display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.tx} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                  {s.project_id?'Move to project':'Add to project'} <span style={{marginLeft:"auto"}}>›</span>
                                </button>
                                {projectPickerChat===s.id&&<div style={{margin:"2px 4px 5px",padding:4,borderRadius:7,background:c.sf,border:"1px solid "+c.ln}}>
                                  {projects.map(project=><button key={project.id} onClick={async()=>{
                                    try{
                                      const h=await getAuthHeaders();
                                      const res=await fetch(`/api/projects/${project.id}/conversations`,{method:'PATCH',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({action:'add',sessionIds:[s.id]})});
                                      const data=await res.json();
                                      if(!res.ok||!data.success)throw new Error(data.error||'Move failed');
                                      setSessions(list=>list.map(chat=>chat.id===s.id?{...chat,project_id:project.id}:chat));
                                      setExpandedProjects(current=>new Set([...current,project.id]));
                                      setOpenChatMenu(null);setProjectPickerChat(null);
                                      setOauthToast({type:'success',msg:`Moved to "${project.name}"`});setTimeout(()=>setOauthToast(null),3000);
                                    }catch(err){setOauthToast({type:'error',msg:err.message});setTimeout(()=>setOauthToast(null),4000);}
                                  }} style={{width:"100%",padding:"7px 8px",border:"none",borderRadius:6,background:s.project_id===project.id?c.ac+"15":"transparent",color:c.tx,textAlign:"left",fontSize:12,cursor:"pointer"}}>📁 {project.name}{s.project_id===project.id?' ✓':''}</button>)}
                                  {s.project_id&&<button onClick={async()=>{
                                    const project=projects.find(project=>project.id===s.project_id);
                                    if(!project)return;
                                    try{
                                      const h=await getAuthHeaders();
                                      const res=await fetch(`/api/projects/${project.id}/conversations`,{method:'PATCH',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({action:'remove',sessionIds:[s.id]})});
                                      const data=await res.json();
                                      if(!res.ok||!data.success)throw new Error(data.error||'Remove failed');
                                      setSessions(list=>list.map(chat=>chat.id===s.id?{...chat,project_id:null}:chat));
                                      setOpenChatMenu(null);setProjectPickerChat(null);
                                      setOauthToast({type:'success',msg:'Moved to Recent Chats'});setTimeout(()=>setOauthToast(null),3000);
                                    }catch(err){setOauthToast({type:'error',msg:err.message});setTimeout(()=>setOauthToast(null),4000);}
                                  }} style={{width:"100%",padding:"7px 8px",border:"none",borderTop:"1px solid "+c.ln,background:"transparent",color:c.so,textAlign:"left",fontSize:12,cursor:"pointer"}}>Remove from project</button>}
                                </div>}
                                <button onClick={()=>{setOpenChatMenu(null);if(confirm('Delete this conversation?'))deleteSession(s.id);}} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:"#ef4444",display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                    </>
                    )}
                  </div>
                  )}
                  {pg==="work"&&(
                    <WorkSessionsSidebar
                      c={c}
                      agentId={currentAgentId}
                      activeId={activeWorkSessionId}
                      onSelect={(id,projectId)=>{
                        setActiveWorkSessionId(id);
                        setSelectedProject(projectId?projects.find(project=>project.id===projectId)||null:null);
                        if(mob)setSbO("closed");
                      }}
                      projects={projects}
                      onProjectChange={(id,projectId)=>{
                        if(activeWorkSessionId!==id)return;
                        setSelectedProject(projectId?projects.find(project=>project.id===projectId)||null:null);
                      }}
                      searchQuery={searchQuery}
                    />
                  )}
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
                      <div style={{width:30,height:30,borderRadius:8,background:userImg?"transparent":"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden",pointerEvents:"none"}}>
                        {userImg?<img src={userImg} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:meInitial}
                      </div>
                      <div style={{flex:1,textAlign:"left"}}><div style={{fontSize:13,fontWeight:600,color:c.tx}}>{meDisplayName}</div><div style={{fontSize:11,color:c.so,textTransform:"capitalize"}}>{meRole}</div></div>
                      <span style={{fontSize:12,color:c.so,transform:umO?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s"}}>▾</span>
                    </button>
                    {umO&&(
                      <div style={{position:"absolute",bottom:"100%",left:14,right:14,background:c.cd,border:"1px solid "+c.ln,borderRadius:12,boxShadow:"0 -8px 24px rgba(0,0,0,.15)",overflow:"hidden",marginBottom:4,zIndex:70}}>
                        {[
                          {ic:"business",l:"Business Profile",fn:()=>{setPg("business");setUmO(false);}},
                          {ic:"billing",l:"Billing",fn:()=>{setPg("billing");setUmO(false);}},
                          {ic:"desktop",l:"Download Desktop App",fn:()=>{setPg("dispatch");setUmO(false);}},
                          {ic:"skills",l:"Skills",fn:()=>{setPg("skills");setUmO(false);}},
                          {ic:"settings",l:"Settings",fn:()=>{setPg("settings");setUmO(false);}},
                          {ic:"developer",l:"Developer Mode",fn:()=>setUmO(false)},
                          {ic:dark?"light":"dark",l:dark?"Light Mode":"Dark Mode",fn:()=>{setDark(!dark);setUmO(false);}},
                          {ic:"logout",l:"Log out",fn:async()=>{setUmO(false);await supabase.auth.signOut();}},
                        ].map((item,i,arr)=>(
                          <button key={i} onClick={item.fn} style={{width:"100%",textAlign:"left",padding:"11px 14px",border:"none",cursor:"pointer",background:"transparent",fontSize:13,color:i===arr.length-1?"#ef4444":c.tx,display:"flex",alignItems:"center",gap:10,borderBottom:i<arr.length-1?"1px solid "+c.ln+"60":"none"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <span style={{display:"inline-flex",color:i===arr.length-1?"#ef4444":"currentColor",flexShrink:0}}><AppMenuIcon name={item.ic} size={17}/></span>{item.l}
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
        <div style={{flex:1,minWidth:0,minHeight:0,height:"100%",overflow:(pg==="chat"||pg==="work")?"hidden":"auto"}}>

          {/* ══ CHAT ══ */}
          {pg==="chat"&&conferenceMode&&(
            <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
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
            <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
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
                    <button onClick={()=>{setRightTab("live");setScrM("docked");}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:700,color:c.so,flexShrink:0,transition:"background .15s,color .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=c.sf;e.currentTarget.style.color=c.tx;}} onMouseLeave={e=>{e.currentTarget.style.background=c.cd;e.currentTarget.style.color=c.so;}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:c.ac,animation:"pulse 1.5s ease infinite"}}/>
                      {aFN} Live
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
                      <div style={{display:"flex",alignItems:"flex-end",gap:8,padding:mob?"12px":"14px 16px",borderRadius:20,border:"1.5px solid "+(voiceActive?c.ac:c.ln),background:c.inp,transition:"border-color .2s"}}>
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
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l4.5 7.8H7.5L12 2z"/><path d="M7.5 9.8L3 17.5h9l-4.5-7.7z"/><path d="M16.5 9.8L12 17.5h9l-4.5-7.7z"/></svg>, label:"Choose from Google Drive", action:()=>{setDrivePickerOpen(true);setShowPlusMenu(false);}},
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, label:"Take a screenshot", action:takeScreenshot},
                                ].map((item,i)=>(
                                  <button key={i} onClick={item.action} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",color:c.tx,fontSize:13,textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <span style={{color:c.so,flexShrink:0}}>{item.icon}</span>{item.label}
                                  </button>
                                ))}

                                <div style={{height:1,background:c.ln,margin:"4px 0"}}/>
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Start</div>
                                {[
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, label:"Build a website", sub:"Starts coding work", action:()=>{setPg("work");setShowPlusMenu(false);}},
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="13" rx="3"/><path d="M4 10a8 8 0 0 0 16 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>, label:"New work task", sub:"Goes to Work tab", action:()=>{setPg("work");setShowPlusMenu(false);}},
                                ].map((item,i)=>(
                                  <button key={i} onClick={item.action} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",color:c.tx,fontSize:13,textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <span style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"#fff"}}>{item.icon}</span></span>
                                    <div><div style={{fontWeight:600}}>{item.label}</div><div style={{fontSize:11,color:c.so,marginTop:1}}>{item.sub}</div></div>
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
                        <textarea value={tx} onChange={e=>setTx(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}} placeholder={voiceActive?(voiceStatusText||"Listening")+"…":"Ask anything..."} rows={1} style={{flex:1,padding:"10px 0",border:"none",fontSize:15,fontFamily:"inherit",background:"transparent",color:c.tx,resize:"none",lineHeight:1.4,maxHeight:120,overflowY:"auto",outline:"none"}}/>
                        <button onClick={toggleVoice} title={isSarahVoiceAgent?(convaiConnected?"End Sarah voice":"Speak with Sarah"):"Dictate message"} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:voiceActive?c.ac+"18":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative",marginBottom:2}}>
                          {voiceActive&&<span style={{position:"absolute",inset:-4,borderRadius:14,border:"2px solid "+c.ac,animation:"pulse 1.2s ease infinite",opacity:0.4}}/>}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={voiceActive?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>
                        </button>
                        <button onClick={doSend} disabled={!tx.trim()} title={loading?"Queue this message":"Send"} style={{width:36,height:36,borderRadius:10,border:"none",cursor:tx.trim()?"pointer":"not-allowed",background:tx.trim()?"linear-gradient(135deg,#F4A261,#E76F8B)":"transparent",color:tx.trim()?"#fff":c.fa,fontSize:16,fontWeight:700,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}}>➜</button>
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
                  <div style={{flex:1,minHeight:0,display:"flex",minWidth:0,position:"relative"}}>
                    <div data-testid="chat-message-scroll" ref={chatScrollRef} onScroll={handleChatScroll} style={{flex:1,minWidth:0,minHeight:0,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",touchAction:"pan-y",overscrollBehaviorY:"contain",background:c.bg,padding:mob?"14px 12px":"18px 24px",transition:"padding .25s ease"}}>
                      {messages.map((m,messageIndex)=>{
                        const cards=m.b?parseMessageCards(m.t):[];
                        const uberEatsResults=m.b?parseUberEatsResults(m.t):null;
                        const displayText=m.b?cleanMessageText(m.t):m.t;
                        const clarifyData=m.clarification||(m.b?parseClarification(m.t):null);
                        const currentMediaReady=m.b&&(/\/api\/public\/video\//i.test(m.t||"")||/!\[[^\]]*\]\(https?:\/\/[^)]+\.(?:png|jpe?g|webp)/i.test(m.t||""));
                        const pendingMediaKind=m.b&&!currentMediaReady&&/still pending|pending verification|rendering|generating|generation in progress/i.test(m.t||"")
                          ? requestedMediaKind(m.t)||(/bloom_studio/i.test(m.t||"")?"video":null)
                          : null;
                        const laterMediaReady=messages.slice(messageIndex+1).some(next=>next.b&&(/\/api\/public\/video\//i.test(next.t||"")||/!\[[^\]]*\]\(https?:\/\/[^)]+\.(?:png|jpe?g|webp)/i.test(next.t||"")));
                        // Processing messages are temporary UI state. Once a
                        // finished deliverable arrives, replace the placeholder
                        // instead of leaving it stacked above the real media.
                        if(pendingMediaKind&&laterMediaReady) return null;
                        return (
                        <div key={m.id} style={{display:"flex",justifyContent:m.b?"flex-start":"flex-end",marginBottom:16,flexDirection:"column",alignItems:m.b?"flex-start":"flex-end"}}>
                          <div style={{display:"flex",justifyContent:m.b?"flex-start":"flex-end",width:"100%"}}>
                            {m.b&&<div style={{marginRight:8,marginTop:2,flexShrink:0}}><Face sz={mob?26:28} agent={agent}/></div>}
                            <div style={{maxWidth:mob?(m.b?"calc(100% - 36px)":"92%"):"75%",minWidth:0,padding:"10px 14px",fontSize:mob?13:14,lineHeight:1.6,color:m.b?c.tx:"#fff",borderRadius:m.b?"4px 16px 16px 16px":"16px 4px 16px 16px",background:m.b?c.cd:"linear-gradient(135deg,#F4A261,#E76F8B)",border:m.b?"1px solid "+c.ln:"none",wordBreak:"break-word",overflowWrap:"anywhere",boxShadow:m.b?"none":"0 2px 8px rgba(244,162,97,0.25)"}}>
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
                              {pendingMediaKind&&!laterMediaReady&&<MediaProcessingCard kind={pendingMediaKind} c={c}/>}
                              {displayText&&(m.b?(
                                <div className="sarah-msg" style={{fontSize:15,lineHeight:1.65,color:c.tx}}>
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={chatMarkdownComponents}
                                  >{displayText}</ReactMarkdown>
                                  {uberEatsResults&&<UberEatsResultsCard results={uberEatsResults} c={c}/>}
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
                                <ClarificationCardInline clarification={clarifyData} onSelect={(opt)=>send(`Answer to "${clarifyData.question}": ${opt.label}${opt.description?` — ${opt.description}`:''}`)} c={c} disabled={loading||!!messages.find(mm=>mm.id>m.id&&!mm.b)}/>
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
                          <div style={{
                            flex:requestedMediaKind([...messages].reverse().find(item=>!item.b)?.t||"")?"0 1 456px":"1",
                            width:requestedMediaKind([...messages].reverse().find(item=>!item.b)?.t||"")?"min(calc(100% - 76px), 456px)":"auto",
                            maxWidth:requestedMediaKind([...messages].reverse().find(item=>!item.b)?.t||"")?456:"none",
                            minWidth:0
                          }}>
                            <div style={{padding:"14px 18px",borderRadius:"6px 18px 18px 18px",background:c.cd,border:"1px solid "+c.ln,minWidth:0}}>
                              {requestedMediaKind([...messages].reverse().find(item=>!item.b)?.t||"")&&<MediaProcessingCard kind={requestedMediaKind([...messages].reverse().find(item=>!item.b)?.t||"")} c={c}/>}
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
                                    <LiveProgressNarration c={c} sessionId={sid.current}/>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <button onClick={stopSarah} title={"Stop "+aFN} style={{width:32,height:32,borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:14,color:"#ea4335",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(234,67,53,0.1)"} onMouseLeave={e=>e.currentTarget.style.background=c.cd}>■</button>
                        </div>
                      )}
                      <ExecutionCommandCards c={c} sessionId={sid.current} source="chat"/>
                      {showThinking && <ThinkingPanel c={c} sessionId={sid.current} isOpen={showThinking} onClose={()=>setShowThinking(false)} agentName={agent.nm}/>}
                      <div ref={btm}/>
                    </div>
                    {showScrollDown&&(
                      <button onClick={scrollToLatest} title="Scroll to latest" style={{position:"absolute",bottom:mob?72:80,right:mob?16:(scrM!=="hidden"?500:16),zIndex:10,width:36,height:36,borderRadius:18,background:c.cd,border:"1px solid "+c.ln,boxShadow:"0 2px 8px rgba(0,0,0,0.18)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"opacity .2s"}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.so} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                    )}
                    {!compact&&scrM!=="hidden"&&(
                      <ResizablePanel c={c} defaultWidth={480} minWidth={280} maxWidth={800}>
                        <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
                          {/* ── Right panel tabs ── */}
                          <div style={{display:"flex",borderBottom:"1px solid "+c.ln,background:c.sf,flexShrink:0}}>
                            <button onClick={()=>setRightTab("live")} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"none",borderBottom:rightTab==="live"?"2px solid "+c.ac:"2px solid transparent",background:"transparent",color:rightTab==="live"?c.tx:c.so,cursor:"pointer",letterSpacing:"0.5px"}}>Live</button>
                            <button onClick={()=>setRightTab("browser")} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"none",borderBottom:rightTab==="browser"?"2px solid "+c.ac:"2px solid transparent",background:"transparent",color:rightTab==="browser"?c.tx:c.so,cursor:"pointer",letterSpacing:"0.5px"}}>Browser</button>
                            <button onClick={()=>setRightTab("artifact")} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"none",borderBottom:rightTab==="artifact"?"2px solid "+c.ac:"2px solid transparent",background:"transparent",color:rightTab==="artifact"?c.tx:c.so,cursor:"pointer",letterSpacing:"0.5px",position:"relative"}}>
                              Files
                              {activeArtifact&&<span style={{position:"absolute",top:4,right:"20%",width:6,height:6,borderRadius:"50%",background:c.ac}}/>}
                            </button>
                            <button onClick={()=>setScrM("hidden")} title="Collapse panel" style={{width:36,padding:"8px 0",fontSize:13,border:"none",borderBottom:"2px solid transparent",background:"transparent",color:c.so,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={c.so} strokeWidth="2"><path d="M6 3l5 5-5 5"/></svg>
                            </button>
                          </div>

                          {/* ── Live avatar tab ── */}
                          {rightTab==="live"&&(
                            <LiveAvatarPanel c={c} agentId={currentAgentId} agentName={agent.nm} agentImg={agent.img} lastSarahText={messages.filter(m=>m.b).slice(-1)[0]?.t||""}/>
                          )}

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
                                onRequestChanges={(name,fileId)=>{setRightTab("browser");setTx(`Edit the file "${name}" (fileId: ${fileId||''}, sessionId: ${sid.current||''}). Use edit_artifact to modify this EXISTING file. Here is what I want changed: `);}}
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
                        {isSarahVoiceAgent&&(convaiConnected||convaiConnecting)&&(
                          <>
                            <span style={{width:4,height:4,borderRadius:"50%",background:c.fa,margin:"0 2px"}}/>
                            <span style={{fontSize:11,color:c.ac,fontWeight:600}}>{voiceStatusText}</span>
                          </>
                        )}
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
                      <div style={{display:"flex",alignItems:"flex-end",gap:6,padding:"10px 12px 10px 8px",borderRadius:20,border:"1.5px solid "+(voiceActive?c.ac:c.ln),background:c.inp,transition:"border-color .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.1)"}}>
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
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Start</div>
                                {[
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, label:"Build a website", sub:"Starts coding work", action:()=>{setPg("work");setShowPlusMenu(false);}},
                                  {icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="13" rx="3"/><path d="M4 10a8 8 0 0 0 16 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>, label:"New work task", sub:"Goes to Work tab", action:()=>{setPg("work");setShowPlusMenu(false);}},
                                ].map((item,i)=>(
                                  <button key={i} onClick={item.action} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",color:c.tx,fontSize:13,textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <span style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"#fff"}}>{item.icon}</span></span>
                                    <div><div style={{fontWeight:600}}>{item.label}</div><div style={{fontSize:11,color:c.so,marginTop:1}}>{item.sub}</div></div>
                                  </button>
                                ))}
                                <div style={{height:1,background:c.ln,margin:"4px 0"}}/>
                                {/* Connectors section */}
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Connectors</div>
                                {/* Active connectors — loaded dynamically, shown as toggles */}
                                {[
                                  {slug:"ghl",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label:"BLOOM CRM"},
                                  {slug:"google-calendar",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label:"Google Calendar"},
                                  {slug:"google-drive",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>, label:"Google Drive"},
                                  {slug:"gmail",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label:"Gmail"},
                                  {slug:"canva",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>, label:"Canva"},
                                ].filter(conn=>activeConnectors[conn.slug]||conn.slug==="ghl").map((conn,i)=>(
                                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                    <div style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:c.tx}}>
                                      <span style={{color:activeConnectors[conn.slug]?"#F4A261":c.so,flexShrink:0}}>{conn.icon}</span>{conn.label}
                                    </div>
                                    <div style={{width:32,height:18,borderRadius:9,background:activeConnectors[conn.slug]?"linear-gradient(135deg,#F4A261,#E76F8B)":c.ln,position:"relative",transition:"all .2s",cursor:"pointer",flexShrink:0}}>
                                      <div style={{position:"absolute",top:2,left:activeConnectors[conn.slug]?14:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
                                    </div>
                                  </div>
                                ))}
                                <div style={{height:1,background:c.ln,margin:"4px 0"}}/>
                                <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.06em",textTransform:"uppercase"}}>Tools</div>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",cursor:"pointer",transition:"background .12s"}} onClick={()=>setShowThinking(t=>!t)} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <div style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:c.tx}}>
                                    <span style={{color:showThinking?"#F4A261":c.so,flexShrink:0}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 4 7.5.6.6 1 1.5 1 2.5v1h4v-1c0-1 .4-1.9 1-2.5 2-2 4-4.5 4-7.5a7 7 0 0 0-7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg></span>Thinking Stream
                                  </div>
                                  <div style={{width:32,height:18,borderRadius:9,background:showThinking?"linear-gradient(135deg,#F4A261,#E76F8B)":c.ln,position:"relative",transition:"all .2s",cursor:"pointer",flexShrink:0}}>
                                    <div style={{position:"absolute",top:2,left:showThinking?14:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
                                  </div>
                                </div>
                                <button onClick={()=>{setPg("customize");setShowPlusMenu(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"9px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,textAlign:"left",fontWeight:700,transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="url(#mgGrad)" strokeWidth="2" strokeLinecap="round"><defs><linearGradient id="mgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F4A261"/><stop offset="100%" stopColor="#E76F8B"/></linearGradient></defs><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                                  <span style={{background:"linear-gradient(135deg,#F4A261,#E76F8B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Manage connectors</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <textarea value={tx} onChange={e=>{setTx(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,200)+"px";}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}} placeholder={voiceActive?(voiceStatusText||"Listening")+"…":mob?"Message…":`Tell ${aFN} what you need…`} rows={2} style={{flex:1,padding:"6px 4px",border:"none",fontSize:14,fontFamily:"inherit",background:"transparent",color:c.tx,resize:"none",lineHeight:1.6,minHeight:48,maxHeight:200,overflowY:"auto",outline:"none"}}/>
                        <button onClick={toggleVoice} title={isSarahVoiceAgent?(convaiConnected?"End Sarah voice":"Speak with Sarah"):"Dictate message"} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",background:voiceActive?c.ac+"22":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative",marginBottom:2}}>
                          {voiceActive&&<span style={{position:"absolute",inset:-3,borderRadius:12,border:"2px solid "+c.ac,animation:"pulse 1.2s ease infinite",opacity:0.4}}/>}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={voiceActive?c.ac:c.so} strokeWidth="2" strokeLinecap="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>
                        </button>
                        <button onClick={doSend} disabled={!tx.trim()&&pendingFiles.length===0} title={loading?"Queue this message":"Send"} style={{width:36,height:36,borderRadius:10,border:"none",cursor:(tx.trim()||pendingFiles.length>0)?"pointer":"not-allowed",background:(tx.trim()||pendingFiles.length>0)?"linear-gradient(135deg,#F4A261,#E76F8B)":"transparent",color:(tx.trim()||pendingFiles.length>0)?"#fff":c.fa,fontSize:16,fontWeight:700,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                      </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ BLOOMIE ADMIN ══ */}
          {pg==="bloomie"&&(
            <BloomieAdmin c={c} mob={mob} agentId={currentAgentId} agentName={aFN} projectId={selectedProject?.id||null} onOpenBrandKit={()=>setPg("business")}/>
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
                          await fetch('/api/agent/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...newTask,agentId:currentAgentId})});
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
                              if(name){try{await fetch('/api/agent/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,instruction,taskType,frequency,runTime,agentId:currentAgentId})});created++;}catch{}}
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
                            (async()=>{await fetch(`/api/agent/tasks/${task.taskId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!task.enabled,agentId:currentAgentId})});loadActivity();})();
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
                          <button onClick={(e)=>{e.stopPropagation();if(confirm('Delete this task?')){(async()=>{await fetch(`/api/agent/tasks/${task.taskId}?agentId=${currentAgentId}`,{method:'DELETE'});loadActivity();})();}}} style={{width:28,height:28,borderRadius:6,border:"1px solid "+c.ln,background:"transparent",cursor:"pointer",color:c.fa,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
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
                            await fetch(`/api/agent/tasks/${editTask.taskId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,agentId:currentAgentId})});
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
                            await fetch('/api/agent/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...calTask,taskType,agentId:currentAgentId})});
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
            <div style={{padding:mob?"16px 12px 40px":"20px 20px 40px",width:"100%",maxWidth:1000,minWidth:0,overflowX:"hidden",boxSizing:"border-box",margin:"0 auto"}}>
              <div style={{marginBottom:16,display:"flex",flexDirection:mob?"column":"row",gap:12,alignItems:mob?"stretch":"center",justifyContent:"space-between"}}>
                <div>
                  <h1 style={{fontSize:mob?20:24,fontWeight:700,color:c.tx,marginBottom:4}}>Files & Deliverables</h1>
                  <p style={{fontSize:13,color:c.so}}>{conferenceMode?'All content from your team':'All content '+aFN+' has created for you'}</p>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",width:mob?"100%":"auto",minWidth:0}}>
                  <input value={filesSearch||''} onChange={e=>setFilesSearch(e.target.value)} placeholder="Search files..." style={{padding:"8px 14px",borderRadius:10,border:"1.5px solid "+c.ln,fontSize:13,fontFamily:"inherit",background:c.inp,color:c.tx,width:mob?"100%":180}}/>
                  <select value={filesTypeFilter} onChange={e=>setFilesTypeFilter(e.target.value)} style={{padding:"8px 10px",borderRadius:10,border:"1.5px solid "+c.ln,fontSize:12,fontFamily:"inherit",background:c.inp,color:c.tx,cursor:"pointer"}}>
                    <option value="all">All Types</option>
                    <option value="html">Websites</option>
                    <option value="image">Images</option>
                    <option value="markdown">Documents</option>
                    <option value="code">Code</option>
                    <option value="document">PDF/DOCX</option>
                  </select>
                  <select value={filesSort} onChange={e=>setFilesSort(e.target.value)} style={{padding:"8px 10px",borderRadius:10,border:"1.5px solid "+c.ln,fontSize:12,fontFamily:"inherit",background:c.inp,color:c.tx,cursor:"pointer"}}>
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="name">Name A-Z</option>
                  </select>
                </div>
              </div>
              {filesLoading ? (
                <div style={{textAlign:"center",padding:40,color:c.so}}>Loading files...</div>
              ) : files.length === 0 ? (
                <div style={{textAlign:"center",padding:60,color:c.so,background:c.cd,borderRadius:16,border:"1px solid "+c.ln}}>
                  
                  <div style={{fontSize:15,fontWeight:600,color:c.tx,marginBottom:6}}>No files yet</div>
                  <div style={{fontSize:13}}>Ask {aFN} to create content — blog posts, email campaigns, SOPs, reports — and they'll appear here.</div>
                </div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:mob?"minmax(0, 1fr)":"repeat(auto-fill, minmax(280px, 1fr))",gap:14,width:"100%",minWidth:0,overflow:"hidden"}}>
                  {files.filter(f=>{
                    if(filesSearch&&!f.name?.toLowerCase().includes(filesSearch.toLowerCase())&&!f.description?.toLowerCase().includes(filesSearch.toLowerCase())) return false;
                    if(filesTypeFilter!=='all'){
                      const ext=(f.name||'').split('.').pop()?.toLowerCase()||'';
                      if(filesTypeFilter==='html'&&ext!=='html') return false;
                      if(filesTypeFilter==='image'&&f.fileType!=='image') return false;
                      if(filesTypeFilter==='markdown'&&ext!=='md') return false;
                      if(filesTypeFilter==='code'&&!['js','py','css','jsx','ts','tsx'].includes(ext)) return false;
                      if(filesTypeFilter==='document'&&!['pdf','docx','doc','xlsx','pptx','csv'].includes(ext)) return false;
                    }
                    return true;
                  }).sort((a,b)=>{
                    if(filesSort==='oldest') return new Date(a.approvedAt||a.createdAt||0)-new Date(b.approvedAt||b.createdAt||0);
                    if(filesSort==='name') return (a.name||'').localeCompare(b.name||'');
                    return new Date(b.approvedAt||b.createdAt||0)-new Date(a.approvedAt||a.createdAt||0);
                  }).map((f)=>{
                    const ext=(f.name||'').split('.').pop()?.toLowerCase()||'';
                    const icon=f.fileType==='image'?'🖼️':ext==='html'?'🌐':ext==='md'?'📝':ext==='js'||ext==='py'?'💻':ext==='pdf'?'📄':'📎';
                    const sizeStr=f.fileSize>1048576?`${(f.fileSize/1048576).toFixed(1)}MB`:f.fileSize>1024?`${(f.fileSize/1024).toFixed(1)}KB`:`${f.fileSize||0}B`;
                    const date=f.approvedAt?new Date(f.approvedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
                    return (
                      <div key={f.fileId} style={{width:"100%",maxWidth:"100%",minWidth:0,overflow:"hidden",background:c.cd,borderRadius:14,border:"1px solid "+c.ln,transition:"border-color .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=isBinaryArtifactName(f.name)?c.gr:c.ac}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=c.ln}>
                        {/* Preview area */}
                        <div style={{height:120,background:c.sf,display:"flex",alignItems:"center",justifyContent:"center",borderBottom:"1px solid "+c.ln,cursor:"pointer",position:"relative",overflow:"hidden"}}
                          onClick={async()=>{
                            if(f.fileType==='image'){
                              setChatLightbox({src:f.storagePath||f.previewUrl||`/api/files/preview/${f.fileId}`,alt:f.name});
                              return;
                            }
                            if(isBinaryArtifactName(f.name)){
                              setPreviewFile({...f,name:f.name,fileId:f.fileId,fileType:f.fileType,slug:f.slug||null,sessionId:f.sessionId||null});
                              return;
                            }
                            try{
                              const pr=await fetch(`/api/files/preview/${f.fileId}`);
                              if(pr.headers.get('content-type')?.includes('json')){
                                const pd=await pr.json();
                                setPreviewFile({name:f.name,content:pd.content||'No content',fileId:f.fileId,fileType:f.fileType,slug:f.slug||null,sessionId:f.sessionId||null});
                              } else {
                                setPreviewFile({name:f.name,content:'Binary file — use Download button',fileId:f.fileId,fileType:f.fileType});
                              }
                            }catch{setPreviewFile({name:f.name,content:'Failed to load preview',fileId:f.fileId});}
                          }}>
                          {f.fileType==='image' ? (
                            <img
                              src={`/api/files/thumbnail/${f.fileId}`}
                              alt={f.name}
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              style={{width:"100%",height:"100%",objectFit:"cover",cursor:"zoom-in"}}
                            />
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
                          ) : isBinaryArtifactName(f.name) ? (
                            <BinaryArtifactCardPreview file={f} c={c} />
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
                        <div style={{padding:"12px 14px 14px",minWidth:0,overflow:"hidden"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <div style={{fontSize:13,fontWeight:600,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{f.name}</div>
                            <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:f.status==='approved'?"rgba(52,168,83,0.15)":"rgba(244,162,97,0.15)",color:f.status==='approved'?c.gr:c.ac}}>{f.status==='approved'?'APPROVED':'PENDING'}</span>
                          </div>
                          {f.description&&<div style={{fontSize:11,color:c.so,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.description}</div>}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:10,color:c.fa}}>{sizeStr} · {date||'Just now'}</span>
                            <button onClick={async()=>{if(confirm('Remove?')){await fetch(`/api/files/artifacts/${f.fileId}`,{method:'DELETE'});setFiles(p=>p.filter(x=>x.fileId!==f.fileId));}}} style={{width:22,height:22,borderRadius:6,border:'1px solid rgba(234,67,53,0.25)',background:'transparent',cursor:'pointer',fontSize:12,color:'#ea4335',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                          </div>
                          {ext==='html'&&(
                            <div style={{display:'flex',gap:6,marginTop:8}}>
                              <button onClick={async(e)=>{e.stopPropagation();
                                try{
                                  let htmlContent=f.content;
                                  if(!htmlContent){try{const cr=await fetch('/api/files/publish/'+f.fileId);if(cr.ok){htmlContent=await cr.text();}}catch{}}
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
                            <div style={{display:'flex',gap:6,marginTop:8,alignItems:'flex-start'}}>
                              <GoogleImportButton file={f} c={c} compact />
                              <a href={`/api/files/download/${f.fileId}`} download style={{flex:1,display:'block',textAlign:'center',padding:'7px 0',borderRadius:8,border:'1px solid '+c.ln,background:c.cd,fontSize:11,fontWeight:600,color:c.ac,textDecoration:'none'}}>↓ Download</a>
                            </div>
                          )}
                        </div>
                      </div>

                    );
                  })}
                </div>
              )}
              {!filesLoading&&filesTotal>20&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:18,flexWrap:"wrap"}}>
                  <button
                    onClick={()=>setFilesPage(p=>Math.max(1,p-1))}
                    disabled={filesPage<=1}
                    style={{padding:"8px 14px",borderRadius:9,border:"1px solid "+c.ln,background:c.cd,color:filesPage<=1?c.fa:c.tx,cursor:filesPage<=1?"default":"pointer",fontFamily:"inherit",fontWeight:600}}
                  >Previous</button>
                  <span style={{fontSize:12,color:c.so,fontWeight:600}}>Page {filesPage} of {Math.max(1,Math.ceil(filesTotal/20))}</span>
                  <button
                    onClick={()=>setFilesPage(p=>Math.min(Math.ceil(filesTotal/20),p+1))}
                    disabled={filesPage>=Math.ceil(filesTotal/20)}
                    style={{padding:"8px 14px",borderRadius:9,border:"1px solid "+c.ln,background:c.cd,color:filesPage>=Math.ceil(filesTotal/20)?c.fa:c.tx,cursor:filesPage>=Math.ceil(filesTotal/20)?"default":"pointer",fontFamily:"inherit",fontWeight:600}}
                  >Next</button>
                </div>
              )}
            </div>
          )}

          {/* ══ PROJECTS — Organize conversations into projects ══ */}
          {pg==="projects"&&(
            selectedProject?(
              <>
              <ProjectWorkspacePage
                c={c}
                mob={mob}
                project={selectedProject}
                onBack={()=>{setSelectedProject(null);setProjectConversations([]);}}
                onProjectUpdate={updated=>{
                  setSelectedProject(updated);
                  setProjects(list=>list.map(project=>project.id===updated.id?{...project,...updated}:project));
                }}
                onOpenChat={id=>{loadSession(id);setPg("chat");}}
                onOpenWork={workId=>{
                  if(workId){
                    setActiveWorkSessionId(workId);
                  }else{
                    setNewWorkProjectId(selectedProject.id);
                    setActiveWorkSessionId(null);
                    setNewWorkSessionNonce(value=>value+1);
                  }
                  setPg("work");
                }}
              />
              {false&&(
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
                              {!msg.b?(
                                <>
                                  <label style={{width:30,height:30,borderRadius:8,background:userImg?"transparent":"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0,overflow:"hidden"}}>
                                    {userImg?<img src={userImg} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:meInitial}
                                  </label>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:13,fontWeight:600,color:c.tx,marginBottom:4}}>You</div>
                                    <div style={{fontSize:15,color:c.tx,lineHeight:1.5}}>{msg.t}</div>
                                  </div>
                                </>
                              ):(
                                <>
                                  <Face sz={30} agent={agent}/>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:13,fontWeight:600,color:c.tx,marginBottom:4}}>{agent.nm}</div>
                                    <div style={{fontSize:15,color:c.tx,lineHeight:1.5}}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><MarkdownMediaLink href={href} color={c.ac}>{children}</MarkdownMediaLink>,img:({src,alt})=><MarkdownInlineImage src={src} alt={alt}/>}}>{msg.t}</ReactMarkdown></div>
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
                          <button onClick={()=>{setPg("chat");newSession();setNew(true);}} style={{padding:"10px 20px",borderRadius:10,border:"none",background:c.gradient,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Start new chat</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )}
              </>
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
                      await loadProjectConversations(proj);
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
                          {(proj.conversation_count||0)} chats · {(proj.work_session_count||0)} Work
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
                            const h=await getAuthHeaders();
                            const res=await fetch('/api/projects',{
                              method:'POST',
                              headers:{...h,'Content-Type':'application/json'},
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
            <div style={{padding:mob?"16px 12px 40px":"32px 40px 60px",maxWidth:960,margin:"0 auto",width:"100%",minWidth:0,boxSizing:"border-box",overflowX:"hidden"}}>
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
                {connectorSections.map(({cat,items})=>(
                  <div key={cat} style={{marginBottom:28}}>
                    <div style={{fontSize:11,fontWeight:700,color:c.fa,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>{cat}</div>
                    <div style={{display:"grid",gridTemplateColumns:mob?"minmax(0,1fr)":"repeat(auto-fill,minmax(280px,1fr))",gap:10,minWidth:0,width:"100%"}}>
                      {items.map(item=>{ const isConn=!!(activeConnectors[item.slug]); const catalog=connectorCatalog[item.slug]||{}; const isSupported=item.slug==="ghl"||item.slug==="heygen"||!!connectorPlatform(item.slug)||catalog.supported; return (
                        <div key={item.slug} style={{display:"flex",alignItems:"center",gap:mob?10:14,padding:mob?"12px 12px":"14px 16px",borderRadius:12,border:"1.5px solid "+(isConn?c.ac+"55":c.ln),background:isConn?c.ac+"08":c.cd,transition:"all .2s",width:"100%",minWidth:0,maxWidth:"100%",boxSizing:"border-box",overflow:"hidden"}} onMouseEnter={e=>{if(!isConn)e.currentTarget.style.borderColor=c.ac+"44";}} onMouseLeave={e=>{if(!isConn)e.currentTarget.style.borderColor=isConn?c.ac+"55":c.ln;}}>
                          <div style={{width:40,height:40,borderRadius:10,background:isConn?"linear-gradient(135deg,#F4A261,#E76F8B)":c.sf,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:isConn?"#fff":c.so,overflow:"hidden"}}>{item.icon}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:c.tx,marginBottom:2}}>{item.name}</div>
                            <div style={{fontSize:11,color:c.so,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.desc}</div>
                          </div>
                          {isConn?(
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,maxWidth:mob?72:"none"}}>
                              <div style={{fontSize:10,fontWeight:700,color:c.ac,background:c.ac+"18",padding:"2px 8px",borderRadius:20}}>Connected</div>
                              <button onClick={e=>{e.stopPropagation();disconnectConnector(item);}} style={{fontSize:10,color:c.fa,background:"none",border:"none",cursor:"pointer",padding:"2px 4px"}}>Disconnect</button>
                            </div>
                          ):(
                            <button onClick={e=>{e.stopPropagation();connectConnector(item);}}
                              style={{padding:"7px 14px",borderRadius:8,border:"1.5px solid "+(isSupported?"#F4A261":c.ln),background:"transparent",cursor:isSupported?"pointer":"not-allowed",opacity:isSupported?1:.72,flexShrink:0,whiteSpace:"nowrap",transition:"all .15s",fontSize:12,fontWeight:700}}
                              onMouseEnter={e=>{if(!isSupported)return;e.currentTarget.style.background="linear-gradient(135deg,#F4A261,#E76F8B)";e.currentTarget.style.borderColor="transparent";e.currentTarget.querySelector("span").style.WebkitTextFillColor="#fff";e.currentTarget.querySelector("span").style.backgroundImage="none";}}
                              onMouseLeave={e=>{if(!isSupported)return;e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="#F4A261";e.currentTarget.querySelector("span").style.WebkitTextFillColor="transparent";e.currentTarget.querySelector("span").style.backgroundImage="linear-gradient(135deg,#F4A261,#E76F8B)";}}>
                              <span style={{background:isSupported?"linear-gradient(135deg,#F4A261,#E76F8B)":"none",WebkitBackgroundClip:isSupported?"text":"initial",WebkitTextFillColor:isSupported?"transparent":c.so,backgroundClip:isSupported?"text":"initial",fontWeight:700,fontSize:12}}>{isSupported?"Connect":"Soon"}</span>
                            </button>
                          )}
                        </div>
                      ); })}
                    </div>
                  </div>
                ))}
              </div>

              {showHeygenConnect&&(
                <div role="dialog" aria-modal="true" aria-label="Connect HeyGen" style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,.72)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!heygenSaving&&setShowHeygenConnect(false)}>
                  <div style={{width:"100%",maxWidth:460,borderRadius:18,border:"1px solid "+c.ln,background:c.cd,padding:22,boxShadow:"0 24px 80px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                      <div style={{width:42,height:42,borderRadius:11,background:c.sf,display:"flex",alignItems:"center",justifyContent:"center"}}>{connectorIcon("heygen.com")}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:17,fontWeight:750,color:c.tx}}>Connect HeyGen</div>
                        <div style={{fontSize:12,color:c.so,marginTop:2}}>This key belongs only to your organization.</div>
                      </div>
                      <button aria-label="Close" onClick={()=>setShowHeygenConnect(false)} disabled={heygenSaving} style={{border:"none",background:"transparent",color:c.so,fontSize:24,cursor:"pointer"}}>×</button>
                    </div>
                    <label style={{display:"block",fontSize:12,fontWeight:700,color:c.tx,marginBottom:7}}>HeyGen API key</label>
                    <input
                      type="text"
                      name="heygen-tenant-api-key"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      spellCheck="false"
                      value={heygenApiKey}
                      onChange={e=>setHeygenApiKey(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&!heygenSaving)connectHeygen();}}
                      placeholder="Paste your HeyGen API key"
                      style={{width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:10,border:"1px solid "+(heygenError?"#ef6464":c.ln),background:c.sf,color:c.tx,fontSize:14,outline:"none",WebkitTextSecurity:"disc"}}
                    />
                    <div style={{fontSize:11,color:c.so,lineHeight:1.45,marginTop:8}}>Find it in HeyGen under Settings → API. Bloomie validates it before saving and Sarah uses it only for this signed-in organization.</div>
                    {heygenError&&<div style={{fontSize:12,color:"#ef6464",marginTop:10}}>{heygenError}</div>}
                    <div style={{display:"flex",justifyContent:"flex-end",gap:9,marginTop:20}}>
                      <button onClick={()=>setShowHeygenConnect(false)} disabled={heygenSaving} style={{padding:"9px 15px",borderRadius:9,border:"1px solid "+c.ln,background:"transparent",color:c.tx,cursor:"pointer"}}>Cancel</button>
                      <button onClick={connectHeygen} disabled={heygenSaving||!heygenApiKey.trim()} style={{padding:"9px 16px",borderRadius:9,border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",color:"#fff",fontWeight:700,cursor:heygenSaving?"wait":"pointer",opacity:heygenApiKey.trim()?1:.65}}>{heygenSaving?"Checking…":"Connect HeyGen"}</button>
                    </div>
                  </div>
                </div>
              )}

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
                        <div style={{fontSize:14,fontWeight:700,color:c.tx,marginBottom:10}}>Content Strategy</div>
                        <div style={{padding:"14px 16px",borderRadius:10,background:c.sf,border:"1px solid "+c.ln}}>
                          <div style={{fontSize:13,fontWeight:700,color:c.tx}}>Question-Led Content</div>
                          <div style={{fontSize:11,color:c.so,marginTop:2,lineHeight:1.45,marginBottom:12}}>When enabled, that content type must start from a real audience question, answer it directly, and expand to the next likely question. All toggles default off.</div>
                          {[
                            ["blog","Blog posts"],
                            ["email","Emails"],
                            ["video","Video scripts"]
                          ].map(([key,label])=>(
                            <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,padding:"10px 0",borderTop:"1px solid "+c.ln}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:c.tx}}>{label}</div>
                                <div style={{fontSize:11,color:c.so,marginTop:2}}>{questionLedContent[key]?"On - must answer proven audience questions":"Off - can follow the user's chosen topic"}</div>
                              </div>
                              <button aria-label={`Toggle question-led content for ${label}`} onClick={()=>toggleQuestionLedContent(key)} disabled={questionLedLoading} style={{width:48,height:26,borderRadius:13,border:"none",cursor:questionLedLoading?"wait":"pointer",background:questionLedContent[key]?"#22c55e":"#94a3b8",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                                <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:questionLedContent[key]?25:3,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                              </button>
                            </div>
                          ))}
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
                        <PwChangePanel c={c} recoveryMode={passwordRecovery}/>
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
                          <div style={{fontSize:11,color:c.so,marginBottom:12}}>Choose which AI engine generates images for each content type. OpenRouter uses the primary provider account. GPT = best for flyers/graphics with text. Gemini = best for photorealistic people shots.</div>
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
                                    <option value="openrouter">OpenRouter Image</option>
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
          {pg==="book"&&(
            <BookWorkspace
              c={c}
              mob={mob}
              aFN={aFN}
              agentId={currentAgentId}
              onOpenChat={id=>{loadSession(id);setPg("chat");}}
            />
          )}

          {pg==="docs"&&(
            <DocsPage c={c} mob={mob} aFN={aFN} agentId={currentAgentId}/>
          )}

          {/* ══ BILLING ══ */}
          {pg==="billing"&&(<BillingPage c={c} mob={mob} aFN={aFN}/>)}
          {pg==="business"&&(<BusinessProfilePage c={c} mob={mob} userImg={userImg} setUserImg={setUserImg} meInitial={meInitial} aFN={aFN} chatLightbox={chatLightbox} setChatLightbox={setChatLightbox}/>)}
          {pg==="references"&&(<ReferenceLibrary c={c} mob={mob} agentId={currentAgentId} agentName={aFN} projectId={selectedProject?.id||null} onOpenBrandKit={()=>setPg("business")}/>)}
          {drivePickerOpen&&<GoogleDrivePicker c={c} multiple onClose={()=>setDrivePickerOpen(false)} onSelect={file=>setPendingFiles(prev=>[...prev,{name:file.name,type:file.type,base64:file.data,preview:file.type?.startsWith('image/')?`data:${file.type};base64,${file.data}`:null,source:'google_drive'}])}/>}
          {pg==="skills"&&(<SkillsPage c={c} mob={mob} aFN={aFN}/>)}
          {pg==="dispatch"&&(<DispatchPage c={c} mob={mob} currentAgent={currentAgent} agentImgUrl={agentImgUrl}/>)}
          {pg==="work"&&(<WorkTab
            c={c}
            mob={mob}
            aFN={aFN}
            agentId={currentAgentId}
            agent={agent}
            user={{nm:meDisplayName||"You",img:userImg||null,grad:"linear-gradient(135deg,#F4A261,#E76F8B)"}}
            initialProjectId={selectedProject?.id||""}
            requestedSessionId={activeWorkSessionId}
            newSessionNonce={newWorkSessionNonce}
            newSessionProjectId={newWorkProjectId}
            onActiveSessionChange={setActiveWorkSessionId}
            onNavigate={setPg}
          />)}
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
                      await fetch('/api/agent/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newTask)});
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
                      await fetch(`/api/agent/tasks/${t.taskId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!t.enabled})});
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
        <div onClick={()=>{setPreviewFile(null);setEditMode(false);setEditorFullscreen(false);}} style={{position:"fixed",inset:0,background:editorFullscreen?"transparent":"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:editorFullscreen?0:mob?8:20}}>
          <div onClick={e=>e.stopPropagation()} style={{width:editorFullscreen?"100%":"100%",maxWidth:editorFullscreen?"100%":previewFile.name?.endsWith('.html')?1100:800,height:editorFullscreen?"100vh":"90vh",background:c.cd,borderRadius:editorFullscreen?0:16,border:editorFullscreen?"none":"1px solid "+c.ln,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:editorFullscreen?"none":"0 20px 60px rgba(0,0,0,.4)",margin:editorFullscreen?0:"auto"}}>
            {/* Header */}
            <div style={{padding:"12px 20px",borderBottom:"1px solid "+c.ln,display:"flex",alignItems:"center",gap:8,background:c.sf,flexShrink:0}}>
              <span style={{fontSize:18}}>null</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{previewFile.name}</div>
              </div>
              {/* Mode toggle */}
              {!isBinaryArtifactName(previewFile.name) && (
                <div style={{display:"flex",gap:2,background:c.cd,padding:2,borderRadius:8,border:"1px solid "+c.ln}}>
                  <button onClick={()=>setEditMode(false)} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:!editMode?c.ac+"20":"transparent",color:!editMode?c.ac:c.so,fontFamily:"inherit"}}>View</button>
                  <button onClick={()=>{setEditMode(true);setEditContent(previewFile.content||'');}} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:editMode?c.ac+"20":"transparent",color:editMode?c.ac:c.so,fontFamily:"inherit"}}>Edit</button>
                </div>
              )}
              {editMode?(
                <button onClick={()=>setEditorFullscreen(!editorFullscreen)} style={{padding:"5px 12px",borderRadius:8,border:"none",background:c.gradient,fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>{editorFullscreen?"↙ Exit Full Screen":"↗ Full Screen"}</button>
              ):(
                <a href={previewFile.slug?`/p/${previewFile.slug}`:isBinaryArtifactName(previewFile.name)?`/api/files/embed/${previewFile.fileId}`:`/api/files/publish/${previewFile.fileId}`} target="_blank" rel="noopener noreferrer" style={{padding:"5px 12px",borderRadius:8,border:"none",background:c.gradient,fontSize:11,fontWeight:700,color:"#fff",textDecoration:"none"}}>↗ {previewFile.slug?"View Live":isBinaryArtifactName(previewFile.name)?"Open":"Full Screen"}</a>
              )}
              <GoogleImportButton file={previewFile} c={c} compact />
              {previewFile.name?.endsWith('.html') && (
                <button onClick={()=>{setPublishOpen(true);setPublishSlug(previewFile.slug||previewFile.name?.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'');setPublishError('');setPublishedUrl(previewFile.slug?`${window.location.origin}/p/${previewFile.slug}`:null);}} style={{padding:"5px 12px",borderRadius:8,border:previewFile.slug?"1px solid "+c.gr:"1px solid "+c.ac,background:previewFile.slug?c.gr+"15":c.ac+"15",fontSize:11,fontWeight:700,color:previewFile.slug?c.gr:c.ac,cursor:"pointer",fontFamily:"inherit"}}>
                  {previewFile.slug?"✓ Published":"Publish"}
                </button>
              )}
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
                      const r=await fetch(`/api/files/artifacts/${previewFile.fileId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})});
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
                    const fId=previewFile.fileId;
                    const sessId=previewFile.sessionId||sid.current||'';
                    const ask=`Edit the file "${name}" (fileId: ${fId}, sessionId: ${sessId}). Use edit_artifact or fullRewrite to modify this EXISTING file — do NOT create a new one. Here is what I want changed:`;
                    setPreviewFile(null);setEditMode(false);setPg('chat');setTx(ask+' ');
                  }} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+c.ac,background:c.ac+"10",cursor:"pointer",fontSize:12,fontWeight:600,color:c.ac,fontFamily:"inherit"}}>
                    ✨ Ask Bloomie to Edit
                  </button>
                  <button onClick={()=>setEditMode(false)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+c.ln,background:c.cd,cursor:"pointer",fontSize:12,fontWeight:600,color:c.so,fontFamily:"inherit",marginLeft:"auto"}}>Cancel</button>
                </div>
              </>
            ):(
              /* View Mode */
              <>
                {isBinaryArtifactName(previewFile.name)?(
                  <div style={{flex:1,minHeight:0}}>
                    <BinaryArtifactPreview file={previewFile} c={c} />
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
                        await fetch(`/api/files/publish-site/${previewFile.fileId}`,{method:'DELETE'});
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
                        const r=await fetch(`/api/files/publish-site/${previewFile.fileId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:publishSlug})});
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
                      fetch(`/api/files/preview/${previewFile.fileId}`).then(r=>r.json()).then(d=>{
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
                    const r=await fetch(`/api/files/artifacts/${previewFile.fileId}/publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:publishSlug.trim()})});
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
                    await fetch(`/api/files/artifacts/${previewFile.fileId}/unpublish`,{method:'POST'});
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
        <button onClick={()=>setHlpO(true)} style={{position:"fixed",bottom:`calc(${supportLauncherBottom}px + env(safe-area-inset-bottom))`,right:mob?8:20,width:mob?44:52,height:mob?44:52,borderRadius:"50%",border:"none",background:"linear-gradient(135deg,#F4A261,#E76F8B)",cursor:"pointer",boxShadow:"0 4px 20px rgba(231,111,139,.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:90,transition:"transform .2s, bottom .2s ease",opacity:0.85}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          <Bloom sz={36} glow/>
        </button>
      )}
      {hlpO&&(
        <div style={{position:"fixed",bottom:mob?0:24,right:mob?0:24,width:mob?"100%":380,height:mob?"85vh":520,borderRadius:mob?"20px 20px 0 0":20,background:c.cd,border:"1px solid "+c.ln,boxShadow:"0 12px 48px rgba(0,0,0,.25)",zIndex:95,display:"flex",flexDirection:"column",overflow:"hidden",animation:"pop .2s ease"}}>
          {/* Header */}
          <div style={{padding:"14px 16px",background:"linear-gradient(135deg,#F4A261,#E76F8B)",display:"flex",alignItems:"center",gap:10}}>
            <Bloom sz={34}/>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>Bloomie</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.8)"}}>Support Assistant</div>
            </div>
            <button onClick={()=>setHlpO(false)} style={{width:28,height:28,borderRadius:"50%",border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.15)",cursor:"pointer",color:"#fff",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {/* Messages */}
          <div style={{flex:1,overflowY:"auto",padding:12}} ref={()=>{setTimeout(()=>blmEndRef.current?.scrollIntoView({behavior:"smooth"}),50);}}>
            {blmMsgs.length===0&&(
              <div style={{textAlign:"center",padding:"32px 16px"}}>
                <div style={{fontSize:14,fontWeight:600,color:c.tx,marginBottom:6}}>Hey! I'm Bloomie</div>
                <div style={{fontSize:12,color:c.so,lineHeight:1.6}}>Ask me anything — troubleshoot issues, create tickets, or get help with your Bloomie employees.</div>
              </div>
            )}
            {blmMsgs.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
                <div style={{maxWidth:"82%",padding:"9px 13px",borderRadius:12,background:m.role==="user"?"linear-gradient(135deg,#F4A261,#E76F8B)":c.sf,color:m.role==="user"?"#fff":c.tx,border:m.role==="user"?"none":"1px solid "+c.ln,fontSize:13,lineHeight:1.55,whiteSpace:"pre-wrap"}}>{m.text}</div>
              </div>
            ))}
            {blmLoading&&(
              <div style={{display:"flex",marginBottom:10}}>
                <div style={{padding:"9px 13px",borderRadius:12,background:c.sf,border:"1px solid "+c.ln,fontSize:12,color:c.so}}>
                  <span style={{animation:"pulse 1.2s ease infinite"}}>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={blmEndRef}/>
          </div>
          {/* Input */}
          <div style={{padding:"8px 12px",borderTop:"1px solid "+c.ln,display:"flex",gap:6,background:c.cd}}>
            <input ref={blmInputRef} value={blmInput} onChange={e=>setBlmInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey)sendBloomie();}} placeholder="Ask Bloomie..." style={{flex:1,padding:"9px 12px",borderRadius:8,border:"1px solid "+c.ln,background:c.inp,color:c.tx,fontSize:13,outline:"none"}}/>
            <button onClick={sendBloomie} disabled={blmLoading||!blmInput.trim()} style={{padding:"9px 14px",borderRadius:8,border:"none",background:blmInput.trim()?"linear-gradient(135deg,#F4A261,#E76F8B)":c.ln,color:"#fff",fontSize:12,fontWeight:600,cursor:blmInput.trim()?"pointer":"default",opacity:blmLoading?.6:1}}>Send</button>
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
