const fetch = require('node-fetch');
const { logger } = require('./logger');

function cleanBaseUrl(value) {
  return String(value || '').replace(/\/$/, '');
}

function getRunPodConfig() {
  const apiKey = process.env.RUNPOD_API_KEY || '';
  const podId = process.env.RUNPOD_POD_ID || '';
  const port = process.env.RUNPOD_COMFYUI_PORT || '8188';
  const baseUrl = cleanBaseUrl(process.env.COMFYUI_BASE_URL || process.env.RUNPOD_COMFYUI_URL || '');
  const derivedBaseUrl = podId ? `https://${podId}-${port}.proxy.runpod.net` : '';
  return {
    apiKey,
    podId,
    port,
    baseUrl: baseUrl || derivedBaseUrl,
    autoStartConfigured: !!(apiKey && podId)
  };
}

async function isComfyReady(baseUrl) {
  if (!baseUrl) return false;
  try {
    const response = await fetch(`${cleanBaseUrl(baseUrl)}/system_stats`, { timeout: 8000 });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function startPod() {
  const { apiKey, podId } = getRunPodConfig();
  if (!apiKey || !podId) {
    throw new Error('RunPod auto-start needs RUNPOD_API_KEY and RUNPOD_POD_ID on Railway.');
  }

  const response = await fetch(`https://rest.runpod.io/v1/pods/${podId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RunPod start failed: ${response.status} ${text}`);
  }

  logger.info('RunPod pod start requested', { podId });
  return response.json().catch(() => ({ id: podId, desiredStatus: 'RUNNING' }));
}

async function getPodStatus() {
  const { apiKey, podId } = getRunPodConfig();
  if (!apiKey || !podId) return { configured: false, desiredStatus: 'unconfigured' };

  const response = await fetch(`https://rest.runpod.io/v1/pods/${podId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RunPod status failed: ${response.status} ${text}`);
  }
  const pod = await response.json();
  return {
    configured: true,
    id: pod.id,
    name: pod.name,
    desiredStatus: pod.desiredStatus || pod.status || 'unknown',
    machineId: pod.machineId || null,
    ports: pod.ports || []
  };
}

function normalizePodState(status, comfyReady = false) {
  const raw = String(status?.desiredStatus || '').toUpperCase();
  if (comfyReady) return 'running';
  if (['RUNNING'].includes(raw)) return 'booting';
  if (['EXITED', 'STOPPED'].includes(raw)) return 'stopped';
  if (['PENDING', 'STARTING', 'CREATED'].includes(raw)) return 'starting';
  return raw ? raw.toLowerCase() : 'unknown';
}

async function stopPod() {
  const { apiKey, podId } = getRunPodConfig();
  if (!apiKey || !podId) {
    throw new Error('RunPod stop needs RUNPOD_API_KEY and RUNPOD_POD_ID on Railway.');
  }

  const response = await fetch(`https://rest.runpod.io/v1/pods/${podId}/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RunPod stop failed: ${response.status} ${text}`);
  }

  logger.info('RunPod pod stop requested', { podId });
  return response.json().catch(() => ({ id: podId, desiredStatus: 'STOPPED' }));
}

async function getAccountBalance() {
  const { apiKey } = getRunPodConfig();
  if (!apiKey) throw new Error('RunPod balance needs RUNPOD_API_KEY on Railway.');

  const response = await fetch('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `query BloomStudioRunPodBalance {
        myself {
          id
          clientBalance
          currentSpendPerHr
          underBalance
          minBalance
        }
      }`
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errors?.length) {
    throw new Error(data.errors?.[0]?.message || `RunPod balance failed: ${response.status}`);
  }

  const account = data.data?.myself || {};
  return {
    balance: account.clientBalance,
    currentSpendPerHr: account.currentSpendPerHr,
    underBalance: account.underBalance,
    minBalance: account.minBalance
  };
}

async function ensureComfyReady() {
  const config = getRunPodConfig();
  const waitMs = Number(process.env.RUNPOD_WAKE_TIMEOUT_MS || 1000 * 60 * 8);
  const intervalMs = Number(process.env.RUNPOD_WAKE_POLL_MS || 10000);

  if (await isComfyReady(config.baseUrl)) {
    return { ready: true, started: false, baseUrl: config.baseUrl };
  }

  if (!config.autoStartConfigured) {
    throw new Error('ComfyUI is not reachable. Add RUNPOD_API_KEY and RUNPOD_POD_ID so Bloom Studio can start the pod automatically.');
  }

  await startPod();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    if (await isComfyReady(config.baseUrl)) {
      return { ready: true, started: true, baseUrl: config.baseUrl };
    }
  }

  throw new Error('RunPod was started, but ComfyUI did not become ready before the wake timeout.');
}

module.exports = {
  ensureComfyReady,
  getAccountBalance,
  getRunPodConfig,
  getPodStatus,
  isComfyReady,
  normalizePodState,
  startPod,
  stopPod
};
