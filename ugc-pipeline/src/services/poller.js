const { checkStatus, downloadVideo } = require('./seedance');
const { checkInfiniteTalkHdJob } = require('./infinitetalkHd');
const { checkRunpodVideoJob } = require('./runpodVideo');
const { logger } = require('./logger');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { downloadWithYtDlp } = require('./localDownloader');

// In-memory job tracking
const jobs = new Map();

function addJob(requestId, metadata) {
  jobs.set(requestId, {
    requestId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null,
    videoUrl: null,
    localPath: null,
    error: null,
    ...metadata
  });
}

function safeFilePart(value = '') {
  return String(value || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'campaign';
}

function writeVideoSidecar(videoPath, metadata = {}) {
  try {
    const sidecarPath = videoPath.replace(/\.mp4$/i, '.json');
    fs.writeFileSync(sidecarPath, JSON.stringify({
      ...metadata,
      sidecarUpdatedAt: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    logger.warn('Failed to write video sidecar metadata', { videoPath, error: error.message });
  }
}

async function writeDataUrlToTempFile(dataUrl = '', fileName = 'source-audio.mp3') {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Downloader did not return a data URL.');
  const ext = path.extname(fileName) || '.mp3';
  const outputPath = path.join(os.tmpdir(), `${Date.now()}-${safeFilePart(path.basename(fileName, ext))}${ext}`);
  await fs.promises.writeFile(outputPath, Buffer.from(match[2], 'base64'));
  return outputPath;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function maybeAssembleSceneBatch(batchId) {
  if (!batchId) return null;
  const sceneJobs = Array.from(jobs.values())
    .filter(job => job.batchId === batchId && job.format === 'trend-scene')
    .sort((a, b) => Number(a.sceneIndex || 0) - Number(b.sceneIndex || 0));
  if (!sceneJobs.length) return null;

  const assemblyId = `assembly-${batchId}`;
  const existing = jobs.get(assemblyId);
  if (existing && ['assembling', 'completed'].includes(existing.status)) return existing;
  if (sceneJobs.some(job => job.status === 'failed')) {
    jobs.set(assemblyId, {
      requestId: assemblyId,
      batchId,
      campaignId: sceneJobs[0].campaignId,
      variant: sceneJobs[0].characterName || 'campaign',
      format: 'trend-scene-assembly',
      status: 'failed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: 'One or more scene clips failed before assembly.',
      imagePreviewUrl: sceneJobs[0].imagePreviewUrl || '',
      sceneCount: sceneJobs.length,
      tenantId: sceneJobs[0].tenantId || 'default'
    });
    return jobs.get(assemblyId);
  }
  if (sceneJobs.some(job => job.status !== 'completed' || !job.localPath)) return null;

  const outputDir = path.join(__dirname, '..', '..', 'assets', 'generated');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${safeFilePart(sceneJobs[0].characterName || 'trend-campaign')}_${safeFilePart(batchId)}_assembled.mp4`;
  const outputPath = path.join(outputDir, filename);

  const assemblyJob = {
    requestId: assemblyId,
    batchId,
    campaignId: sceneJobs[0].campaignId,
    variant: `${sceneJobs[0].characterName || 'Campaign'} final`,
    format: 'trend-scene-assembly',
    prompt: sceneJobs[0].campaignPrompt || 'Assembled trend campaign scenes',
    status: 'assembling',
    createdAt: new Date().toISOString(),
    completedAt: null,
    videoUrl: null,
    localPath: null,
    error: null,
    imagePreviewUrl: sceneJobs[0].imagePreviewUrl || '',
    sceneCount: sceneJobs.length,
    aspectRatio: sceneJobs[0].aspectRatio || '9:16',
    sourceTrendId: sceneJobs[0].sourceTrendId || '',
    sourceTrendUrl: sceneJobs[0].sourceTrendUrl || '',
    sourceTrendTitle: sceneJobs[0].sourceTrendTitle || '',
    sourceTrendHook: sceneJobs[0].sourceTrendHook || '',
    sourceTrendThumbnail: sceneJobs[0].sourceTrendThumbnail || '',
    workflowSchema: sceneJobs[0].workflowSchema || '',
    frameWorkflowSchema: sceneJobs[0].frameWorkflowSchema || '',
    assemblyMethod: sceneJobs[0].assemblyMethod || 'concat_in_scene_order',
    preserveSourceTiming: Boolean(sceneJobs[0].preserveSourceTiming),
    tenantId: sceneJobs[0].tenantId || 'default'
  };
  jobs.set(assemblyId, assemblyJob);

  let audioInputPath = '';
  try {
    const args = ['-y'];
    const filterParts = [];
    const concatInputs = [];
    const totalDuration = sceneJobs.reduce((sum, job) => sum + Math.max(1, Number(job.targetDuration || job.sceneDuration || 5)), 0);
    sceneJobs.forEach((job, index) => {
      args.push('-i', path.join(__dirname, '..', '..', job.localPath.replace(/^\//, '')));
      const targetDuration = Math.max(1, Number(job.targetDuration || job.sceneDuration || 5));
      filterParts.push(`[${index}:v]trim=0:${targetDuration.toFixed(2)},setpts=PTS-STARTPTS[v${index}]`);
      concatInputs.push(`[v${index}]`);
    });
    const sourceTrendUrl = sceneJobs.find(job => job.sourceTrendUrl)?.sourceTrendUrl || '';
    if (sourceTrendUrl) {
      try {
        const audio = await downloadWithYtDlp(sourceTrendUrl, {
          audioOnly: true,
          maxDuration: Math.ceil(totalDuration + 2),
          timeoutMs: Number(process.env.LOCAL_DOWNLOADER_TIMEOUT_MS || 120000)
        });
        audioInputPath = await writeDataUrlToTempFile(audio.url, `${safeFilePart(batchId)}-trend-audio.mp3`);
        args.push('-i', audioInputPath);
      } catch (error) {
        logger.warn('Scene assembly could not attach source trend audio', { batchId, error: error.message });
      }
    }
    filterParts.push(`${concatInputs.join('')}concat=n=${sceneJobs.length}:v=1:a=0[outv]`);
    args.push('-filter_complex', filterParts.join(';'), '-map', '[outv]');
    if (audioInputPath) {
      args.push('-map', `${sceneJobs.length}:a:0`, '-c:a', 'aac', '-shortest', '-t', totalDuration.toFixed(2));
    } else {
      args.push('-an');
    }
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath);
    await runFfmpeg(args);
    assemblyJob.status = 'completed';
    assemblyJob.completedAt = new Date().toISOString();
    assemblyJob.localPath = `/assets/generated/${filename}`;
    assemblyJob.audioStatus = audioInputPath ? 'source-trend-audio' : 'silent';
    writeVideoSidecar(outputPath, assemblyJob);
    logger.info(`Scene batch ${batchId} assembled`, { filename });
  } catch (error) {
    assemblyJob.status = 'failed';
    assemblyJob.completedAt = new Date().toISOString();
    assemblyJob.error = `Assembly failed: ${error.message}`;
    logger.error(`Scene batch ${batchId} assembly failed`, { error: error.message });
  } finally {
    if (audioInputPath) {
      fs.promises.rm(audioInputPath, { force: true }).catch(() => {});
    }
  }
  jobs.set(assemblyId, assemblyJob);
  return assemblyJob;
}

function getJob(requestId) {
  return jobs.get(requestId) || null;
}

function getAllJobs() {
  return Array.from(jobs.values()).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getJobsByBatch(batchId) {
  return Array.from(jobs.values()).filter(j => j.batchId === batchId);
}

function getRunpodSceneProvider(job = {}) {
  if (job.provider === 'wan-animate') return { kind: 'WAN_ANIMATE', filePrefix: 'wan-animate', label: 'Wan Animate Serverless' };
  if (job.provider === 'wan22-serverless') return { kind: 'WAN22', filePrefix: 'wan22', label: 'Wan 2.2 Serverless' };
  return null;
}

async function pollRunpodSceneJob(job) {
  const outputDir = path.join(__dirname, '..', '..', 'assets', 'generated');

  if (job.provider === 'infinitetalk-hd') {
    const providerJobId = job.providerJobId || job.rawRequestId;
    if (!providerJobId) throw new Error('Scene job has no provider job id saved yet.');
    return checkInfiniteTalkHdJob(providerJobId, { outputDir });
  }

  const provider = getRunpodSceneProvider(job);
  if (!provider) return null;
  const providerJobId = job.providerJobId || job.rawRequestId;
  if (!providerJobId) throw new Error('Scene job has no provider job id saved yet.');
  return checkRunpodVideoJob(provider.kind, providerJobId, {
    outputDir,
    filePrefix: provider.filePrefix,
    provider: job.provider,
    label: provider.label
  });
}

async function pollJob(requestId) {
  const job = jobs.get(requestId);
  if (!job || job.status === 'failed') return job;
  if (job.status === 'completed' && job.localPath) return job;

  try {
    const runpodResult = await pollRunpodSceneJob(job);
    if (runpodResult) {
      if (runpodResult.status === 'COMPLETED') {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.localPath = runpodResult.localPath;
        job.rawRequestId = runpodResult.id || job.rawRequestId;
        logger.info(`RunPod scene job ${requestId} completed`, { provider: job.provider, localPath: job.localPath });
        await maybeAssembleSceneBatch(job.batchId);
      } else {
        job.status = String(runpodResult.status || 'processing').toLowerCase();
      }
      jobs.set(requestId, job);
      return job;
    }

    const result = await checkStatus(requestId);

    if (result.status === 'completed' && result.video_url) {
      const outputDir = path.join(__dirname, '..', '..', 'assets', 'generated');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const filename = `${job.brandSlug || 'video'}_${job.variant || 'v1'}_${requestId.slice(0, 8)}.mp4`;
      const outputPath = path.join(outputDir, filename);

      await downloadVideo(result.video_url, outputPath);

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.videoUrl = result.video_url;
      job.localPath = `/assets/generated/${filename}`;
      job.audioStatus = job.format === 'trend-scene' ? 'silent' : job.audioStatus;
      writeVideoSidecar(outputPath, job);
      logger.info(`Job ${requestId} completed`, { filename });
      await maybeAssembleSceneBatch(job.batchId);

    } else if (result.status === 'completed' && !result.video_url) {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      job.error = 'Provider marked the job complete but did not return a playable video URL.';
      logger.error(`Job ${requestId} completed without video URL`, { raw: result.raw });
      await maybeAssembleSceneBatch(job.batchId);

    } else if (result.status === 'failed') {
      job.status = 'failed';
      job.error = result.error || 'Generation failed';
      logger.error(`Job ${requestId} failed`, { error: job.error });
      await maybeAssembleSceneBatch(job.batchId);

    } else {
      job.status = result.status || 'processing';
    }

    jobs.set(requestId, job);
    return job;

  } catch (err) {
    logger.error(`Poll error for ${requestId}:`, err.message);
    if (job.provider && ['wan-animate', 'wan22-serverless', 'infinitetalk-hd'].includes(job.provider)) {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      job.error = err.message;
      jobs.set(requestId, job);
      await maybeAssembleSceneBatch(job.batchId);
    }
    return job;
  }
}

// Automatic polling - checks all pending jobs every 2 minutes
let pollInterval = null;

function startPolling(intervalMs = 120000) {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    const pending = Array.from(jobs.values()).filter(
      j => j.status === 'pending' || j.status === 'processing'
    );

    if (pending.length === 0) return;
    logger.info(`Polling ${pending.length} pending jobs...`);

    for (const job of pending) {
      await pollJob(job.requestId);
    }
  }, intervalMs);
  logger.info('Auto-polling started (every 2 min)');
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Start auto-polling on module load
startPolling();

module.exports = { addJob, getJob, getAllJobs, getJobsByBatch, pollJob, startPolling, stopPolling, maybeAssembleSceneBatch };
