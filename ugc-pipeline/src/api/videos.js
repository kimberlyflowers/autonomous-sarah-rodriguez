const express = require('express');
const path = require('path');
const fs = require('fs');
const { getAllJobs, getJob, getJobsByBatch, pollJob } = require('../services/poller');

const router = express.Router();

// List all videos / jobs
router.get('/', (req, res) => {
  const jobs = getAllJobs();
  const { status, batchId } = req.query;

  let filtered = jobs;
  if (status) filtered = filtered.filter(j => j.status === status);
  if (batchId) filtered = filtered.filter(j => j.batchId === batchId);

  res.json({
    total: filtered.length,
    completed: filtered.filter(j => j.status === 'completed').length,
    pending: filtered.filter(j => j.status === 'pending' || j.status === 'processing').length,
    failed: filtered.filter(j => j.status === 'failed').length,
    videos: filtered
  });
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
  const jobs = getAllJobs().filter(j => j.status === 'pending' || j.status === 'processing');
  const results = [];
  for (const job of jobs) {
    const updated = await pollJob(job.requestId);
    results.push(updated);
  }
  res.json({ polled: results.length, results });
});

// List generated video files
router.get('/files/local', (req, res) => {
  const dir = path.join(__dirname, '..', '..', 'assets', 'generated');
  if (!fs.existsSync(dir)) return res.json({ files: [] });

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.mp4'))
    .map(f => ({
      name: f,
      path: `/assets/generated/${f}`,
      size: fs.statSync(path.join(dir, f)).size,
      modified: fs.statSync(path.join(dir, f)).mtime
    }))
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));

  res.json({ files });
});

module.exports = router;
