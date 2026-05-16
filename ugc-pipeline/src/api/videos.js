const express = require('express');
const path = require('path');
const fs = require('fs');
const { getAllJobs, getJob, getJobsByBatch, pollJob } = require('../services/poller');
const { checkStatus, downloadVideo } = require('../services/seedance');

const router = express.Router();

function readVideoSidecar(videoPath) {
  const sidecarPath = videoPath.replace(/\.mp4$/i, '.json');
  if (!fs.existsSync(sidecarPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeVideoSidecar(videoPath, metadata = {}) {
  const sidecarPath = videoPath.replace(/\.mp4$/i, '.json');
  fs.writeFileSync(sidecarPath, JSON.stringify({
    ...metadata,
    sidecarUpdatedAt: new Date().toISOString()
  }, null, 2));
}

function listGeneratedVideoFiles() {
  const dir = path.join(__dirname, '..', '..', 'assets', 'generated');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.mp4'))
    .map(f => {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      const meta = readVideoSidecar(fullPath);
      return {
        ...meta,
        requestId: meta.requestId || `local-file-${f}`,
        jobId: meta.jobId || meta.requestId || `local-file-${f}`,
        name: meta.name || f,
        path: `/assets/generated/${f}`,
        localPath: `/assets/generated/${f}`,
        size: stat.size,
        modified: stat.mtime,
        createdAt: meta.createdAt || stat.mtime,
        completedAt: meta.completedAt || stat.mtime,
        status: 'completed',
        provider: meta.provider || 'generated-file',
        format: meta.format || 'generated-file',
        prompt: meta.prompt || f.replace(/\.mp4$/i, '').replace(/[_-]+/g, ' '),
        aspectRatio: meta.aspectRatio || '9:16'
      };
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

// List all videos / jobs
router.get('/', (req, res) => {
  const jobs = getAllJobs();
  const files = listGeneratedVideoFiles();
  const { status, batchId } = req.query;

  let filtered = jobs;
  if (status) filtered = filtered.filter(j => j.status === status);
  if (batchId) filtered = filtered.filter(j => j.batchId === batchId);
  if (!batchId) filtered = [...filtered, ...files];

  res.json({
    total: filtered.length,
    completed: filtered.filter(j => j.status === 'completed').length,
    pending: filtered.filter(j => j.status === 'pending' || j.status === 'processing').length,
    failed: filtered.filter(j => j.status === 'failed').length,
    videos: filtered
  });
});

// List generated video files
router.get('/files/local', (req, res) => {
  res.json({ files: listGeneratedVideoFiles() });
});

router.post('/recover-runpod-scenes', async (req, res) => {
  try {
    const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
    if (!jobs.length) return res.status(400).json({ error: 'jobs array required' });

    const outputDir = path.join(__dirname, '..', '..', 'assets', 'generated');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const results = [];
    for (const item of jobs) {
      const providerJobId = String(item.providerJobId || item.id || '').trim();
      if (!providerJobId) {
        results.push({ status: 'failed', error: 'Missing providerJobId' });
        continue;
      }
      const filename = String(item.filename || `${providerJobId}.mp4`)
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || `${providerJobId}.mp4`;
      const outputPath = path.join(outputDir, filename.endsWith('.mp4') ? filename : `${filename}.mp4`);
      let status = { status: 'completed', video_url: String(item.videoUrl || item.video_url || '').trim() };
      if (!status.video_url) {
        try {
          status = await checkStatus(`runpod_${providerJobId}`);
        } catch (error) {
          results.push({
            providerJobId,
            status: 'failed',
            error: `Provider status lookup failed and no direct videoUrl was supplied: ${error.message}`
          });
          continue;
        }
        if (status.status !== 'completed' || !status.video_url) {
          results.push({
            providerJobId,
            status: status.status,
            error: status.error || 'Provider job is not completed with a video URL yet.'
          });
          continue;
        }
      }
      await downloadVideo(status.video_url, outputPath);
      const localPath = `/assets/generated/${path.basename(outputPath)}`;
      writeVideoSidecar(outputPath, {
        ...item,
        requestId: item.requestId || `recovered-${providerJobId}`,
        jobId: item.jobId || `recovered-${providerJobId}`,
        provider: item.provider || 'runpod-seedance',
        format: item.format || 'trend-scene',
        localPath,
        videoUrl: status.video_url,
        status: 'completed',
        completedAt: new Date().toISOString(),
        aspectRatio: item.aspectRatio || '9:16',
        audioStatus: item.audioStatus || 'silent'
      });
      results.push({
        providerJobId,
        status: 'completed',
        localPath,
        videoUrl: status.video_url
      });
    }
    res.json({ recovered: results.filter(item => item.status === 'completed').length, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single job
router.get('/:requestId', (req, res) => {
  const job = getJob(req.params.requestId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Manually poll a job
router.post('/:requestId/poll', async (req, res) => {
  const job = await pollJob(req.params.requestId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Poll all pending jobs
router.post('/poll-all', async (req, res) => {
  const jobs = getAllJobs().filter(j =>
    j.status === 'pending' ||
    j.status === 'processing' ||
    (j.status === 'completed' && !j.localPath)
  );
  const results = [];
  for (const job of jobs) {
    const updated = await pollJob(job.requestId);
    results.push(updated);
  }
  res.json({ polled: results.length, results });
});

module.exports = router;
