import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { resolveVideoPlanTier } from './video-mcp-tools.js';
import { broadcastToClients } from '../api/events.js';

const MCP_URL = process.env.UGC_PIPELINE_MCP_URL
  || 'https://ugc-pipeline-mcp-production.up.railway.app/mcp';
const VIDEO_INPUT_BUCKET = 'bloom-video-inputs';
const VIDEO_INPUT_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'image/jpeg'];

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureVideoInputBucket(storage) {
  const { data: bucket } = await storage.storage.getBucket(VIDEO_INPUT_BUCKET);
  if (!bucket) {
    const { error } = await storage.storage.createBucket(VIDEO_INPUT_BUCKET, {
      public: true,
      fileSizeLimit: 25 * 1024 * 1024,
      allowedMimeTypes: VIDEO_INPUT_MIME_TYPES,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
    return;
  }
  const allowed = bucket.allowed_mime_types || [];
  if (VIDEO_INPUT_MIME_TYPES.some(type => !allowed.includes(type))) {
    const { error } = await storage.storage.updateBucket(VIDEO_INPUT_BUCKET, {
      public: true,
      fileSizeLimit: 25 * 1024 * 1024,
      allowedMimeTypes: VIDEO_INPUT_MIME_TYPES,
    });
    if (error) throw error;
  }
}

async function mcpCall(name, args) {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Bloom Studio ${response.status}: ${raw.slice(0, 240)}`);
  const payloadText = response.headers.get('content-type')?.includes('text/event-stream')
    ? raw.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim()
    : raw;
  const payload = JSON.parse(payloadText || '{}');
  if (payload.error) throw new Error(payload.error.message || 'Bloom Studio MCP error');
  const text = payload.result?.content?.find(item => item.type === 'text')?.text || '';
  if (/^Failed:/i.test(text)) throw new Error(text.replace(/^Failed:\s*/i, ''));
  try { return JSON.parse(text); } catch { return { message: text }; }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function normalizeBloomStudioJob(job, requestId = null) {
  const root = job?.job || job?.result || job || {};
  const rawStatus = String(
    root.status || root.state || root.jobStatus || root.job_status || 'pending'
  ).toLowerCase();
  const status = ['completed', 'complete', 'ready', 'succeeded', 'success'].includes(rawStatus)
    ? 'ready'
    : ['failed', 'error', 'cancelled', 'canceled'].includes(rawStatus)
      ? 'failed'
      : 'pending';
  const serialized = JSON.stringify(root);
  const urls = serialized.match(/https?:\\?\/\\?\/[^"\\\s]+/g) || [];
  const videoUrl = (
    root.videoUrl || root.video_url || root.outputUrl || root.output_url ||
    root.url || root.output?.videoUrl || root.output?.video_url ||
    urls.find(url => /\.mp4(?:\?|$)|\/api\/public\/video\//i.test(url))
  )?.replaceAll('\\/', '/') || null;
  return {
    success: status !== 'failed',
    requestId: requestId || root.requestId || root.request_id || null,
    status,
    pending: status === 'pending',
    terminal: status !== 'pending',
    videoUrl,
    error: status === 'failed' ? (root.error || root.message || 'Bloom Studio render failed.') : null,
    job: root,
  };
}

async function checkBloomStudioJob(requestId, tenantSlug) {
  const job = await mcpCall('ugc_check_studio_job', { requestId, tenantSlug });
  return normalizeBloomStudioJob(job, requestId);
}

export async function pollBloomStudioJob(requestId, tenantSlug, {
  timeoutMs = 20_000,
  intervalMs = 4_000,
} = {}) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let result;
  do {
    result = await checkBloomStudioJob(requestId, tenantSlug);
    if (result.terminal || Date.now() >= deadline) return result;
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() <= deadline);
  return result;
}

let continuationTimer = null;
let continuationSweepRunning = false;

export async function sweepBloomStudioContinuations() {
  if (continuationSweepRunning) return { skipped: true };
  continuationSweepRunning = true;
  try {
    const db = supabase();
    const { data: checkpoints, error } = await db
      .from('agent_execution_checkpoints')
      .select('session_id, organization_id, agent_id, pending_jobs')
      .in('status', ['running', 'pending'])
      .limit(100);
    if (error) throw error;

    let completed = 0;
    for (const checkpoint of checkpoints || []) {
      const jobs = Array.isArray(checkpoint.pending_jobs) ? checkpoint.pending_jobs : [];
      for (const pendingJob of jobs) {
        const requestId = pendingJob?.requestId || pendingJob?.request_id;
        if (!requestId || pendingJob?.provider !== 'bloom_studio') continue;
        const result = await checkBloomStudioJob(requestId, checkpoint.organization_id);
        if (!result.terminal) continue;

        const { data: existing } = await db
          .from('messages')
          .select('id')
          .eq('session_id', checkpoint.session_id)
          .ilike('content', `%${requestId}%`)
          .limit(1);
        if (!existing?.length) {
          const { data: session } = await db
            .from('sessions')
            .select('user_id')
            .eq('id', checkpoint.session_id)
            .maybeSingle();
          const content = result.status === 'ready' && result.videoUrl
            ? `Your BLOOM Studio video is ready.\n\n[Watch or download the finished video](${result.videoUrl})\n\nRender reference: ${requestId}`
            : `The BLOOM Studio render failed with this exact error: ${result.error || 'Unknown render error'}\n\nRender reference: ${requestId}`;
          const { error: insertError } = await db.from('messages').insert({
            session_id: checkpoint.session_id,
            organization_id: checkpoint.organization_id,
            user_id: session?.user_id || null,
            agent_id: checkpoint.agent_id,
            role: 'assistant',
            content,
          });
          if (insertError) throw insertError;
        }
        const { error: updateError } = await db
          .from('agent_execution_checkpoints')
          .update({
            status: result.status,
            pending_jobs: jobs.filter(item => (item?.requestId || item?.request_id) !== requestId),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: result.error || null,
          })
          .eq('session_id', checkpoint.session_id);
        if (updateError) throw updateError;
        await db.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', checkpoint.session_id);
        broadcastToClients('new_message', {
          session_id: checkpoint.session_id,
          org_id: checkpoint.organization_id,
          agent_id: checkpoint.agent_id,
        });
        completed += 1;
      }
    }
    return { completed };
  } finally {
    continuationSweepRunning = false;
  }
}

export function startBloomStudioContinuationWorker({ intervalMs = 15_000 } = {}) {
  if (continuationTimer) return continuationTimer;
  sweepBloomStudioContinuations().catch(() => {});
  continuationTimer = setInterval(() => {
    sweepBloomStudioContinuations().catch(() => {});
  }, intervalMs);
  continuationTimer.unref?.();
  return continuationTimer;
}

async function getAgentMedia(agentId) {
  const { data, error } = await supabase()
    .from('agents')
    .select('avatar_url, voice_id, elevenlabs_model, voice_stability, voice_similarity')
    .eq('id', agentId)
    .maybeSingle();
  if (error) throw error;
  return data || {};
}

async function createVoiceover(script, agent, organizationId) {
  if (!agent.voice_id) throw new Error('This Bloomie does not have a saved voice ID.');
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('Bloom Studio voice generation is not configured.');
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(agent.voice_id)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: String(script).trim().slice(0, 4500),
      model_id: agent.elevenlabs_model || 'eleven_multilingual_v2',
      voice_settings: {
        stability: agent.voice_stability ?? 0.5,
        similarity_boost: agent.voice_similarity ?? 0.75,
      },
    }),
  });
  if (!response.ok) throw new Error(`Voice generation ${response.status}: ${(await response.text()).slice(0, 180)}`);
  const audio = Buffer.from(await response.arrayBuffer());
  const path = `video-inputs/${organizationId}/${crypto.randomUUID()}.mp3`;
  const storage = supabase();
  await ensureVideoInputBucket(storage);
  const { error } = await storage.storage.from(VIDEO_INPUT_BUCKET).upload(path, audio, {
    contentType: 'audio/mpeg',
    upsert: false,
  });
  if (error) throw error;
  return storage.storage.from(VIDEO_INPUT_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function normalizeReferenceImage(imageUrl, organizationId) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Reference image download ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const Jimp = (await import('jimp')).default;
  const image = await Jimp.read(source);
  // Bloom Studio landscape videos require an actual 16:9 source frame. Do not
  // stretch or center-crop portrait employee references: preserve the complete
  // person over a softened full-frame version of the same image.
  const frameWidth = 1280;
  const frameHeight = 720;
  const isExact16By9 = image.bitmap.width * frameHeight === image.bitmap.height * frameWidth;
  let normalizedImage;
  if (isExact16By9) {
    // A native 16:9 source already fills the video frame. Resize it directly;
    // never add the portrait-safe blurred surround to a full-frame source.
    normalizedImage = image.clone().resize(frameWidth, frameHeight);
  } else {
    const background = image.clone()
      .cover(frameWidth, frameHeight)
      .blur(22)
      .brightness(-0.12);
    const foreground = image.clone().scaleToFit(frameWidth - 80, frameHeight - 40);
    background.composite(
      foreground,
      Math.round((frameWidth - foreground.bitmap.width) / 2),
      Math.round((frameHeight - foreground.bitmap.height) / 2)
    );
    normalizedImage = background;
  }
  const normalized = await normalizedImage.quality(90).getBufferAsync(Jimp.MIME_JPEG);
  const storage = supabase();
  await ensureVideoInputBucket(storage);
  const path = `video-inputs/${organizationId}/${crypto.randomUUID()}.jpg`;
  const { error } = await storage.storage.from(VIDEO_INPUT_BUCKET).upload(path, normalized, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return storage.storage.from(VIDEO_INPUT_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function executeBloomStudioTool(name, params, organizationId, context = {}) {
  const tier = await resolveVideoPlanTier(organizationId);
  if (!['video_creator', 'video_pro'].includes(tier)) {
    return { success: false, upgradeRequired: true, error: 'Bloom Studio requires a paid video-enabled plan.' };
  }

  if (name === 'bloom_studio_check_job') {
    return pollBloomStudioJob(params.requestId, organizationId);
  }

  if (name === 'bloom_studio_list_characters') {
    return mcpCall('ugc_list_studio_characters', { tenantSlug: organizationId });
  }

  if (name === 'bloom_studio_list_assets') {
    return mcpCall('ugc_list_studio_assets', { tenantSlug: organizationId });
  }

  if (name === 'bloom_studio_generate_image') {
    return mcpCall('ugc_generate_studio_image', {
      prompt: params.prompt,
      aspectRatio: params.aspectRatio || '16:9',
      size: '1k',
      characterUrl: params.characterUrl,
      productUrl: params.productUrl,
      referenceUrls: params.referenceUrls || [],
      tenantSlug: organizationId,
    });
  }

  if (name === 'bloom_studio_generate_seedance') {
    return mcpCall('ugc_generate_seedance_video', {
      prompt: params.prompt,
      imageUrl: params.imageUrl,
      referenceImageUrls: params.referenceImageUrls || [],
      referenceVideoUrls: params.referenceVideoUrls || [],
      audioUrl: params.audioUrl,
      duration: params.duration || 5,
      resolution: params.resolution || '720p',
      model: params.model || 'seedance2-fast',
      aspectRatio: params.aspectRatio || '16:9',
      tenantSlug: organizationId,
    });
  }

  if (name === 'bloom_studio_check_seedance') {
    return mcpCall('ugc_check_status', { requestId: params.requestId, tenantSlug: organizationId });
  }

  if (name === 'bloom_studio_list_voices') {
    return mcpCall('ugc_list_studio_voices', { tenantSlug: organizationId });
  }

  if (name === 'bloom_studio_generate_voice') {
    return mcpCall('ugc_generate_studio_voice', {
      script: params.script,
      voiceId: params.voiceId,
      name: params.name,
      tenantSlug: organizationId,
    });
  }

  if (name === 'bloom_studio_generate_video') {
    if (!context.agentId) throw new Error('The active Bloomie identity could not be resolved.');
    const agent = await getAgentMedia(context.agentId);
    const sourceImageUrl = params.imageUrl || agent.avatar_url;
    if (!sourceImageUrl) throw new Error('This Bloomie does not have a saved reference image.');
    const imageUrl = await normalizeReferenceImage(sourceImageUrl, organizationId);
    const audioUrl = await createVoiceover(params.script, agent, organizationId);
    const requestId = `${organizationId}-${crypto.randomUUID()}`;
    const job = await mcpCall('ugc_generate_lipsync_video', {
      imageUrl,
      audioUrl,
      prompt: params.prompt || `Natural, friendly talking-head welcome from ${context.agentName || 'the Bloomie'}`,
      quality: params.quality || '720p',
      aspectRatio: params.aspectRatio || '16:9',
      requestId,
      tenantSlug: organizationId,
    });
    return {
      success: true,
      provider: 'bloom_studio',
      requestId,
      status: 'pending',
      pending: true,
      terminal: false,
      job,
    };
  }

  throw new Error(`Unknown Bloom Studio tool: ${name}`);
}
