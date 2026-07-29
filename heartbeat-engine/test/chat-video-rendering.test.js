import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'dashboard', 'src', 'App.jsx'), 'utf8');

test('completed Bloom Studio links render as playable in-chat video', () => {
  assert.match(source, /function isPlayableVideoUrl/);
  assert.match(source, /\\\.\(mp4\|webm\|mov\)/);
  assert.match(source, /\/api\\\/public\\\/video\\\//);
  assert.match(source, /<video[\s\S]*controls[\s\S]*playsInline[\s\S]*preload="metadata"/);
});

test('completed media replaces its temporary processing card', () => {
  assert.match(source, /const currentMediaReady=/);
  assert.match(source, /pendingMediaKind=m\.b&&!currentMediaReady/);
  assert.doesNotMatch(source, /render\(\?:ing\)\?/);
  assert.match(source, /if\(pendingMediaKind&&laterMediaReady\) return null/);
});

test('live status updates do not remount an active media player', () => {
  assert.match(source, /const c=useMemo\(\(\)=>mk\(dark\),\[dark\]\)/);
  assert.match(source, /const chatMarkdownComponents=useMemo/);
  assert.match(source, /components=\{chatMarkdownComponents\}/);
});

test('media mentions do not falsely show a rendering card', () => {
  assert.match(source, /const hasCreationIntent=/);
  assert.match(source, /if\(!hasCreationIntent\) return null/);
});

test('image and video processing previews use a tight centered wrapper', () => {
  assert.match(source, /data-testid="media-processing-card"/);
  assert.match(source, /width:"min\(100%, 420px\)"/);
  assert.match(source, /maxWidth:420/);
  assert.match(source, /margin:"8px auto 12px"/);
  assert.match(source, /data-testid="media-processing-preview"/);
  assert.match(source, /aspectRatio:"16 \/ 9",display:"flex",alignItems:"center",justifyContent:"center"/);
  assert.match(source, /flex:requestedMediaKind[\s\S]*"0 1 456px"/);
});

test('Chat, Work, and alternate chat surfaces share the media-link renderer', () => {
  const uses = source.match(/<MarkdownMediaLink href=\{href\}/g) || [];
  assert.ok(uses.length >= 3, `expected the renderer in three chat surfaces, found ${uses.length}`);
});

test('images, audio, video, and document deliverables render inline in chat', () => {
  assert.match(source, /function MarkdownInlineImage/);
  assert.match(source, /<audio[\s\S]*controls[\s\S]*preload="metadata"/);
  assert.match(source, /function isDeliverableFileUrl/);
  const inlineImages = source.match(/<MarkdownInlineImage src=\{src\} alt=\{alt\}\/>/g) || [];
  assert.ok(inlineImages.length >= 2, `expected shared inline images in managed chat surfaces, found ${inlineImages.length}`);
  assert.match(source, /img:\(\{src,alt\}\)=><img[\s\S]*setChatLightbox/);
});
