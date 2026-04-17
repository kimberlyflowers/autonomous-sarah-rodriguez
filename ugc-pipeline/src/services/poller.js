const { checkStatus, downloadVideo } = require('./seedance');
const { logger } = require('./logger');
const path = require('path');
const fs = require('fs');

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

async function pollJob(requestId) {
  const job = jobs.get(requestId);
  if (!job || job.status === 'completed' || job.status === 'failed') return job;

  try {
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
      logger.info(`Job ${requestId} completed`, { filename });

    } else if (result.status === 'failed') {
      job.status = 'failed';
      job.error = result.error || 'Generation failed';
      logger.error(`Job ${requestId} failed`, { error: job.error });

    } else {
      job.status = result.status || 'processing';
    }

    jobs.set(requestId, job);
    return job;

  } catch (err) {
    logger.error(`Poll error for ${requestId}:`, err.message);
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

module.exports = { addJob, getJob, getAllJobs, getJobsByBatch, pollJob, startPolling, stopPolling };
