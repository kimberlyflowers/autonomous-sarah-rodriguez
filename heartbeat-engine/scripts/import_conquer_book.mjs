import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const manuscriptPdf = '/Users/kimberlyflowersmini2/Documents/Codex/2026-07-23/create-a-linkedin-account-for-sarah/output/pdf/conquer-your-doubts-sarah-cover-complete.pdf';
const approvedCoverPdf = '/Users/kimberlyflowersmini2/claude-arcads/01_talking_head/assets/outputs/products petalcore beauty/conquer-your-doubts-approved-cover-6x9.pdf';
const coverPng = '/Users/kimberlyflowersmini2/Documents/Codex/2026-07-23/create-a-linkedin-account-for-sarah/tmp/pdfs/conquer-cover-01.png';
const extractor = '/Users/kimberlyflowersmini2/Documents/Codex/2026-07-23/create-a-linkedin-account-for-sarah/scripts/extract_conquer_book.py';

for (const file of [manuscriptPdf, approvedCoverPdf, coverPng, extractor]) {
  if (!fs.existsSync(file)) throw new Error(`Required import file is missing: ${file}`);
}
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BLOOM_ORG_ID', 'BLOOM_OWNER_USER_ID', 'AGENT_UUID']) {
  if (!process.env[key]) throw new Error(`Required environment value is missing: ${key}`);
}

const parsed = JSON.parse(execFileSync('python3', [extractor, manuscriptPdf], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
if (!Array.isArray(parsed.sections) || parsed.sections.length < 8) throw new Error('The manuscript section extraction did not produce the expected book structure.');

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const sessionId = randomUUID();
const now = new Date().toISOString();
const title = 'Conquer Your Doubts: A Guide to Unshakeable Confidence';

const { error: sessionError } = await client.from('sessions').insert({
  id: sessionId,
  user_id: process.env.BLOOM_OWNER_USER_ID,
  organization_id: process.env.BLOOM_ORG_ID,
  agent_id: process.env.AGENT_UUID,
  title: `📚 ${title}`,
  created_at: now,
  updated_at: now,
});
if (sessionError) throw sessionError;

async function uploadPublic(localPath, storagePath, contentType) {
  const bytes = fs.readFileSync(localPath);
  const { error } = await client.storage.from('bloom-artifacts').upload(storagePath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return {
    bytes,
    publicUrl: client.storage.from('bloom-artifacts').getPublicUrl(storagePath).data.publicUrl,
  };
}

const prefix = `book-imports/${process.env.BLOOM_ORG_ID}/${sessionId}`;
const uploadedCover = await uploadPublic(coverPng, `${prefix}/conquer-your-doubts-cover.png`, 'image/png');
const uploadedManuscript = await uploadPublic(manuscriptPdf, `${prefix}/conquer-your-doubts-complete.pdf`, 'application/pdf');
const uploadedCoverPdf = await uploadPublic(approvedCoverPdf, `${prefix}/conquer-your-doubts-approved-cover-6x9.pdf`, 'application/pdf');

const artifactBase = {
  organization_id: process.env.BLOOM_ORG_ID,
  created_by_user_id: process.env.BLOOM_OWNER_USER_ID,
  agent_id: process.env.AGENT_UUID,
  session_id: sessionId,
  published: true,
  bloomshield_registered: false,
};
const artifactRows = parsed.sections.map((section) => ({
  ...artifactBase,
  name: section.name,
  description: section.description,
  file_type: 'markdown',
  mime_type: 'text/markdown',
  content: section.content,
  file_size: Buffer.byteLength(section.content),
  floral_id: `bloom-import-${randomUUID()}`,
}));
artifactRows.push(
  {
    ...artifactBase,
    name: 'conquer-your-doubts-cover.png',
    description: 'Approved imported book cover',
    file_type: 'image',
    mime_type: 'image/png',
    storage_path: uploadedCover.publicUrl,
    file_size: uploadedCover.bytes.length,
    floral_id: `bloom-import-${randomUUID()}`,
  },
  {
    ...artifactBase,
    name: 'conquer-your-doubts-complete.pdf',
    description: 'Original uploaded complete book PDF',
    file_type: 'pdf',
    mime_type: 'application/pdf',
    storage_path: uploadedManuscript.publicUrl,
    file_size: uploadedManuscript.bytes.length,
    floral_id: `bloom-import-${randomUUID()}`,
  },
  {
    ...artifactBase,
    name: 'conquer-your-doubts-approved-cover-6x9.pdf',
    description: 'Approved print-ready 6x9 cover PDF',
    file_type: 'pdf',
    mime_type: 'application/pdf',
    storage_path: uploadedCoverPdf.publicUrl,
    file_size: uploadedCoverPdf.bytes.length,
    floral_id: `bloom-import-${randomUUID()}`,
  },
);

const { data: artifacts, error: artifactError } = await client
  .from('artifacts')
  .insert(artifactRows)
  .select('id,name,file_type,storage_path');
if (artifactError) throw artifactError;

const importedWordCount = parsed.sections
  .filter((section) => /^chapter-/i.test(section.name))
  .reduce((total, section) => total + section.content.trim().split(/\s+/).length, 0);
const { error: messageError } = await client.from('messages').insert({
  session_id: sessionId,
  organization_id: process.env.BLOOM_ORG_ID,
  user_id: process.env.BLOOM_OWNER_USER_ID,
  agent_id: process.env.AGENT_UUID,
  role: 'assistant',
  content: `Your uploaded book is ready to edit. I imported the title page, copyright page, table of contents, and ${parsed.sections.filter(section => /^chapter-/i.test(section.name)).length} chapters as separate editable sections. The original PDF and approved cover are preserved. Open any section in Preview & Edit and tell me what to revise.`,
});
if (messageError) throw messageError;

console.log(JSON.stringify({
  sessionId,
  title,
  sectionCount: parsed.sections.length,
  bodyWordCount: importedWordCount,
  coverUrl: uploadedCover.publicUrl,
  artifactCount: artifacts.length,
}));
