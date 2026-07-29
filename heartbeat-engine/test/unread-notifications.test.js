import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, '..', 'dashboard', 'src', 'App.jsx'), 'utf8');

test('conversation read state persists and the newest three chats are initially unread', () => {
  assert.match(appSource, /BLOOM_READ_STATE_KEY='bloomie-conversation-read-v1'/);
  assert.match(appSource, /seedConversationReads\('chat',sessions,3\)/);
  assert.match(appSource, /slice\(0,initialUnreadCount\)/);
  assert.match(appSource, /markConversationRead\('chat',sessionId\)/);
});

test('Chat and Work display accessible blue unread indicators', () => {
  assert.match(appSource, /aria-label="Unread message"/);
  assert.match(appSource, /aria-label="Unread Work response"/);
  assert.match(appSource, /background:"#3b82f6"/);
  assert.match(appSource, /background:'#3b82f6'/);
});

test('opening Chat and Work conversations clears unread state', () => {
  assert.match(appSource, /markConversationRead\('work',item\.id,item\.updated_at\);onSelect/);
  assert.match(appSource, /markConversationRead\('work',id,d\.build\?\.updated_at\|\|Date\.now\(\)\)/);
  assert.match(appSource, /window\.dispatchEvent\(new CustomEvent\('bloomie-read-state-changed'/);
});

test('response sound is unlocked by user action and plays a short two-tone chime', () => {
  assert.match(appSource, /function unlockBloomNotificationSound\(\)/);
  assert.match(appSource, /\[\[659\.25,0\],\[783\.99,\.09\]\]/);
  assert.ok((appSource.match(/unlockBloomNotificationSound\(\);/g)||[]).length >= 4);
  assert.match(appSource, /playBloomResponseSound\(\)/);
});

test('Work notification sound ignores progress and execution-event messages', () => {
  assert.match(appSource, /message\.metadata\?\.type!=='work_progress'/);
  assert.match(appSource, /message\.metadata\?\.type!=='execution_event'/);
  assert.match(appSource, /responseSignature!==lastAssistantMessageRef\.current/);
});
