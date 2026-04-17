const express = require('express');
const { logger } = require('../services/logger');
const { getJob, pollJob } = require('../services/poller');

const router = express.Router();

// Webhook endpoint for Seedance 2 completion notifications
router.post('/seedance', (req, res) => {
  const { request_id, status, video_url, error } = req.body;

  logger.info('Webhook received', { request_id, status });

  if (request_id) {
    // Trigger a poll to update the job
    pollJob(request_id).catch(err =>
      logger.error('Webhook poll failed:', err.message)
    );
  }

  res.json({ received: true });
});

module.exports = router;
