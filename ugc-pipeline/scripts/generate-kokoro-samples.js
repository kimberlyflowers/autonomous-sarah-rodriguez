#!/usr/bin/env node
/**
 * Generates all Kokoro voice samples locally using kokoro-js (no RunPod, no Python).
 * Output: public/audio/kokoro-samples/<voice_id>.wav
 * After running: git add public/audio/kokoro-samples/ && git commit && git push
 */

const fs   = require('fs');
const path = require('path');

const SAMPLE_TEXT = 'Welcome to Bloom Studio. This is my voice. Type your script to get started.';
const OUT_DIR     = path.join(__dirname, '../public/audio/kokoro-samples');
const CONCURRENCY = 2;

// All 52 Kokoro voice IDs (from src/services/kokoro.js)
const VOICE_IDS = [
  'af_heart','af_sarah','af_bella','af_nicole','af_sky','af_nova','af_alloy',
  'af_jessica','af_river','af_kore','af_aoede',
  'am_michael','am_adam','am_echo','am_liam','am_onyx','am_orion','am_eric',
  'am_fenrir','am_puck','am_santa',
  'bf_emma','bf_alice','bf_isabella','bf_lily',
  'bm_george','bm_daniel','bm_lewis','bm_fable',
  'ff_siwis','fm_gaston',
  'jf_nezuko','jf_alpha','jf_gongitsune','jf_tebukuro','jm_kumo',
  'kf_alpha','km_alpha',
  'ef_dora','em_alex',
  'zf_xiaobei','zf_xiaoni','zf_xiaoxiao','zf_xiaoyi','zm_yunjian','zm_yunxi','zm_yunxia','zm_yunyang',
  'pf_dora','pm_alex',
  'af_storm','af_river'
];
const UNIQUE_IDS = [...new Set(VOICE_IDS)];

async function generateVoice(tts, voiceId) {
  const outPath = path.join(OUT_DIR, `${voiceId}.wav`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
    process.stdout.write(`  SKIP  ${voiceId}\n`);
    return 'skipped';
  }
  try {
    const audio = await tts.generate(SAMPLE_TEXT, { voice: voiceId });
    await audio.save(outPath);
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    process.stdout.write(`  DONE  ${voiceId.padEnd(18)} ${kb}KB\n`);
    return 'done';
  } catch (err) {
    process.stdout.write(`  FAIL  ${voiceId}: ${err.message}\n`);
    return 'failed';
  }
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  process.stdout.write(`Loading Kokoro model (downloads ~300MB on first run)...\n`);
  const { KokoroTTS } = require('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8'
  });
  process.stdout.write(`Model ready. Generating ${UNIQUE_IDS.length} samples...\n\n`);

  const results = { done: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < UNIQUE_IDS.length; i += CONCURRENCY) {
    const batch = UNIQUE_IDS.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(id => generateVoice(tts, id)));
    batchResults.forEach(r => results[r]++);
    process.stdout.write(`Progress: ${Math.min(i + CONCURRENCY, UNIQUE_IDS.length)}/${UNIQUE_IDS.length}\n`);
  }

  process.stdout.write(`\nDone: ${results.done} generated, ${results.skipped} skipped, ${results.failed} failed\n`);
  process.stdout.write(`\nNext: git add public/audio/kokoro-samples/ && git commit -m "Add pre-generated Kokoro voice samples" && git push\n`);
})();
