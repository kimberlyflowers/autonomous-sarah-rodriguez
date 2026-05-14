const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { CHATTERBOX_VOICES, createChatterboxAudio, getChatterboxConfig } = require('../services/chatterbox');

const router = express.Router();
const ROOT_DIR = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'assets', 'tts');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tenantId = req.tenant?.slug || req.tenant?.id || 'default';
      const dir = path.join(UPLOAD_DIR, tenantId, uuidv4());
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.wav';
      cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/providers', (req, res) => {
  const chatterbox = getChatterboxConfig();
  res.json({
    providers: [
      {
        id: 'chatterbox',
        label: 'Chatterbox Turbo',
        available: !!chatterbox.apiKey,
        endpointId: chatterbox.endpointId,
        voices: CHATTERBOX_VOICES,
        customVoice: {
          field: 'voice_url',
          note: 'Use a public URL to a short voice reference audio file, or upload a sample and Bloom Studio will host it before calling RunPod.'
        }
      }
    ]
  });
});

router.post('/chatterbox', upload.single('voiceSample'), async (req, res) => {
  try {
    const dir = path.join(UPLOAD_DIR, req.tenant?.slug || req.tenant?.id || 'default', 'generated');
    const result = await createChatterboxAudio({
      script: req.body.script,
      voice: req.body.voice,
      voiceUrl: req.body.voiceUrl,
      voiceSamplePath: req.file?.path || null,
      format: req.body.format,
      outputDir: dir
    });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
