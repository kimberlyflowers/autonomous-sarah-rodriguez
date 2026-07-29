import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(
  path.join(here, '..', 'dashboard', 'src', 'App.jsx'),
  'utf8'
);

test('app shell uses phone, compact laptop, and full desktop tiers', () => {
  assert.match(appSource, /const mob=W<768;/);
  assert.match(appSource, /const compact=W<1200;/);
  assert.match(appSource, /height:"100dvh",minHeight:0/);
});

test('compact laptops preserve chat by collapsing secondary panels', () => {
  assert.match(appSource, /useState\(compact\?"hidden":"docked"\)/);
  assert.match(appSource, /useState\(mob\?"closed":compact\?"mini":"full"\)/);
  assert.match(appSource, /\{!compact&&scrM!=="hidden"&&\(/);
  assert.match(appSource, /style=\{compact\?\{position:"absolute",inset:"0 auto 0 0",zIndex:50\}:\{\}\}/);
});

test('logo and overflow-safe navigation remain reachable at compact widths', () => {
  assert.match(appSource, /<Bloom sz=\{mob\?28:32\} glow\/>/);
  assert.match(appSource, /\{compact&&<button title="More navigation"/);
  assert.match(appSource, /maxWidth:"100vw",overflow:"visible"/);
});

test('mobile conversation menu uses a large accessible hamburger control', () => {
  assert.match(appSource, /aria-label="Open conversations menu"/);
  assert.match(appSource, /width:mob\?44:36,height:mob\?44:36/);
  assert.match(appSource, /width=\{mob\?26:21\} height=\{mob\?26:21\}/);
  assert.match(appSource, /strokeWidth=\{mob\?2\.6:2\.2\}/);
});

test('PWA chat and conversation drawer expose independent touch scroll regions', () => {
  assert.match(appSource, /data-testid="chat-message-scroll"/);
  assert.match(appSource, /data-testid="chat-message-scroll"[\s\S]{0,260}minHeight:0[\s\S]{0,260}touchAction:"pan-y"/);
  assert.match(appSource, /data-testid="sidebar-scroll-region"[\s\S]{0,260}touchAction:"pan-y"/);
  assert.match(appSource, /overscrollBehaviorY:"contain"/);
});

test('Work sessions share the live browser, files, and selected agent identity', () => {
  assert.match(appSource, /data-testid="work-live-workspace"/);
  assert.match(appSource, />Live<\/button>/);
  assert.match(appSource, />Browser<\/button>/);
  assert.match(appSource, /tab==='live'[\s\S]{0,180}<LiveAvatarPanel/);
  assert.match(appSource, /tab==='browser'[\s\S]{0,180}<Screen/);
  assert.match(appSource, /<SessionFilesPanel[\s\S]{0,180}sessionId=\{sessionId\}/);
  assert.match(appSource, /function WorkTab\(\{c,mob,aFN="Bloomie",agentId="",agent=null/);
  assert.match(appSource, /<Face sz=\{34\} agent=\{agent\}\/>/);
  assert.match(appSource, /pg==="work"[\s\S]{0,180}agent=\{agent\}/);
});

test('Work sessions reuse the primary sidebar instead of adding another desktop column', () => {
  assert.match(appSource, /data-testid="sidebar-work-sessions"/);
  assert.match(appSource, /pg==="work"&&\(\s*<WorkSessionsSidebar/);
  assert.match(appSource, /requestedSessionId=\{activeWorkSessionId\}/);
  assert.match(appSource, /\{false&&!mob&&\(\s*<div style=\{\{width:260/);
  assert.match(appSource, /\{pg==="work"\?"New Work session":"New chat"\}/);
});

test('Work conversation uses real participant images and the Chat plus-menu options', () => {
  assert.match(appSource, /function ManagedMessage\(\{message,c,aFN="Bloomie",agent=null,user=null\}/);
  assert.match(appSource, /!isUser&&<Face sz=\{30\} agent=\{agent/);
  assert.match(appSource, /isUser&&<Face sz=\{30\} agent=\{user/);
  assert.match(appSource, /data-testid="work-plus-menu"/);
  for (const label of ['Add files or photos','Take a screenshot','Build a website','New work task','Manage connectors']) {
    assert.ok(appSource.includes(label), `Work plus menu should include ${label}`);
  }
  assert.match(appSource, /user=\{\{nm:meDisplayName\|\|"You",img:userImg\|\|null/);
});

test('Work Live Browser and Files panel is resizable like Chat', () => {
  assert.match(appSource, /<ResizablePanel c=\{c\} defaultWidth=\{430\} minWidth=\{300\} maxWidth=\{800\}>[\s\S]{0,180}<WorkWorkspacePanel/);
  assert.match(appSource, /mob\s*\? \{position:'fixed',inset:0,zIndex:9050\}\s*: \{width:'100%',height:'100%',flex:1\}/);
});

test('Work right workspace collapses on desktop and remains reachable on mobile', () => {
  assert.match(appSource, /const \[workspaceOpen,setWorkspaceOpen\]=useState\(true\)/);
  assert.match(appSource, /\{!mob&&workspaceOpen&&\(\s*<ResizablePanel/);
  assert.match(appSource, /onClose=\{\(\)=>setWorkspaceOpen\(false\)\}/);
  assert.match(appSource, /aria-label="Collapse Work workspace"[\s\S]{0,400}<path d="M6 3l5 5-5 5"/);
  assert.match(appSource, /aria-label="Show Work workspace"/);
  assert.match(appSource, /aria-label="Open Work live workspace"/);
  assert.match(appSource, /Live · Browser · Files/);
});
