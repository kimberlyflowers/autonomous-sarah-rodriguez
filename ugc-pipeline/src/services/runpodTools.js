const fetch = require('node-fetch');

function normalizeKey(kind) {
  return String(kind || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function getRunpodToolConfig(kind) {
  const key = normalizeKey(kind);
  return {
    endpointId: process.env[`RUNPOD_${key}_ENDPOINT_ID`] || '',
    endpointUrl: process.env[`RUNPOD_${key}_ENDPOINT_URL`] || '',
    apiKey: process.env[`RUNPOD_${key}_API_KEY`] || process.env.RUNPOD_API_KEY || '',
    timeoutMs: Number(process.env[`RUNPOD_${key}_TIMEOUT_MS`] || process.env.RUNPOD_TOOL_TIMEOUT_MS || 900000),
    pollIntervalMs: Number(process.env[`RUNPOD_${key}_POLL_INTERVAL_MS`] || process.env.RUNPOD_TOOL_POLL_INTERVAL_MS || 4000)
  };
}

function endpointRoot(config) {
  if (config.endpointUrl) {
    return config.endpointUrl
      .replace(/\/runsync(?:\?.*)?$/i, '')
      .replace(/\/run(?:\?.*)?$/i, '')
      .replace(/\/status\/?[^/?]*(?:\?.*)?$/i, '')
      .replace(/\/$/, '');
  }
  return `https://api.runpod.ai/v2/${config.endpointId}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runServerlessTool(kind, input, label = kind) {
  const config = getRunpodToolConfig(kind);
  if (!config.apiKey) throw new Error(`RunPod API key is not configured for ${label}.`);
  if (!config.endpointId && !config.endpointUrl) throw new Error(`RunPod endpoint ID is not configured for ${label}.`);

  const root = endpointRoot(config);
  const response = await fetch(`${root}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input }),
    timeout: 45000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `${label} run request failed: ${response.status}`);
  if (data.status === 'COMPLETED') return data;
  if (!data.id) throw new Error(`${label} /run did not return a job id: ${JSON.stringify(data)}`);
  return pollServerlessTool(config, data.id, label);
}

async function pollServerlessTool(config, jobId, label) {
  const root = endpointRoot(config);
  const startedAt = Date.now();
  let lastStatus = 'IN_QUEUE';
  while (Date.now() - startedAt < config.timeoutMs) {
    const response = await fetch(`${root}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      timeout: 45000
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.detail || `${label} status request failed: ${response.status}`);
    lastStatus = data.status || lastStatus;
    if (lastStatus === 'COMPLETED') return data;
    if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(lastStatus)) {
      throw new Error(data.error || data.detail || `${label} job ${jobId} ended with ${lastStatus}`);
    }
    await sleep(config.pollIntervalMs);
  }
  throw new Error(`${label} job ${jobId} timed out after ${Math.round(config.timeoutMs / 1000)}s. Last status: ${lastStatus}`);
}

function getOutput(data) {
  return data?.output || data || {};
}

async function downloadSourceVideo(url, options = {}) {
  const data = await runServerlessTool('DOWNLOADER', {
    url,
    format: options.format || 'mp4',
    max_duration: options.maxDuration || 180,
    audio_only: !!options.audioOnly
  }, 'Video downloader');
  const output = getOutput(data);
  const resultUrl = output.url || output.video_url || output.audio_url || output.result || '';
  if (!resultUrl) throw new Error(`Downloader completed but did not return a URL. Raw output: ${JSON.stringify(output).slice(0, 400)}`);
  return { url: resultUrl, raw: data };
}

async function transcribeAudio(audioUrl, options = {}) {
  const data = await runServerlessTool('FASTER_WHISPER', {
    audio: audioUrl,
    model: options.model || 'turbo',
    transcription: options.transcription || 'plain_text',
    translate: !!options.translate,
    language: options.language || null,
    enable_vad: options.enableVad ?? true,
    word_timestamps: !!options.wordTimestamps
  }, 'Faster Whisper');
  const output = getOutput(data);
  const text = output.transcription || output.text || output.formatted_text || output.result || '';
  if (!text) throw new Error(`Faster Whisper completed but did not return transcription text. Raw output: ${JSON.stringify(output).slice(0, 400)}`);
  return { text, raw: data };
}

module.exports = {
  downloadSourceVideo,
  getRunpodToolConfig,
  transcribeAudio
};
