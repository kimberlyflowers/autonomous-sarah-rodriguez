// ── ElevenLabs TTS helper ─────────────────────────────────────────────────────
import { createLogger } from '../logging/logger.js';
const logger = createLogger('tts');

export async function generateSpeech(text, agentConfig) {
  try {
    const voiceId = agentConfig?.voiceId;
    if (!voiceId || !process.env.ELEVENLABS_API_KEY) return null;

    // Strip markdown and code blocks, keep under 4500 chars
    const clean = text
      .replace(/\[.*?\]/gs, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim()
      .slice(0, 4500);
    if (!clean) return null;

    const model = agentConfig.elevenlabsModel || 'eleven_multilingual_v2';
    const stability = agentConfig.voiceStability ?? 0.5;
    const similarity = agentConfig.voiceSimilarity ?? 0.75;

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: clean,
        model_id: model,
        voice_settings: { stability, similarity_boost: similarity }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      logger.warn('ElevenLabs TTS error', { status: res.status, err: err.slice(0, 200) });
      return null;
    }

    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    return `data:audio/mpeg;base64,${b64}`;
  } catch (e) {
    logger.warn('TTS generation failed', { error: e.message });
    return null;
  }
}
